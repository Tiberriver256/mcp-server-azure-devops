import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { describe, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  JsonRpcError,
  createHttpMcpClient,
  startHttpMcpServer,
} from '../harness/mcp-http-client.mjs';
import { spawnServerExpectExit } from '../harness/mcp-stdio-client.mjs';
import { createMockAdoServer } from '../harness/mock-ado-server.mjs';

const TEST_PAT = 'e2e-tier2-pat-secret-0123456789';
const WEBHOOK_SECRET = 'e2e-tier2-webhook-secret-42';
const CURSOR_RE = /^v1:([0-9a-f]{8}):(\d+)$/;

function makePatEnv(orgUrl, extra = {}) {
  return {
    AZURE_DEVOPS_ORG_URL: orgUrl,
    AZURE_DEVOPS_AUTH_METHOD: 'pat',
    AZURE_DEVOPS_PAT: TEST_PAT,
    AZURE_DEVOPS_DEFAULT_PROJECT: 'DemoProject',
    ...extra,
  };
}

function makeWorkItemUpdatedWebhook(overrides = {}) {
  const workItemId = overrides.workItemId ?? 101;
  const rev = overrides.rev ?? 2;
  return {
    id: overrides.id ?? crypto.randomUUID(),
    eventType: 'workitem.updated',
    publisherId: 'tfs',
    createdDate: new Date().toISOString(),
    resourceContainers: {
      collection: {
        id: 'coll-default',
        baseUrl: 'http://127.0.0.1/tfs/DefaultCollection',
      },
      project: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: 'DemoProject',
      },
    },
    resource: {
      id: rev,
      workItemId,
      rev,
      revisedBy: {
        displayName: 'Alice Reviewer',
        uniqueName: 'alice@example.com',
      },
      fields: {
        'System.State': { oldValue: 'New', newValue: 'Active' },
      },
      revision: {
        id: workItemId,
        rev,
        fields: {
          'System.Title':
            overrides.title ?? `Work item ${workItemId} rev ${rev}`,
          'System.State': 'Active',
          'System.TeamProject': 'DemoProject',
          'System.WorkItemType': 'User Story',
        },
      },
    },
  };
}

function signWebhookHmac(rawBody, secret) {
  const digest = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');
  return `sha256=${digest}`;
}

function postWebhookKeepAlive(urlObj, agent, bodyStr, secret) {
  const bodyBuf = Buffer.from(bodyStr, 'utf8');
  const hostname = urlObj.hostname.replace(/^\[|\]$/g, '');
  return new Promise((resolve, reject) => {
    let settled = false;
    const finishResolve = (status) => {
      if (!settled) {
        settled = true;
        resolve(status);
      }
    };
    const finishReject = (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };

    const req = http.request(
      {
        hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        agent,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(bodyBuf.length),
          'X-ADO-Webhook-Secret': secret,
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => finishResolve(res.statusCode ?? 0));
        res.on('close', () => {
          if (!res.complete) {
            finishReject(new Error('Webhook response closed prematurely'));
          }
        });
        res.on('error', finishReject);
      },
    );
    req.setTimeout(15000, () => {
      req.destroy(new Error('Webhook burst request timed out'));
    });
    req.on('error', finishReject);
    req.end(bodyBuf);
  });
}

