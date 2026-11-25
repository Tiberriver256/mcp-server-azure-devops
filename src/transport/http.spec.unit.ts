import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import http from 'node:http';
import { describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  buildEffectiveHttpSessionConfig,
  buildStartupProbeConfig,
  createHttpServerFactory,
  createHttpWebhookHandler,
  shouldRequirePerRequestPat,
} from '../index.ts';
import { createAzureDevOpsServer } from '../server.ts';
import { AuthenticationMethod } from '../shared/auth/index.ts';
import { AzureDevOpsValidationError } from '../shared/errors/index.ts';
import { EventEngine, verifyWebhookAuth } from '../shared/events/index.ts';
import {
  HTTP_LOCKED_OUT_TOOLS,
  MAX_MCP_BODY_BYTES,
  MAX_WEBHOOK_BODY_BYTES,
} from './http-security.ts';
import { startStreamableHttpServer } from './http.ts';
import type { HttpServerFactoryOverrides } from './http.ts';

interface RawHttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
  json: unknown;
}

function sendHttpRequest(
  baseUrl: string,
  reqPath: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Buffer | Record<string, unknown>;
  } = {},
): Promise<RawHttpResponse> {
  const url = new URL(reqPath, baseUrl);
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { ...(options.headers ?? {}) };

  let payload: Buffer | undefined;
  if (options.body !== undefined) {
    if (Buffer.isBuffer(options.body)) {
      payload = options.body;
    } else if (typeof options.body === 'string') {
      payload = Buffer.from(options.body, 'utf8');
    } else {
      payload = Buffer.from(JSON.stringify(options.body), 'utf8');
      if (
        !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')
      ) {
        headers['Content-Type'] = 'application/json';
      }
    }
    if (
      !Object.keys(headers).some(
        (k) =>
          k.toLowerCase() === 'content-length' ||
          k.toLowerCase() === 'transfer-encoding',
      )
    ) {
      headers['Content-Length'] = String(payload.byteLength);
    }
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let receivedResponse = false;

    const req = http.request(
      {
        hostname: url.hostname,
        port: Number(url.port),
        path: `${url.pathname}${url.search}`,
        method,
        headers,
        agent: false,
      },
      (res) => {
        receivedResponse = true;
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          if (settled) {
            return;
          }
          settled = true;
          const text = Buffer.concat(chunks).toString('utf8');
          let json: unknown;
          try {
            json = text.trim() ? JSON.parse(text) : null;
          } catch {
            json = null;
          }
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            text,
            json,
          });
        });
        res.on('error', (err) => {
          if (!settled) {
            settled = true;
            reject(err);
          }
        });
      },
    );

    req.on('error', (err: NodeJS.ErrnoException) => {
      if (
        receivedResponse &&
        (err.code === 'EPIPE' ||
          err.code === 'ECONNRESET' ||
          err.code === 'ERR_STREAM_WRITE_AFTER_END')
      ) {
        return;
      }
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    if (payload) {
      req.end(payload);
    } else {
      req.end();
    }
  });
}

function makeInitBody(id = 1) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'unit-test-client', version: '1.0.0' },
    },
  };
}

function createTestMcpServer(overrides: HttpServerFactoryOverrides): Server {
  const server = new Server(
    { name: 'test-ado-mcp', version: '0.1.0' },
    { capabilities: { tools: {}, resources: { subscribe: true } } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'echo_context',
        description: 'Returns server factory overrides for testing',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name === 'echo_context') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              pat: overrides.personalAccessToken ?? null,
              disabledTools: overrides.disabledTools,
              sessionId: overrides.sessionId ?? null,
            }),
          },
        ],
      };
    }
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
    };
  });

  return server;
}

interface ParsedSseEvent {
  id?: string;
  event?: string;
  data: string;
  json: unknown;
}

function openSse(
  baseUrl: string,
  reqPath: string,
  headers: Record<string, string>,
): Promise<{
  status: number;
  events: ParsedSseEvent[];
  waitForEvent: (
    predicate: (ev: ParsedSseEvent) => boolean,
    timeoutMs?: number,
  ) => Promise<ParsedSseEvent>;
  close: () => void;
}> {
  const url = new URL(reqPath, baseUrl);
  return new Promise((resolve, reject) => {
    const events: ParsedSseEvent[] = [];
    const waiters: Array<{
      predicate: (ev: ParsedSseEvent) => boolean;
      resolve: (ev: ParsedSseEvent) => void;
    }> = [];
    let buffer = '';

    const emitEvent = (block: string) => {
      let id: string | undefined;
      let event: string | undefined;
      const dataLines: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (!line || line.startsWith(':')) {
          continue;
        }
        const idx = line.indexOf(':');
        const field = idx === -1 ? line : line.slice(0, idx);
        const val =
          idx === -1 ? '' : line.slice(idx + (line[idx + 1] === ' ' ? 2 : 1));
        if (field === 'id') {
          id = val;
        } else if (field === 'event') {
          event = val;
        } else if (field === 'data') {
          dataLines.push(val);
        }
      }
      if (dataLines.length === 0) {
        return;
      }
      const data = dataLines.join('\n');
      let json: unknown;
      try {
        json = data.trim() ? JSON.parse(data) : null;
      } catch {
        json = null;
      }
      const parsed: ParsedSseEvent = { id, event, data, json };
      events.push(parsed);
      for (let i = waiters.length - 1; i >= 0; i -= 1) {
        if (waiters[i].predicate(parsed)) {
          const waiter = waiters.splice(i, 1)[0];
          waiter.resolve(parsed);
        }
      }
    };

    const req = http.request(
      {
        hostname: url.hostname,
        port: Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...headers,
        },
        agent: false,
      },
      (res) => {
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buffer += chunk;
          let boundary = buffer.indexOf('\n\n');
          while (boundary !== -1) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            emitEvent(block);
            boundary = buffer.indexOf('\n\n');
          }
        });

        resolve({
          status: res.statusCode ?? 0,
          events,
          waitForEvent: (predicate, timeoutMs = 3000) => {
            const existing = events.find(predicate);
            if (existing) {
              return Promise.resolve(existing);
            }
            return new Promise<ParsedSseEvent>((resWait, rejWait) => {
              const timer = setTimeout(() => {
                rejWait(
                  new Error(
                    `Timed out waiting for SSE event after ${timeoutMs}ms`,
                  ),
                );
              }, timeoutMs);
              timer.unref();
              waiters.push({
                predicate,
                resolve: (ev) => {
                  clearTimeout(timer);
                  resWait(ev);
                },
              });
            });
          },
          close: () => {
            res.destroy();
            req.destroy();
          },
        });
      },
    );

    req.on('error', (err) => {
      reject(err);
    });
    req.end();
  });
}