describe('Tier 2 Boundaries — MCP Events, SEP-3415, Webhooks & Resource Subscriptions (Area 10, F24–F25)', () => {
  test('Area 10 (F24): POST /webhooks/ado returns 404 when webhook secret is unset (disabled by default)', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const server = await startHttpMcpServer({
      passPortZero: true,
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await server.close();
    });

    const webhookClient = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      webhookClient.close();
    });

    const res = await webhookClient.postWebhook(makeWorkItemUpdatedWebhook());
    assert.equal(
      res.status,
      404,
      `Expected POST /webhooks/ado to return 404 when webhook secret is unset, got ${res.status}`,
    );
  });

  test('Area 10 (F24): POST /webhooks/ado enforces 401 on missing/wrong auth and 200 on valid Secret, Basic Auth, and HMAC-SHA256', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const server = await startHttpMcpServer({
      passPortZero: true,
      args: ['--webhook-secret', WEBHOOK_SECRET],
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await server.close();
    });

    // Separate client with NO defaultHeaders so MCP auth headers cannot leak into webhook requests
    const webhookClient = createHttpMcpClient(server.baseUrl);
    const mcpClient = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      webhookClient.close();
      mcpClient.close();
    });

    await mcpClient.initialize();
    const boot = await mcpClient.request('events/poll', {
      name: 'ado.work_item.updated',
      arguments: {},
      cursor: null,
    });

    const payloadObj = makeWorkItemUpdatedWebhook();
    const rawBody = JSON.stringify(payloadObj);

    const missingAuth = await webhookClient.postWebhook(rawBody, {
      'Content-Type': 'application/json',
    });
    assert.equal(
      missingAuth.status,
      401,
      `Expected 401 on missing webhook auth, got ${missingAuth.status}`,
    );

    const wrongBasic = await webhookClient.postWebhook(rawBody, {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from('ado:wrong-secret').toString('base64')}`,
    });
    assert.equal(
      wrongBasic.status,
      401,
      `Expected 401 on wrong Basic Auth, got ${wrongBasic.status}`,
    );

    const wrongSecretHeader = await webhookClient.postWebhook(rawBody, {
      'Content-Type': 'application/json',
      'X-ADO-Webhook-Secret': 'wrong-secret',
    });
    assert.equal(
      wrongSecretHeader.status,
      401,
      `Expected 401 on wrong X-ADO-Webhook-Secret, got ${wrongSecretHeader.status}`,
    );

    const wrongHmac = await webhookClient.postWebhook(rawBody, {
      'Content-Type': 'application/json',
      'X-Webhook-Signature-256': `sha256=${'0'.repeat(64)}`,
    });
    assert.equal(
      wrongHmac.status,
      401,
      `Expected 401 on wrong X-Webhook-Signature-256, got ${wrongHmac.status}`,
    );

    const afterRejected = await mcpClient.request('events/poll', {
      name: 'ado.work_item.updated',
      arguments: {},
      cursor: boot.cursor,
    });
    assert.equal(
      Array.isArray(afterRejected.events) ? afterRejected.events.length : -1,
      0,
      'Rejected 401 webhooks MUST NOT be ingested into the event buffer',
    );

    // Valid X-ADO-Webhook-Secret -> 200
    const validSecret = await webhookClient.postWebhook(
      JSON.stringify(makeWorkItemUpdatedWebhook()),
      {
        'Content-Type': 'application/json',
        'X-ADO-Webhook-Secret': WEBHOOK_SECRET,
      },
    );
    assert.equal(
      validSecret.status,
      200,
      `Expected 200 for valid X-ADO-Webhook-Secret, got ${validSecret.status} (${validSecret.text})`,
    );

    // Valid Basic Auth -> 200
    const validBasic = await webhookClient.postWebhook(
      JSON.stringify(makeWorkItemUpdatedWebhook()),
      {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`ado:${WEBHOOK_SECRET}`).toString('base64')}`,
      },
    );
    assert.equal(
      validBasic.status,
      200,
      `Expected 200 for valid Basic Auth webhook secret, got ${validBasic.status} (${validBasic.text})`,
    );

    // Valid HMAC-SHA256 over exact serialized bytes -> 200
    const hmacBody = JSON.stringify(makeWorkItemUpdatedWebhook());
    const validHmac = await webhookClient.postWebhook(hmacBody, {
      'Content-Type': 'application/json',
      'X-Webhook-Signature-256': signWebhookHmac(hmacBody, WEBHOOK_SECRET),
    });
    assert.equal(
      validHmac.status,
      200,
      `Expected 200 for valid HMAC-SHA256 webhook signature, got ${validHmac.status} (${validHmac.text})`,
    );
  });

  test('Area 10 (F24): POST /webhooks/ado rejects payloads > 256 KiB with 413 Payload Too Large', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const server = await startHttpMcpServer({
      passPortZero: true,
      args: ['--webhook-secret', WEBHOOK_SECRET],
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await server.close();
    });

    const webhookClient = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      webhookClient.close();
    });

    const oversizedPayload = JSON.stringify({
      ...makeWorkItemUpdatedWebhook(),
      padding: 'x'.repeat(260 * 1024),
    });
    assert.ok(
      Buffer.byteLength(oversizedPayload, 'utf8') > 256 * 1024,
      'Sanity check: webhook payload exceeds 256 KiB',
    );

    const res = await webhookClient.postWebhook(oversizedPayload, {
      'Content-Type': 'application/json',
      'X-ADO-Webhook-Secret': WEBHOOK_SECRET,
    });
    assert.equal(
      res.status,
      413,
      `Expected 413 Payload Too Large for >256 KiB webhook body, got ${res.status}`,
    );

    const health = await webhookClient.getHealthz();
    assert.equal(
      health.status,
      200,
      `Expected server /healthz to remain 200 after rejecting 413 webhook, got ${health.status}`,
    );
  });

  test('Area 10 (F24): POST /webhooks/ado rejects non-JSON Content-Type with 415 and malformed JSON with 400', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const server = await startHttpMcpServer({
      passPortZero: true,
      args: ['--webhook-secret', WEBHOOK_SECRET],
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await server.close();
    });

    const webhookClient = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      webhookClient.close();
    });

    const wrongType = await webhookClient.postWebhook('not-json-plain-text', {
      'Content-Type': 'text/plain',
      'X-ADO-Webhook-Secret': WEBHOOK_SECRET,
    });
    assert.equal(
      wrongType.status,
      415,
      `Expected 415 Unsupported Media Type for text/plain webhook, got ${wrongType.status}`,
    );

    const malformedJson = await webhookClient.postWebhook('{not-valid-json', {
      'Content-Type': 'application/json',
      'X-ADO-Webhook-Secret': WEBHOOK_SECRET,
    });
    assert.equal(
      malformedJson.status,
      400,
      `Expected 400 Bad Request for malformed JSON webhook, got ${malformedJson.status}`,
    );
  });

  test('Area 10 (F24/F25): events/poll returns truncated: true + fresh cursor (never JSON-RPC error) for evicted cursor and mismatched boot epoch', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const server = await startHttpMcpServer({
      passPortZero: true,
      args: ['--webhook-secret', WEBHOOK_SECRET, '--event-buffer-size', '3'],
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await server.close();
    });

    const mcpClient = createHttpMcpClient(server.baseUrl);
    const webhookClient = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      mcpClient.close();
      webhookClient.close();
    });

    await mcpClient.initialize();

    const boot = await mcpClient.request('events/poll', {
      name: 'ado.work_item.updated',
      arguments: {},
      cursor: null,
    });
    assert.equal(boot.truncated, false);
    const bootMatch = CURSOR_RE.exec(String(boot.cursor ?? ''));
    assert.ok(
      bootMatch,
      `Expected bootstrap cursor matching v1:<8-hex>:<seq>, got: ${boot.cursor}`,
    );
    const serverEpoch = bootMatch[1];

    // Ingest 6 valid webhook events into a ring buffer of size 3 -> evicts boot.cursor
    for (let i = 1; i <= 6; i += 1) {
      const hookRes = await webhookClient.postWebhook(
        JSON.stringify(
          makeWorkItemUpdatedWebhook({
            rev: i + 10,
            title: `Eviction event ${i}`,
          }),
        ),
        {
          'Content-Type': 'application/json',
          'X-ADO-Webhook-Secret': WEBHOOK_SECRET,
        },
      );
      assert.equal(hookRes.status, 200);
    }

    // 1. Evicted cursor -> truncated: true + fresh cursor + retained tail (<= 3)
    const evicted = await mcpClient.request('events/poll', {
      name: 'ado.work_item.updated',
      arguments: {},
      cursor: boot.cursor,
    });
    assert.equal(
      evicted.truncated,
      true,
      'Expected truncated: true when polling with an evicted cursor',
    );
    assert.match(String(evicted.cursor ?? ''), CURSOR_RE);
    assert.notEqual(evicted.cursor, boot.cursor);
    assert.ok(Array.isArray(evicted.events));
    assert.ok(
      evicted.events.length >= 1 && evicted.events.length <= 3,
      `Expected 1..3 retained tail events from buffer size 3, got ${evicted.events.length}`,
    );

    // 2. Mismatched boot epoch cursor -> truncated: true + fresh cursor matching current epoch
    const fakeEpoch = serverEpoch === 'deadbeef' ? 'cafebabe' : 'deadbeef';
    const mismatched = await mcpClient.request('events/poll', {
      name: 'ado.work_item.updated',
      arguments: {},
      cursor: `v1:${fakeEpoch}:1`,
    });
    assert.equal(
      mismatched.truncated,
      true,
      'Expected truncated: true for mismatched boot epoch cursor (never JSON-RPC error)',
    );
    const mismatchedMatch = CURSOR_RE.exec(String(mismatched.cursor ?? ''));
    assert.ok(
      mismatchedMatch,
      `Expected valid fresh cursor on epoch mismatch, got: ${mismatched.cursor}`,
    );
    assert.equal(
      mismatchedMatch[1],
      serverEpoch,
      'Fresh cursor after epoch mismatch must carry the current server boot epoch',
    );
  });

  test('Area 10 (F25): events/poll with unknown event name rejects with JsonRpcError -32023', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const server = await startHttpMcpServer({
      passPortZero: true,
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await server.close();
    });

    const mcpClient = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      mcpClient.close();
    });

    await mcpClient.initialize();

    await assert.rejects(
      () =>
        mcpClient.request('events/poll', {
          name: 'ado.nonexistent.event',
          arguments: {},
          cursor: null,
        }),
      (err) => {
        assert.equal(
          err instanceof JsonRpcError,
          true,
          `Expected JsonRpcError, got: ${String(err)}`,
        );
        assert.equal(
          err.code,
          -32023,
          `Expected SEP-3415 NotFound (-32023) for unknown event name, got ${err.code}`,
        );
        return true;
      },
    );
  });

  test('Area 10 (F25): events/poll with invalid arguments (negative maxEvents, wrong filter type) rejects with JsonRpcError -32602', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const server = await startHttpMcpServer({
      passPortZero: true,
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await server.close();
    });

    const mcpClient = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      mcpClient.close();
    });

    await mcpClient.initialize();

    await assert.rejects(
      () =>
        mcpClient.request('events/poll', {
          name: 'ado.work_item.updated',
          arguments: {},
          cursor: null,
          maxEvents: -5,
        }),
      (err) => {
        assert.equal(err instanceof JsonRpcError, true);
        assert.equal(
          err.code,
          -32602,
          `Expected InvalidParams (-32602) for maxEvents: -5, got ${err.code}`,
        );
        return true;
      },
    );

    await assert.rejects(
      () =>
        mcpClient.request('events/poll', {
          name: 'ado.work_item.updated',
          arguments: { workItemId: 'not-a-valid-integer' },
          cursor: null,
        }),
      (err) => {
        assert.equal(err instanceof JsonRpcError, true);
        assert.equal(
          err.code,
          -32602,
          `Expected InvalidParams (-32602) for wrong filter argument type, got ${err.code}`,
        );
        return true;
      },
    );
  });

  test('Area 10 (F25): events/subscribe and events/unsubscribe both reject with JsonRpcError -32026 (Unsupported)', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const server = await startHttpMcpServer({
      passPortZero: true,
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await server.close();
    });

    const mcpClient = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      mcpClient.close();
    });

    await mcpClient.initialize();

    await assert.rejects(
      () =>
        mcpClient.request('events/subscribe', {
          name: 'ado.work_item.updated',
          arguments: {},
          delivery: {
            mode: 'webhook',
            url: 'https://receiver.example/mcp-webhook',
            secret: `whsec_${'A'.repeat(43)}=`,
          },
        }),
      (err) => {
        assert.equal(err instanceof JsonRpcError, true);
        assert.equal(
          err.code,
          -32026,
          `Expected Unsupported (-32026) for events/subscribe, got ${err.code}`,
        );
        return true;
      },
    );

    await assert.rejects(
      () =>
        mcpClient.request('events/unsubscribe', {
          id: 'sub-nonexistent',
        }),
      (err) => {
        assert.equal(err instanceof JsonRpcError, true);
        assert.equal(
          err.code,
          -32026,
          `Expected Unsupported (-32026) for events/unsubscribe, got ${err.code}`,
        );
        return true;
      },
    );
  });

  test('Area 10 (F25): resource subscription quota rejects 21st subscription with -32025 and frees slot on unsubscribe', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    // Seed work items 1..21 so eager baseline validation on resources/subscribe succeeds for 1..20
    mockAdo.mutateState((st) => {
      const template = st.workItems[101];
      for (let i = 1; i <= 21; i += 1) {
        const wi = {
          ...structuredClone(template),
          id: i,
          rev: 1,
          url: `${mockAdo.collectionUrl}/DemoProject/_apis/wit/workItems/${i}`,
          fields: {
            ...structuredClone(template.fields),
            'System.Id': i,
            'System.Title': `Quota test work item ${i}`,
          },
        };
        st.workItems[i] = wi;
        st.workItemRevisions[i] = [wi];
      }
    });

    const server = await startHttpMcpServer({
      passPortZero: true,
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await server.close();
    });

    const mcpClient = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      mcpClient.close();
    });

    await mcpClient.initialize();

    for (let i = 1; i <= 20; i += 1) {
      await mcpClient.subscribeResource(
        `ado://DefaultCollection/DemoProject/events/work-items/${i}`,
      );
    }

    const uri21 = 'ado://DefaultCollection/DemoProject/events/work-items/21';
    await assert.rejects(
      () => mcpClient.subscribeResource(uri21),
      (err) => {
        assert.equal(
          err instanceof JsonRpcError,
          true,
          `Expected JsonRpcError on 21st subscription, got: ${String(err)}`,
        );
        assert.equal(
          err.code,
          -32025,
          `Expected ResourceExhausted (-32025) on 21st subscription, got ${err.code}`,
        );
        return true;
      },
    );

    await mcpClient.unsubscribeResource(
      'ado://DefaultCollection/DemoProject/events/work-items/1',
    );
    await mcpClient.subscribeResource(uri21);
  });

  test('Area 10 (F24): event config bounds (--event-poll-interval 100 and --event-buffer-size 50000) are clamped or rejected fail-fast', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    // Part A: Sub-floor --event-poll-interval 100 (< 10000ms) -> rejected OR clamped to >= 10000ms
    let pollServer = null;
    let pollStartupError = null;
    try {
      pollServer = await startHttpMcpServer({
        passPortZero: true,
        args: ['--event-poll-interval', '100'],
        env: makePatEnv(mockAdo.collectionUrl),
      });
      t.after(async () => {
        await pollServer.close();
      });
    } catch (err) {
      pollStartupError = err;
    }

    if (pollStartupError) {
      assert.equal(
        typeof pollStartupError.code,
        'number',
        `Expected numeric exit code (not timeout/spawn error ${String(pollStartupError.code)}) when rejecting --event-poll-interval 100`,
      );
      assert.notEqual(
        pollStartupError.code,
        0,
        'Expected non-zero exit when rejecting sub-floor --event-poll-interval 100',
      );
      const pollErrText = String(
        pollStartupError.stderr ?? pollStartupError.message,
      );
      assert.doesNotMatch(
        pollErrText,
        /unknown\s+(?:flag|option|argument)|unrecognized/i,
        `Unimplemented --event-poll-interval flag must not pass as bounds rejection: ${pollErrText}`,
      );
      assert.match(
        pollErrText,
        /10000|minimum|floor|at least|below|range|out of bounds|invalid|>=/i,
        `Expected bounds-violation error for --event-poll-interval 100, got: ${pollErrText}`,
      );
    } else {
      const client = createHttpMcpClient(pollServer.baseUrl);
      t.after(() => {
        client.close();
      });
      await client.initialize();
      const pollRes = await client.request('events/poll', {
        name: 'ado.work_item.updated',
        arguments: {},
        cursor: null,
      });
      assert.ok(
        typeof pollRes.nextPollMs === 'number' && pollRes.nextPollMs > 0,
        `Expected positive numeric nextPollMs, got nextPollMs=${pollRes.nextPollMs}`,
      );
      mockAdo.clearRequests();
      await client.subscribeResource(
        'ado://DefaultCollection/DemoProject/events/work-items/101',
      );
      await delay(600);
      const wiPolls = mockAdo.requests.filter(
        (r) =>
          r.method !== 'OPTIONS' &&
          /\/_apis\/wit\/workitems(?:batch)?(?:\/101|\b)/i.test(r.relPath),
      );
      assert.ok(
        wiPolls.length <= 2,
        `Polling watcher hammered ADO ${wiPolls.length} times in 600ms (100ms sub-floor was NOT enforced!)`,
      );
    }

    // Part B: Over-ceiling --event-buffer-size 50000 (> 10000) -> rejected OR clamped to <= 10000
    let bufServer = null;
    let bufStartupError = null;
    try {
      bufServer = await startHttpMcpServer({
        passPortZero: true,
        args: [
          '--event-buffer-size',
          '50000',
          '--webhook-secret',
          WEBHOOK_SECRET,
        ],
        env: makePatEnv(mockAdo.collectionUrl),
      });
      t.after(async () => {
        await bufServer.close();
      });
    } catch (err) {
      bufStartupError = err;
    }

    if (bufStartupError) {
      assert.equal(
        typeof bufStartupError.code,
        'number',
        `Expected numeric exit code (not timeout/spawn error ${String(bufStartupError.code)}) when rejecting --event-buffer-size 50000`,
      );
      assert.notEqual(
        bufStartupError.code,
        0,
        'Expected non-zero exit when rejecting over-ceiling --event-buffer-size 50000',
      );
      const bufErrText = String(
        bufStartupError.stderr ?? bufStartupError.message,
      );
      assert.doesNotMatch(
        bufErrText,
        /unknown\s+(?:flag|option|argument)|unrecognized/i,
        `Unimplemented --event-buffer-size flag must not pass as bounds rejection: ${bufErrText}`,
      );
      assert.match(
        bufErrText,
        /10000|maximum|ceiling|at most|exceed|range|out of bounds|invalid|<=/i,
        `Expected bounds-violation error for --event-buffer-size 50000, got: ${bufErrText}`,
      );
    } else {
      const client = createHttpMcpClient(bufServer.baseUrl);
      t.after(() => {
        client.close();
      });
      await client.initialize();
      const basePoll = await client.request('events/poll', {
        name: 'ado.work_item.updated',
        arguments: {},
        cursor: null,
      });
      assert.match(String(basePoll.cursor ?? ''), CURSOR_RE);

      // Prove the 10000 ceiling is genuinely enforced when clamping (10,005 webhooks must evict baseCursor)
      const burstTotal = 10_005;
      const concurrency = 32;
      const webhookUrl = new URL(bufServer.webhookUrl);
      const agent = new http.Agent({
        keepAlive: true,
        maxSockets: concurrency,
      });
      t.after(() => {
        agent.destroy();
      });

      let nextIdx = 0;
      let aborted = false;
      const runWorker = async () => {
        while (!aborted) {
          const idx = nextIdx;
          nextIdx += 1;
          if (idx >= burstTotal) {
            return;
          }
          let status;
          try {
            status = await postWebhookKeepAlive(
              webhookUrl,
              agent,
              JSON.stringify(
                makeWorkItemUpdatedWebhook({
                  id: `00000000-0000-4000-8000-${String(idx).padStart(12, '0')}`,
                  workItemId: 101,
                  rev: idx + 1,
                  title: `Burst ${idx}`,
                }),
              ),
              WEBHOOK_SECRET,
            );
          } catch (err) {
            aborted = true;
            throw err;
          }
          if (status !== 200) {
            aborted = true;
            assert.equal(
              status,
              200,
              `Expected 200 for ceiling-proof webhook #${idx}, got ${status}`,
            );
          }
        }
      };
      const workers = Array.from({ length: concurrency }, () => runWorker());
      let results;
      try {
        results = await Promise.allSettled(workers);
      } finally {
        aborted = true;
        agent.destroy();
      }
      const failedWorker = results.find((r) => r.status === 'rejected');
      if (failedWorker) {
        throw failedWorker.reason;
      }

      const pollAfterBurst = await client.request('events/poll', {
        name: 'ado.work_item.updated',
        arguments: {},
        cursor: basePoll.cursor,
      });
      assert.equal(
        pollAfterBurst.truncated,
        true,
        `Expected --event-buffer-size 50000 to clamp to <= 10000 so ${burstTotal} webhooks evict baseCursor (truncated: true)`,
      );
    }

    // Part C: Negative bounds MUST always be rejected fail-fast unconditionally
    const negPollRes = await spawnServerExpectExit(
      ['--transport', 'http', '--port', '0', '--event-poll-interval=-1'],
      makePatEnv(mockAdo.collectionUrl),
      10000,
    );
    assert.equal(
      negPollRes.timedOut,
      false,
      `Expected --event-poll-interval=-1 to fail fast, not time out. stderr=${negPollRes.stderr}`,
    );
    assert.notEqual(
      negPollRes.code,
      0,
      'Expected negative --event-poll-interval=-1 to fail fast with non-zero exit',
    );
    assert.doesNotMatch(
      negPollRes.stderr,
      /unknown\s+(?:flag|option|argument)|unrecognized|TypeError|ReferenceError|SyntaxError/i,
      `Unimplemented flag or runtime crash must not satisfy negative poll-interval check: ${negPollRes.stderr}`,
    );
    assert.match(
      negPollRes.stderr,
      /10000|minimum|floor|positive|negative|invalid|range|out of bounds|>=/i,
      `Expected bounds/negative validation error for --event-poll-interval=-1, got: ${negPollRes.stderr}`,
    );

    const negBufRes = await spawnServerExpectExit(
      ['--transport', 'http', '--port', '0', '--event-buffer-size=-5'],
      makePatEnv(mockAdo.collectionUrl),
      10000,
    );
    assert.equal(
      negBufRes.timedOut,
      false,
      `Expected --event-buffer-size=-5 to fail fast, not time out. stderr=${negBufRes.stderr}`,
    );
    assert.notEqual(
      negBufRes.code,
      0,
      'Expected negative --event-buffer-size=-5 to fail fast with non-zero exit',
    );
    assert.doesNotMatch(
      negBufRes.stderr,
      /unknown\s+(?:flag|option|argument)|unrecognized|TypeError|ReferenceError|SyntaxError/i,
      `Unimplemented flag or runtime crash must not satisfy negative buffer-size check: ${negBufRes.stderr}`,
    );
    assert.match(
      negBufRes.stderr,
      /10000|positive|negative|invalid|range|out of bounds|minimum|at least|>=/i,
      `Expected bounds/negative validation error for --event-buffer-size=-5, got: ${negBufRes.stderr}`,
    );
  });

  test('Area 10 (F24): attacker-controlled 500-char webhook title is truncated to <= 200 chars in EventOccurrence.data.title', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const server = await startHttpMcpServer({
      passPortZero: true,
      args: ['--webhook-secret', WEBHOOK_SECRET],
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await server.close();
    });

    const mcpClient = createHttpMcpClient(server.baseUrl);
    const webhookClient = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      mcpClient.close();
      webhookClient.close();
    });

    await mcpClient.initialize();
    const boot = await mcpClient.request('events/poll', {
      name: 'ado.work_item.updated',
      arguments: {},
      cursor: null,
    });

    const longAttackerTitle = `ATTACK_${'X'.repeat(500)}`;
    const hookRes = await webhookClient.postWebhook(
      JSON.stringify(
        makeWorkItemUpdatedWebhook({
          workItemId: 101,
          rev: 99,
          title: longAttackerTitle,
        }),
      ),
      {
        'Content-Type': 'application/json',
        'X-ADO-Webhook-Secret': WEBHOOK_SECRET,
      },
    );
    assert.equal(hookRes.status, 200);

    const pollRes = await mcpClient.request('events/poll', {
      name: 'ado.work_item.updated',
      arguments: {},
      cursor: boot.cursor,
    });
    assert.ok(
      Array.isArray(pollRes.events) && pollRes.events.length >= 1,
      'Expected ingested webhook event to appear in events/poll response',
    );
    const matchingEvent = pollRes.events.find(
      (ev) => ev?.name === 'ado.work_item.updated',
    );
    assert.ok(matchingEvent, 'Expected ado.work_item.updated occurrence');
    assert.equal(
      typeof matchingEvent.data?.title,
      'string',
      'Expected string EventOccurrence.data.title',
    );
    assert.ok(
      matchingEvent.data.title.length > 0 &&
        matchingEvent.data.title.length <= 200,
      `Expected webhook title to be truncated to <= 200 chars, got length=${matchingEvent.data.title.length}`,
    );
    assert.ok(
      matchingEvent.data.title.startsWith('ATTACK_'),
      `Expected truncated webhook title to preserve attacker input prefix "ATTACK_", got: ${matchingEvent.data.title}`,
    );
  });
});