void describe('startStreamableHttpServer', () => {
  void it('refuses non-loopback bind without authToken or allowUnauthenticated', async () => {
    await assert.rejects(
      () =>
        startStreamableHttpServer({
          host: '0.0.0.0',
          port: 0,
          version: '1.2.3',
          createServer: (o) => ({ server: createTestMcpServer(o) }),
        }),
      AzureDevOpsValidationError,
    );
  });

  void it('serves /healthz, /readyz, custom paths, 404 unknown routes, and enforces auth only on MCP', async (t) => {
    const started = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      path: '/custom-mcp',
      authToken: 'tok-valid-123',
      version: '9.9.9',
      enableJsonResponse: true,
      createServer: (o) => ({ server: createTestMcpServer(o) }),
    });
    t.after(() => started.close());

    const baseUrl = `http://127.0.0.1:${started.port}`;

    const health = await sendHttpRequest(baseUrl, '/healthz');
    assert.equal(health.status, 200);
    assert.deepEqual(health.json, { status: 'ok', version: '9.9.9' });

    const ready = await sendHttpRequest(baseUrl, '/readyz');
    assert.equal(ready.status, 200);
    assert.deepEqual(ready.json, {
      status: 'ready',
      mode: 'stateful',
      activeSessions: 0,
    });

    const defaultMcp = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-valid-123',
        Accept: 'application/json, text/event-stream',
      },
      body: makeInitBody(),
    });
    assert.equal(defaultMcp.status, 404);

    const unknown = await sendHttpRequest(baseUrl, '/does-not-exist');
    assert.equal(unknown.status, 404);

    const unauth = await sendHttpRequest(baseUrl, '/custom-mcp', {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream' },
      body: makeInitBody(),
    });
    assert.equal(unauth.status, 401);

    const withApiKey = await sendHttpRequest(baseUrl, '/custom-mcp', {
      method: 'POST',
      headers: {
        'X-API-Key': 'tok-valid-123',
        Accept: 'application/json, text/event-stream',
      },
      body: makeInitBody(),
    });
    assert.equal(withApiKey.status, 200);
    assert.ok(withApiKey.headers['mcp-session-id']);
  });

  void it('rejects forged Host/Origin with 403 and oversized POST /mcp body with 413', async (t) => {
    const started = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      version: '1.0.0',
      createServer: (o) => ({ server: createTestMcpServer(o) }),
    });
    t.after(() => started.close());

    const baseUrl = `http://127.0.0.1:${started.port}`;

    const badHost = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: {
        Host: 'evil.example:3000',
        Accept: 'application/json, text/event-stream',
      },
      body: makeInitBody(),
    });
    assert.equal(badHost.status, 403);

    const badOrigin = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        Accept: 'application/json, text/event-stream',
      },
      body: makeInitBody(),
    });
    assert.equal(badOrigin.status, 403);

    const oversized = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: Buffer.alloc(MAX_MCP_BODY_BYTES + 1024, 0x61),
    });
    assert.equal(oversized.status, 413);

    const health = await sendHttpRequest(baseUrl, '/healthz');
    assert.equal(health.status, 200);
  });

  void it('enforces stateful lifecycle, HTTP filesystem tool lockout, maxSessions, DELETE cleanup, and failed-init cleanup', async (t) => {
    const cleanupCalls: string[] = [];
    const receivedOverrides: HttpServerFactoryOverrides[] = [];

    const started = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      mode: 'stateful',
      enableJsonResponse: true,
      maxSessions: 1,
      version: '1.0.0',
      createServer: (overrides) => {
        receivedOverrides.push(overrides);
        return {
          server: createTestMcpServer(overrides),
          cleanup: () => {
            cleanupCalls.push(overrides.sessionId ?? 'none');
          },
        };
      },
    });
    t.after(() => started.close());

    const baseUrl = `http://127.0.0.1:${started.port}`;

    // Non-initialize without session ID -> 400
    const nonInit = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream' },
      body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
    });
    assert.equal(nonInit.status, 400);

    // Failed initialize (missing Accept: text/event-stream -> 406) must clean up immediately
    const badAccept = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: makeInitBody(),
    });
    assert.equal(badAccept.status, 406);
    assert.equal(cleanupCalls.length, 1);

    // Valid initialize -> 200 + Mcp-Session-Id
    const initRes = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'X-Azure-DevOps-PAT': 'should-be-ignored-pat',
      },
      body: makeInitBody(),
    });
    assert.equal(initRes.status, 200);
    const sessionId = String(initRes.headers['mcp-session-id']);
    assert.ok(sessionId.length > 0);

    // Verify filesystem tools are locked out and PAT was ignored when allowPerRequestPat is false
    const lastOverride = receivedOverrides[receivedOverrides.length - 1];
    assert.deepEqual(lastOverride.disabledTools, [...HTTP_LOCKED_OUT_TOOLS]);
    assert.equal(lastOverride.personalAccessToken, undefined);

    // Second session hits maxSessions=1 -> 503
    const overCap = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream' },
      body: makeInitBody(2),
    });
    assert.equal(overCap.status, 503);

    // Unknown session ID -> 404
    const unknownSess = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Mcp-Session-Id': 'does-not-exist',
      },
      body: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    });
    assert.equal(unknownSess.status, 404);

    // DELETE terminates session and invokes cleanup()
    const delRes = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'DELETE',
      headers: { 'Mcp-Session-Id': sessionId },
    });
    assert.equal(delRes.status, 200);
    assert.ok(cleanupCalls.includes(sessionId));

    // Reuse after DELETE -> 404
    const reuseRes = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Mcp-Session-Id': sessionId,
      },
      body: { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} },
    });
    assert.equal(reuseRes.status, 404);
  });

  void it('supports SSE GET /mcp + Last-Event-ID resumability replaying missed notifications after disconnect', async (t) => {
    const serversBySession = new Map<string, Server>();

    const started = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      mode: 'stateful',
      version: '1.0.0',
      createServer: (overrides) => {
        const server = createTestMcpServer(overrides);
        if (overrides.sessionId) {
          serversBySession.set(overrides.sessionId, server);
        }
        return { server };
      },
    });
    t.after(() => started.close());

    const baseUrl = `http://127.0.0.1:${started.port}`;

    const initRes = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream' },
      body: makeInitBody(),
    });
    assert.equal(initRes.status, 200);
    const sessionId = String(initRes.headers['mcp-session-id']);
    const sessionServer = serversBySession.get(sessionId);
    assert.ok(sessionServer);

    const sse1 = await openSse(baseUrl, '/mcp', {
      'Mcp-Session-Id': sessionId,
      'MCP-Protocol-Version': '2025-11-25',
    });
    t.after(() => sse1.close());
    assert.equal(sse1.status, 200);

    await sessionServer.notification({
      method: 'notifications/resources/updated',
      params: { uri: 'ado://org/proj/events/1' },
    });

    const ev1 = await sse1.waitForEvent(
      (ev) =>
        typeof ev.json === 'object' &&
        ev.json !== null &&
        (ev.json as Record<string, unknown>).method ===
          'notifications/resources/updated',
    );
    assert.ok(ev1.id && ev1.id.length > 0);

    // Disconnect first SSE stream and emit notification while offline
    sse1.close();
    await delay(100);

    await sessionServer.notification({
      method: 'notifications/resources/updated',
      params: { uri: 'ado://org/proj/events/2' },
    });

    // Reconnect with Last-Event-ID and verify replay of event 2
    let sse2 = await openSse(baseUrl, '/mcp', {
      'Mcp-Session-Id': sessionId,
      'MCP-Protocol-Version': '2025-11-25',
      'Last-Event-ID': ev1.id,
    });
    const deadline = Date.now() + 1000;
    while (sse2.status === 409 && Date.now() < deadline) {
      sse2.close();
      await delay(50);
      sse2 = await openSse(baseUrl, '/mcp', {
        'Mcp-Session-Id': sessionId,
        'MCP-Protocol-Version': '2025-11-25',
        'Last-Event-ID': ev1.id,
      });
    }
    t.after(() => sse2.close());
    assert.equal(sse2.status, 200);

    const ev2 = await sse2.waitForEvent(
      (ev) =>
        typeof ev.json === 'object' &&
        ev.json !== null &&
        (ev.json as Record<string, unknown>).method ===
          'notifications/resources/updated',
    );
    assert.notEqual(ev2.id, ev1.id);
    assert.deepEqual(
      (ev2.json as { params?: { uri?: string } }).params?.uri,
      'ado://org/proj/events/2',
    );
  });

  void it('reaps idle stateful sessions after sessionIdleTimeoutMs', async (t) => {
    let cleaned = 0;
    const started = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      mode: 'stateful',
      enableJsonResponse: true,
      maxSessions: 1,
      sessionIdleTimeoutMs: 50,
      version: '1.0.0',
      createServer: (o) => ({
        server: createTestMcpServer(o),
        cleanup: () => {
          cleaned += 1;
        },
      }),
    });
    t.after(() => started.close());

    const baseUrl = `http://127.0.0.1:${started.port}`;
    const init1 = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream' },
      body: makeInitBody(1),
    });
    assert.equal(init1.status, 200);

    await delay(80);

    // Opportunistic reap frees capacity for a new session even before interval ticks
    const init2 = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream' },
      body: makeInitBody(2),
    });
    assert.equal(init2.status, 200);
    assert.equal(cleaned, 1);
  });

  void it('supports stateless mode with enableJsonResponse, 405 on GET/DELETE, and opt-in X-Azure-DevOps-PAT', async (t) => {
    let cleanups = 0;
    const started = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      mode: 'stateless',
      enableJsonResponse: true,
      allowPerRequestPat: true,
      version: '1.0.0',
      createServer: (o) => ({
        server: createTestMcpServer(o),
        cleanup: () => {
          cleanups += 1;
        },
      }),
    });
    t.after(() => started.close());

    const baseUrl = `http://127.0.0.1:${started.port}`;

    const getRes = await sendHttpRequest(baseUrl, '/mcp', { method: 'GET' });
    assert.equal(getRes.status, 405);

    const delRes = await sendHttpRequest(baseUrl, '/mcp', { method: 'DELETE' });
    assert.equal(delRes.status, 405);

    const call1 = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'X-Azure-DevOps-PAT': 'caller-pat-A',
      },
      body: {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: { name: 'echo_context', arguments: {} },
      },
    });
    assert.equal(call1.status, 200);
    assert.equal(call1.headers['mcp-session-id'], undefined);
    assert.match(String(call1.headers['content-type']), /application\/json/i);
    const parsed1 = JSON.parse(
      (call1.json as { result: { content: Array<{ text: string }> } }).result
        .content[0].text,
    );
    assert.equal(parsed1.pat, 'caller-pat-A');
    assert.deepEqual(parsed1.disabledTools, [...HTTP_LOCKED_OUT_TOOLS]);

    const call2 = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'X-Azure-DevOps-PAT': 'caller-pat-B',
      },
      body: {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: { name: 'echo_context', arguments: {} },
      },
    });
    assert.equal(call2.status, 200);
    const parsed2 = JSON.parse(
      (call2.json as { result: { content: Array<{ text: string }> } }).result
        .content[0].text,
    );
    assert.equal(parsed2.pat, 'caller-pat-B');

    await delay(20);
    assert.equal(cleanups, 2);
  });

  void it('handles POST /webhooks/ado validation (404 when disabled, 415/413/400/200 when enabled)', async (t) => {
    // 1. Disabled by default -> 404
    const disabledSrv = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      version: '1.0.0',
      createServer: (o) => ({ server: createTestMcpServer(o) }),
    });
    t.after(() => disabledSrv.close());

    const notEnabled = await sendHttpRequest(
      `http://127.0.0.1:${disabledSrv.port}`,
      '/webhooks/ado',
      {
        method: 'POST',
        body: { id: 'evt-1' },
      },
    );
    assert.equal(notEnabled.status, 404);

    // 2. Enabled with webhookSecret + onWebhookRequest (receives raw Buffer, auth before JSON parse)
    const webhookSecret = 'wh-secret';
    const receivedBodies: Buffer[] = [];
    const enabledSrv = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      version: '1.0.0',
      webhookSecret,
      createServer: (o) => ({ server: createTestMcpServer(o) }),
      onWebhookRequest: async (req, rawBody) => {
        assert.ok(
          Buffer.isBuffer(rawBody),
          'onWebhookRequest must receive Buffer',
        );
        if (!verifyWebhookAuth(req.headers, rawBody, webhookSecret)) {
          return {
            status: 401,
            body: { error: 'Unauthorized webhook request' },
          };
        }
        try {
          JSON.parse(rawBody.toString('utf8'));
        } catch {
          return { status: 400, body: { error: 'Invalid JSON payload' } };
        }
        receivedBodies.push(rawBody);
        return { status: 200, body: { accepted: true } };
      },
    });
    t.after(() => enabledSrv.close());

    const baseUrl = `http://127.0.0.1:${enabledSrv.port}`;

    const wrongMethod = await sendHttpRequest(baseUrl, '/webhooks/ado', {
      method: 'GET',
    });
    assert.equal(wrongMethod.status, 405);

    const wrongType = await sendHttpRequest(baseUrl, '/webhooks/ado', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{"id":"1"}',
    });
    assert.equal(wrongType.status, 415);

    const tooLarge = await sendHttpRequest(baseUrl, '/webhooks/ado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.alloc(MAX_WEBHOOK_BODY_BYTES + 128, 0x61),
    });
    assert.equal(tooLarge.status, 413);

    // Authenticated invalid JSON -> 400
    const invalidJsonAuthed = await sendHttpRequest(baseUrl, '/webhooks/ado', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ADO-Webhook-Secret': webhookSecret,
      },
      body: '{not-json',
    });
    assert.equal(invalidJsonAuthed.status, 400);

    const okRes = await sendHttpRequest(baseUrl, '/webhooks/ado', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-ADO-Webhook-Secret': webhookSecret,
      },
      body: { id: 'evt-ok', eventType: 'git.push' },
    });
    assert.equal(okRes.status, 200);
    assert.deepEqual(okRes.json, { accepted: true });
    assert.equal(receivedBodies.length, 1);
  });

  void it('per-request PAT forces AuthenticationMethod.PersonalAccessToken and requirePerRequestPat fails closed with 401 when PAT is omitted', async (t) => {
    const baseConfig = {
      organizationUrl: 'https://dev.azure.com/test-org',
      authMethod: AuthenticationMethod.AzureIdentity,
      disabledTools: ['delete_work_item'],
    };

    // Per-request PAT MUST switch authMethod from AzureIdentity to PersonalAccessToken
    const effective = buildEffectiveHttpSessionConfig(baseConfig, {
      personalAccessToken: 'caller-only-pat',
      disabledTools: [...HTTP_LOCKED_OUT_TOOLS],
    });
    assert.equal(
      effective.authMethod,
      AuthenticationMethod.PersonalAccessToken,
    );
    assert.equal(effective.personalAccessToken, 'caller-only-pat');
    assert.ok(effective.disabledTools?.includes('delete_work_item'));
    assert.ok(effective.disabledTools?.includes('create_work_item_attachment'));

    // Omitting PAT preserves original authMethod
    const withoutPat = buildEffectiveHttpSessionConfig(baseConfig, {
      personalAccessToken: undefined,
      disabledTools: [...HTTP_LOCKED_OUT_TOOLS],
    });
    assert.equal(withoutPat.authMethod, AuthenticationMethod.AzureIdentity);
    assert.equal(withoutPat.personalAccessToken, undefined);

    // HTTP transport with requirePerRequestPat: true rejects missing PAT with 401
    let factoryCalls = 0;
    const started = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      mode: 'stateless',
      enableJsonResponse: true,
      allowPerRequestPat: true,
      requirePerRequestPat: true,
      version: '1.0.0',
      createServer: (o) => {
        factoryCalls += 1;
        return { server: createTestMcpServer(o) };
      },
    });
    t.after(() => started.close());

    const baseUrl = `http://127.0.0.1:${started.port}`;

    const missingPat = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream' },
      body: makeInitBody(),
    });
    assert.equal(missingPat.status, 401);
    assert.equal(factoryCalls, 0);

    const withPat = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'X-Azure-DevOps-PAT': 'caller-pat-required',
      },
      body: makeInitBody(),
    });
    assert.equal(withPat.status, 200);
    assert.equal(factoryCalls, 1);
  });

  void it('binds stateful sessions to initial X-Azure-DevOps-PAT SHA-256 digest and rejects mismatched or missing follow-up PAT with 401 across POST/GET/DELETE', async (t) => {
    const started = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      mode: 'stateful',
      enableJsonResponse: true,
      allowPerRequestPat: true,
      version: '1.0.0',
      createServer: (o) => ({ server: createTestMcpServer(o) }),
    });
    t.after(() => started.close());

    const baseUrl = `http://127.0.0.1:${started.port}`;

    // Initialize PAT-bound session A
    const initA = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'X-Azure-DevOps-PAT': 'tenant-a-secret-pat',
      },
      body: makeInitBody(1),
    });
    assert.equal(initA.status, 200);
    const sessionA = String(initA.headers['mcp-session-id']);
    assert.ok(sessionA.length > 0);

    // Follow-up POST with matching PAT -> 200
    const okFollowUp = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Mcp-Session-Id': sessionA,
        'X-Azure-DevOps-PAT': 'tenant-a-secret-pat',
      },
      body: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    });
    assert.equal(okFollowUp.status, 200);

    // Follow-up POST with mismatched PAT -> 401
    const mismatchPost = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Mcp-Session-Id': sessionA,
        'X-Azure-DevOps-PAT': 'tenant-b-attacker-pat',
      },
      body: { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} },
    });
    assert.equal(mismatchPost.status, 401);

    // Follow-up POST omitting PAT on PAT-bound session -> 401
    const missingPost = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Mcp-Session-Id': sessionA,
      },
      body: { jsonrpc: '2.0', id: 4, method: 'tools/list', params: {} },
    });
    assert.equal(missingPost.status, 401);

    // Follow-up GET SSE with mismatched PAT -> 401
    const mismatchGet = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        'Mcp-Session-Id': sessionA,
        'X-Azure-DevOps-PAT': 'tenant-b-attacker-pat',
      },
    });
    assert.equal(mismatchGet.status, 401);

    // Follow-up DELETE with mismatched PAT -> 401 (session must remain alive!)
    const mismatchDel = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'DELETE',
      headers: {
        'Mcp-Session-Id': sessionA,
        'X-Azure-DevOps-PAT': 'tenant-b-attacker-pat',
      },
    });
    assert.equal(mismatchDel.status, 401);

    // Follow-up DELETE with matching PAT -> 200
    const validDel = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'DELETE',
      headers: {
        'Mcp-Session-Id': sessionA,
        'X-Azure-DevOps-PAT': 'tenant-a-secret-pat',
      },
    });
    assert.equal(validDel.status, 200);

    // Unbound (default-credential) session rejects follow-up that supplies a PAT -> 401
    const initDefault = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream' },
      body: makeInitBody(5),
    });
    assert.equal(initDefault.status, 200);
    const defaultSession = String(initDefault.headers['mcp-session-id']);

    const confusedFollowUp = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Mcp-Session-Id': defaultSession,
        'X-Azure-DevOps-PAT': 'unexpected-pat',
      },
      body: { jsonrpc: '2.0', id: 6, method: 'tools/list', params: {} },
    });
    assert.equal(confusedFollowUp.status, 401);
  });

  void it('returns 503 on POST /webhooks/ado while server is draining', async () => {
    let releaseCleanup!: () => void;
    const cleanupHold = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });

    const webhookSecret = 'drain-wh-secret';
    let handlerCalls = 0;
    const started = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      mode: 'stateful',
      enableJsonResponse: true,
      webhookSecret,
      version: '1.0.0',
      createServer: (o) => ({
        server: createTestMcpServer(o),
        cleanup: () => cleanupHold,
      }),
      onWebhookRequest: async () => {
        handlerCalls += 1;
        return { status: 200, body: { ok: true } };
      },
    });

    const baseUrl = `http://127.0.0.1:${started.port}`;

    // Establish one stateful session so close() pauses in draining state awaiting cleanupHold
    const init = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream' },
      body: makeInitBody(),
    });
    assert.equal(init.status, 200);

    const closePromise = started.close();
    try {
      const whDuringDrain = await sendHttpRequest(baseUrl, '/webhooks/ado', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ADO-Webhook-Secret': webhookSecret,
        },
        body: { eventType: 'test' },
      });
      assert.equal(whDuringDrain.status, 503);
      assert.equal(handlerCalls, 0);
    } finally {
      releaseCleanup();
      await closePromise;
    }
  });

  void it('webhook rejects unauthenticated invalid JSON with 401 (never 400) and verifies raw-Buffer HMAC-SHA256 before JSON parsing', async (t) => {
    const webhookSecret = 'hmac-raw-buffer-secret';
    const eventEngine = new EventEngine();
    t.after(() => eventEngine.close());

    const observedBuffers: Buffer[] = [];
    const prodHandler = createHttpWebhookHandler(eventEngine, webhookSecret);

    const started = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      version: '1.0.0',
      webhookSecret,
      createServer: (o) => ({ server: createTestMcpServer(o) }),
      onWebhookRequest: async (req, rawBody) => {
        observedBuffers.push(rawBody);
        return prodHandler(req, rawBody);
      },
    });
    t.after(() => started.close());

    const baseUrl = `http://127.0.0.1:${started.port}`;

    // 1. Unauthenticated invalid JSON MUST return 401 (no pre-auth JSON.parse -> 400)
    const unauthInvalidJson = await sendHttpRequest(baseUrl, '/webhooks/ado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{corrupt-unauthenticated-json',
    });
    assert.equal(unauthInvalidJson.status, 401);

    // 2. Unauthenticated empty body MUST return 401 (not 400)
    const unauthEmpty = await sendHttpRequest(baseUrl, '/webhooks/ado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    });
    assert.equal(unauthEmpty.status, 401);

    // 3. Raw-Buffer HMAC over non-UTF-8 byte sequence proves HMAC runs on exact raw bytes
    //    (not lossy UTF-8 text), authenticating first and THEN failing JSON.parse with 400.
    const nonUtf8Bytes = Buffer.from([0xff, 0xfe, 0x7b, 0x22, 0x61, 0x22]);
    const validRawHmac = createHmac('sha256', webhookSecret)
      .update(nonUtf8Bytes)
      .digest('hex');
    const nonUtf8Res = await sendHttpRequest(baseUrl, '/webhooks/ado', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature-256': `sha256=${validRawHmac}`,
      },
      body: nonUtf8Bytes,
    });
    // Auth passed over exact raw Buffer bytes; JSON.parse then fails with 400!
    assert.equal(nonUtf8Res.status, 400);
    assert.ok(Buffer.isBuffer(observedBuffers[observedBuffers.length - 1]));
    assert.equal(
      observedBuffers[observedBuffers.length - 1].equals(nonUtf8Bytes),
      true,
    );

    // 4. Valid UTF-8 JSON with raw-Buffer HMAC-SHA256 succeeds with 200
    const validPayload = Buffer.from(
      JSON.stringify({
        id: 'wh-hmac-raw-1',
        eventType: 'test',
        subscriptionId: '00000000-0000-0000-0000-000000000000',
        resource: { isTest: true },
      }),
      'utf8',
    );
    const validJsonHmac = createHmac('sha256', webhookSecret)
      .update(validPayload)
      .digest('hex');
    const validRes = await sendHttpRequest(baseUrl, '/webhooks/ado', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature-256': `sha256=${validJsonHmac}`,
      },
      body: validPayload,
    });
    assert.equal(validRes.status, 200);
    assert.deepEqual(validRes.json, { ok: true, kind: 'test' });

    // 5. Tampered payload with original HMAC fails with 401
    const tamperedRes = await sendHttpRequest(baseUrl, '/webhooks/ado', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature-256': `sha256=${validJsonHmac}`,
      },
      body: Buffer.concat([validPayload, Buffer.from(' ', 'utf8')]),
    });
    assert.equal(tamperedRes.status, 401);
  });

  void it('tracks active stateful POST before body upload completes so idle reaper cannot reap mid-upload', async (t) => {
    let cleaned = 0;
    const started = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      mode: 'stateful',
      enableJsonResponse: true,
      maxSessions: 1,
      sessionIdleTimeoutMs: 40,
      version: '1.0.0',
      createServer: (o) => ({
        server: createTestMcpServer(o),
        cleanup: () => {
          cleaned += 1;
        },
      }),
    });
    t.after(() => started.close());

    const baseUrl = `http://127.0.0.1:${started.port}`;
    const init = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream' },
      body: makeInitBody(),
    });
    assert.equal(init.status, 200);
    const sessionId = String(init.headers['mcp-session-id']);

    // Start a slow chunked POST on the existing session and hold mid-upload past sessionIdleTimeoutMs
    const fullBody = JSON.stringify({
      jsonrpc: '2.0',
      id: 99,
      method: 'tools/list',
      params: {},
    });
    const splitAt = Math.floor(fullBody.length / 2);

    const slowResponsePromise = new Promise<RawHttpResponse>(
      (resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: started.port,
            path: '/mcp',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json, text/event-stream',
              'Mcp-Session-Id': sessionId,
              'Transfer-Encoding': 'chunked',
            },
            agent: false,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => {
              const text = Buffer.concat(chunks).toString('utf8');
              resolve({
                status: res.statusCode ?? 0,
                headers: res.headers,
                text,
                json: text ? JSON.parse(text) : null,
              });
            });
          },
        );
        req.on('error', reject);
        req.write(fullBody.slice(0, splitAt));

        void (async () => {
          // Hold longer than sessionIdleTimeoutMs AND trigger opportunistic reap via new init
          await delay(80);
          const competingInit = await sendHttpRequest(baseUrl, '/mcp', {
            method: 'POST',
            headers: { Accept: 'application/json, text/event-stream' },
            body: makeInitBody(2),
          });
          // Must be 503 because session 1 is actively uploading and MUST NOT be reaped!
          assert.equal(competingInit.status, 503);
          assert.equal(cleaned, 0);

          req.end(fullBody.slice(splitAt));
        })();
      },
    );

    const slowRes = await slowResponsePromise;
    assert.equal(slowRes.status, 200);
    assert.equal(cleaned, 0);
  });

  void it('allows startup without global AZURE_DEVOPS_PAT when allowPerRequestPat is true and isolates EventEngine per PAT-injected session', async (t) => {
    const patOnlyNoGlobalConfig = {
      organizationUrl: 'https://dev.azure.com/test-org',
      authMethod: AuthenticationMethod.PersonalAccessToken,
      personalAccessToken: undefined,
      toolsets: ['events'],
    };

    // Startup without global PAT: fail closed when allowPerRequestPat is false, allowed when true
    assert.equal(
      shouldRequirePerRequestPat(patOnlyNoGlobalConfig, false),
      false,
    );
    assert.equal(shouldRequirePerRequestPat(patOnlyNoGlobalConfig, true), true);

    assert.throws(
      () =>
        createAzureDevOpsServer(
          buildStartupProbeConfig(patOnlyNoGlobalConfig, false),
        ),
      AzureDevOpsValidationError,
    );

    const probeServer = createAzureDevOpsServer(
      buildStartupProbeConfig(patOnlyNoGlobalConfig, true),
    );
    await probeServer.close();

    // EventEngine isolation: shared webhook ingested into sharedEventEngine MUST NOT
    // leak into a per-request PAT session, while default sessions can still read it.
    const sharedEventEngine = new EventEngine({
      bufferSize: 32,
      pollIntervalMs: 15_000,
    });
    t.after(() => sharedEventEngine.close());

    sharedEventEngine.ingestWebhook({
      id: 'shared-wh-evt-1',
      eventType: 'git.push',
      createdDate: '2026-11-25T10:00:00Z',
      resource: {
        pushId: 77,
        repository: {
          id: '77777777-7777-4777-8777-777777777777',
          name: 'DemoRepo',
          project: {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            name: 'DemoProject',
          },
        },
      },
    });

    const baseConfig = {
      organizationUrl: 'https://dev.azure.com/test-org',
      authMethod: AuthenticationMethod.PersonalAccessToken,
      personalAccessToken: 'global-default-pat',
      toolsets: ['events'],
    };

    const started = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      mode: 'stateful',
      enableJsonResponse: true,
      allowPerRequestPat: true,
      version: '1.0.0',
      createServer: createHttpServerFactory(
        baseConfig,
        {
          allowPerRequestPat: true,
          eventBufferSize: 32,
          eventPollIntervalMs: 15_000,
        },
        sharedEventEngine,
      ),
    });
    t.after(() => started.close());

    const baseUrl = `http://127.0.0.1:${started.port}`;

    // Tenant A session (with per-request PAT) -> isolated EventEngine -> 0 shared webhook events
    const initTenant = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'X-Azure-DevOps-PAT': 'tenant-isolated-pat',
      },
      body: makeInitBody(1),
    });
    assert.equal(initTenant.status, 200);
    const tenantSessionId = String(initTenant.headers['mcp-session-id']);

    const tenantFeed = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Mcp-Session-Id': tenantSessionId,
        'X-Azure-DevOps-PAT': 'tenant-isolated-pat',
      },
      body: {
        jsonrpc: '2.0',
        id: 2,
        method: 'resources/read',
        params: { uri: 'ado://test-org/DemoProject/events/feed' },
      },
    });
    assert.equal(tenantFeed.status, 200);
    const tenantFeedText = (
      tenantFeed.json as { result: { contents: Array<{ text: string }> } }
    ).result.contents[0].text;
    const tenantEvents = (JSON.parse(tenantFeedText) as { events: unknown[] })
      .events;
    assert.equal(
      tenantEvents.length,
      0,
      'Per-request PAT session must NOT observe shared EventEngine webhook events',
    );

    // Default-credential session (no X-Azure-DevOps-PAT) -> uses shared EventEngine -> sees shared webhook
    const initDefault = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream' },
      body: makeInitBody(3),
    });
    assert.equal(initDefault.status, 200);
    const defaultSessionId = String(initDefault.headers['mcp-session-id']);

    const defaultFeed = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Mcp-Session-Id': defaultSessionId,
      },
      body: {
        jsonrpc: '2.0',
        id: 4,
        method: 'resources/read',
        params: { uri: 'ado://test-org/DemoProject/events/feed' },
      },
    });
    assert.equal(defaultFeed.status, 200);
    const defaultFeedText = (
      defaultFeed.json as { result: { contents: Array<{ text: string }> } }
    ).result.contents[0].text;
    const defaultEvents = (JSON.parse(defaultFeedText) as { events: unknown[] })
      .events;
    assert.equal(
      defaultEvents.length,
      1,
      'Default-credential session should continue observing shared EventEngine events',
    );
  });

  void it('enforces maxConcurrentStatelessRequests by returning 503 at capacity and freeing slots after completion', async (t) => {
    let factoryCalls = 0;
    let enteredFirstFactory!: () => void;
    const firstEntered = new Promise<void>((resolve) => {
      enteredFirstFactory = resolve;
    });
    let releaseFirstFactory!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirstFactory = resolve;
    });

    const started = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      mode: 'stateless',
      enableJsonResponse: true,
      maxConcurrentStatelessRequests: 1,
      version: '1.0.0',
      createServer: async (overrides) => {
        factoryCalls += 1;
        if (factoryCalls === 1) {
          enteredFirstFactory();
          await firstGate;
        }
        return { server: createTestMcpServer(overrides) };
      },
    });
    t.after(() => started.close());

    const baseUrl = `http://127.0.0.1:${started.port}`;
    const callBody = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'echo_context', arguments: {} },
    };

    const firstReq = sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream' },
      body: callBody,
    });
    await firstEntered;

    // Concurrent second request must be rejected with 503 BEFORE createServer()
    const overflowReq = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream' },
      body: { ...callBody, id: 2 },
    });
    assert.equal(overflowReq.status, 503);
    assert.equal(factoryCalls, 1);

    releaseFirstFactory();
    const firstRes = await firstReq;
    assert.equal(firstRes.status, 200);

    // Slot is freed after first request finishes
    const afterRes = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream' },
      body: { ...callBody, id: 3 },
    });
    assert.equal(afterRes.status, 200);
    assert.equal(factoryCalls, 2);
  });

  void it('rechecks draining after createServer in stateless mode, closes server and runs cleanup, and returns 503 without executing tools', async () => {
    let enteredFactory!: () => void;
    const factoryEntered = new Promise<void>((resolve) => {
      enteredFactory = resolve;
    });
    let releaseFactory!: () => void;
    const factoryGate = new Promise<void>((resolve) => {
      releaseFactory = resolve;
    });

    let serverCloseCalls = 0;
    let cleanupCalls = 0;
    let toolCalls = 0;

    const started = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      mode: 'stateless',
      enableJsonResponse: true,
      version: '1.0.0',
      createServer: async () => {
        enteredFactory();
        await factoryGate;

        const server = new Server(
          { name: 'drain-test-mcp', version: '0.1.0' },
          { capabilities: { tools: {} } },
        );
        server.setRequestHandler(CallToolRequestSchema, async () => {
          toolCalls += 1;
          return { content: [{ type: 'text', text: 'should-not-run' }] };
        });

        const origClose = server.close.bind(server);
        server.close = async () => {
          serverCloseCalls += 1;
          await origClose();
        };

        return {
          server,
          cleanup: () => {
            cleanupCalls += 1;
          },
        };
      },
    });

    const baseUrl = `http://127.0.0.1:${started.port}`;
    const reqPromise = sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream' },
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'echo_context', arguments: {} },
      },
    });

    await factoryEntered;
    const closePromise = started.close();
    releaseFactory();

    const res = await reqPromise;
    await closePromise;

    assert.equal(res.status, 503);
    assert.equal(serverCloseCalls, 1);
    assert.equal(cleanupCalls, 1);
    assert.equal(toolCalls, 0);
  });

  void it('rechecks draining after createServer on stateful initialize and returns 503 after closing created server', async () => {
    let enteredFactory!: () => void;
    const factoryEntered = new Promise<void>((resolve) => {
      enteredFactory = resolve;
    });
    let releaseFactory!: () => void;
    const factoryGate = new Promise<void>((resolve) => {
      releaseFactory = resolve;
    });

    let serverCloseCalls = 0;
    let cleanupCalls = 0;

    const started = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      mode: 'stateful',
      enableJsonResponse: true,
      version: '1.0.0',
      createServer: async (overrides) => {
        enteredFactory();
        await factoryGate;

        const server = createTestMcpServer(overrides);
        const origClose = server.close.bind(server);
        server.close = async () => {
          serverCloseCalls += 1;
          await origClose();
        };
        return {
          server,
          cleanup: () => {
            cleanupCalls += 1;
          },
        };
      },
    });

    const baseUrl = `http://127.0.0.1:${started.port}`;
    const initPromise = sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream' },
      body: makeInitBody(),
    });

    await factoryEntered;
    const closePromise = started.close();
    releaseFactory();

    const res = await initPromise;
    await closePromise;

    assert.equal(res.status, 503);
    assert.equal(res.headers['mcp-session-id'], undefined);
    assert.equal(serverCloseCalls, 1);
    assert.equal(cleanupCalls, 1);
  });

  void it('rejects forged Host or Origin on POST /webhooks/ado with 403 before invoking onWebhookRequest', async (t) => {
    const webhookSecret = 'wh-host-origin-secret';
    let handlerCalls = 0;
    const started = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      version: '1.0.0',
      webhookSecret,
      createServer: (o) => ({ server: createTestMcpServer(o) }),
      onWebhookRequest: async () => {
        handlerCalls += 1;
        return { status: 200, body: { accepted: true } };
      },
    });
    t.after(() => started.close());

    const baseUrl = `http://127.0.0.1:${started.port}`;

    const badHost = await sendHttpRequest(baseUrl, '/webhooks/ado', {
      method: 'POST',
      headers: {
        Host: 'evil.example:3000',
        'X-ADO-Webhook-Secret': webhookSecret,
      },
      body: { id: 'evt-bad-host' },
    });
    assert.equal(badHost.status, 403);

    const badOrigin = await sendHttpRequest(baseUrl, '/webhooks/ado', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        'X-ADO-Webhook-Secret': webhookSecret,
      },
      body: { id: 'evt-bad-origin' },
    });
    assert.equal(badOrigin.status, 403);
    assert.equal(handlerCalls, 0);
  });

  void it('rate-limits POST /webhooks/ado requests and failed-auth bursts with 429 + Retry-After (ignoring X-Forwarded-For)', async (t) => {
    const webhookSecret = 'wh-rate-limit-secret';

    // Part A: Total request rate limit
    let reqLimitHandlerCalls = 0;
    const reqLimitSrv = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      version: '1.0.0',
      webhookSecret,
      webhookRateLimitPerMinute: 2,
      webhookAuthFailLimitPerMinute: 10,
      webhookRateLimitWindowMs: 60_000,
      createServer: (o) => ({ server: createTestMcpServer(o) }),
      onWebhookRequest: async (req, rawBody) => {
        reqLimitHandlerCalls += 1;
        if (!verifyWebhookAuth(req.headers, rawBody, webhookSecret)) {
          return { status: 401, body: { error: 'Unauthorized' } };
        }
        return { status: 200, body: { accepted: true } };
      },
    });
    t.after(() => reqLimitSrv.close());

    const reqBaseUrl = `http://127.0.0.1:${reqLimitSrv.port}`;
    for (let i = 1; i <= 2; i += 1) {
      const ok = await sendHttpRequest(reqBaseUrl, '/webhooks/ado', {
        method: 'POST',
        headers: { 'X-ADO-Webhook-Secret': webhookSecret },
        body: { id: `evt-${i}` },
      });
      assert.equal(ok.status, 200);
    }

    // 3rd request exceeds limit even with spoofed X-Forwarded-For -> 429 + Retry-After, handler NOT invoked
    const throttled = await sendHttpRequest(reqBaseUrl, '/webhooks/ado', {
      method: 'POST',
      headers: {
        'X-ADO-Webhook-Secret': webhookSecret,
        'X-Forwarded-For': '203.0.113.99',
      },
      body: { id: 'evt-3' },
    });
    assert.equal(throttled.status, 429);
    const reqRetryAfter = Number(throttled.headers['retry-after']);
    assert.ok(
      Number.isInteger(reqRetryAfter) && reqRetryAfter >= 1,
      `Expected positive integer Retry-After header, got ${String(throttled.headers['retry-after'])}`,
    );
    assert.equal(reqLimitHandlerCalls, 2);

    // Part B: Failed-auth lockout limit
    let authFailHandlerCalls = 0;
    const authFailSrv = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      version: '1.0.0',
      webhookSecret,
      webhookRateLimitPerMinute: 10,
      webhookAuthFailLimitPerMinute: 2,
      webhookRateLimitWindowMs: 60_000,
      createServer: (o) => ({ server: createTestMcpServer(o) }),
      onWebhookRequest: async (req, rawBody) => {
        authFailHandlerCalls += 1;
        if (!verifyWebhookAuth(req.headers, rawBody, webhookSecret)) {
          return { status: 401, body: { error: 'Unauthorized' } };
        }
        return { status: 200, body: { accepted: true } };
      },
    });
    t.after(() => authFailSrv.close());

    const authBaseUrl = `http://127.0.0.1:${authFailSrv.port}`;
    for (let i = 1; i <= 2; i += 1) {
      const fail = await sendHttpRequest(authBaseUrl, '/webhooks/ado', {
        method: 'POST',
        headers: { 'X-ADO-Webhook-Secret': `wrong-secret-${i}` },
        body: { id: `bad-${i}` },
      });
      assert.equal(fail.status, 401);
    }

    // 3rd attempt (even with valid secret + spoofed X-Forwarded-For) is locked out with 429 BEFORE handler runs
    const lockedOut = await sendHttpRequest(authBaseUrl, '/webhooks/ado', {
      method: 'POST',
      headers: {
        'X-ADO-Webhook-Secret': webhookSecret,
        'X-Forwarded-For': '198.51.100.42',
      },
      body: { id: 'after-lockout' },
    });
    assert.equal(lockedOut.status, 429);
    const authRetryAfter = Number(lockedOut.headers['retry-after']);
    assert.ok(
      Number.isInteger(authRetryAfter) && authRetryAfter >= 1,
      `Expected positive integer Retry-After header, got ${String(lockedOut.headers['retry-after'])}`,
    );
    assert.equal(authFailHandlerCalls, 2);
  });

  void it('rate-limits /mcp requests and locks out repeated failed Bearer/API-key auth guesses with 429 + Retry-After', async (t) => {
    const authToken = 'mcp-valid-secret-token';

    // Part A: Failed-auth brute-force lockout on /mcp
    const authLockSrv = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      mode: 'stateless',
      enableJsonResponse: true,
      authToken,
      mcpRateLimitPerMinute: 20,
      mcpAuthFailLimitPerMinute: 2,
      mcpRateLimitWindowMs: 60_000,
      version: '1.0.0',
      createServer: (o) => ({ server: createTestMcpServer(o) }),
    });
    t.after(() => authLockSrv.close());

    const authUrl = `http://127.0.0.1:${authLockSrv.port}`;
    for (let i = 1; i <= 2; i += 1) {
      const bad = await sendHttpRequest(authUrl, '/mcp', {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer wrong-guess-${i}`,
        },
        body: makeInitBody(),
      });
      assert.equal(bad.status, 401);
    }

    // 3rd attempt (even with valid token + spoofed X-Forwarded-For) is locked out with 429
    const locked = await sendHttpRequest(authUrl, '/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${authToken}`,
        'X-Forwarded-For': '203.0.113.77',
      },
      body: makeInitBody(),
    });
    assert.equal(locked.status, 429);
    const lockRetry = Number(locked.headers['retry-after']);
    assert.ok(Number.isInteger(lockRetry) && lockRetry >= 1);

    // Part B: Request rate limit on /mcp
    const reqLimitSrv = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      mode: 'stateless',
      enableJsonResponse: true,
      authToken,
      mcpRateLimitPerMinute: 2,
      mcpAuthFailLimitPerMinute: 10,
      mcpRateLimitWindowMs: 60_000,
      version: '1.0.0',
      createServer: (o) => ({ server: createTestMcpServer(o) }),
    });
    t.after(() => reqLimitSrv.close());

    const reqUrl = `http://127.0.0.1:${reqLimitSrv.port}`;
    for (let i = 1; i <= 2; i += 1) {
      const ok = await sendHttpRequest(reqUrl, '/mcp', {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${authToken}`,
        },
        body: makeInitBody(),
      });
      assert.equal(ok.status, 200);
    }

    const throttled = await sendHttpRequest(reqUrl, '/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${authToken}`,
        'X-Forwarded-For': '198.51.100.88',
      },
      body: makeInitBody(),
    });
    assert.equal(throttled.status, 429);
    const reqRetry = Number(throttled.headers['retry-after']);
    assert.ok(Number.isInteger(reqRetry) && reqRetry >= 1);
  });

  void it('isolates per-client rate limits and auth lockouts behind trustedProxies using rightmost untrusted X-Forwarded-For hop', async (t) => {
    const authToken = 'mcp-proxy-secret';
    const started = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      mode: 'stateless',
      enableJsonResponse: true,
      authToken,
      trustedProxies: ['127.0.0.1'],
      mcpRateLimitPerMinute: 20,
      mcpAuthFailLimitPerMinute: 2,
      mcpRateLimitWindowMs: 60_000,
      version: '1.0.0',
      createServer: (o) => ({ server: createTestMcpServer(o) }),
    });
    t.after(() => started.close());

    const baseUrl = `http://127.0.0.1:${started.port}`;

    // Attacker (198.51.100.10) triggers auth lockout even while trying to prepend spoofed IPs
    for (let i = 1; i <= 2; i += 1) {
      const fail = await sendHttpRequest(baseUrl, '/mcp', {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer wrong-${i}`,
          'X-Forwarded-For': `10.0.0.${i}, 198.51.100.10`,
        },
        body: makeInitBody(),
      });
      assert.equal(fail.status, 401);
    }

    // Attacker is locked out with 429 regardless of prepended spoofed XFF entries
    const attackerLocked = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${authToken}`,
        'X-Forwarded-For': '192.0.2.99, 198.51.100.10',
      },
      body: makeInitBody(),
    });
    assert.equal(attackerLocked.status, 429);

    // Legitimate client (203.0.113.50) behind the same proxy is NOT locked out
    const legitimate = await sendHttpRequest(baseUrl, '/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${authToken}`,
        'X-Forwarded-For': '203.0.113.50',
      },
      body: makeInitBody(),
    });
    assert.equal(legitimate.status, 200);
  });

  void it('enforces Host/Origin DNS-rebinding protection and rate limiting on /healthz and /readyz', async (t) => {
    const started = await startStreamableHttpServer({
      host: '127.0.0.1',
      port: 0,
      mode: 'stateful',
      mcpRateLimitPerMinute: 2,
      mcpRateLimitWindowMs: 60_000,
      version: '1.0.0',
      createServer: (o) => ({ server: createTestMcpServer(o) }),
    });
    t.after(() => started.close());

    const baseUrl = `http://127.0.0.1:${started.port}`;

    for (const path of ['/healthz', '/readyz']) {
      const forgedHost = await sendHttpRequest(baseUrl, path, {
        method: 'GET',
        headers: { Host: 'evil.rebound.example:3000' },
      });
      assert.equal(forgedHost.status, 403);

      const forgedOrigin = await sendHttpRequest(baseUrl, path, {
        method: 'GET',
        headers: { Origin: 'https://evil.example' },
      });
      assert.equal(forgedOrigin.status, 403);
    }

    // Valid loopback requests succeed up to the rate limit, then return 429 + Retry-After
    const okHealth = await sendHttpRequest(baseUrl, '/healthz', {
      method: 'GET',
    });
    assert.equal(okHealth.status, 200);

    const okReady = await sendHttpRequest(baseUrl, '/readyz', {
      method: 'GET',
    });
    assert.equal(okReady.status, 200);

    const throttledHealth = await sendHttpRequest(baseUrl, '/healthz', {
      method: 'GET',
    });
    assert.equal(throttledHealth.status, 429);
    const retryAfter = Number(throttledHealth.headers['retry-after']);
    assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1);
  });
});
