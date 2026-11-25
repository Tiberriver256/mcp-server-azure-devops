import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import {
  readRepoFile,
  readRepoJson,
  repoFileExists,
  unwrapToolResultJson,
} from '../harness/assertions.mjs';
import {
  createHttpMcpClient,
  startHttpMcpServer,
} from '../harness/mcp-http-client.mjs';
import { createMockAdoServer } from '../harness/mock-ado-server.mjs';

function registerCleanup(t) {
  const cleanups = [];
  t.after(async () => {
    let firstErr = null;
    for (let i = cleanups.length - 1; i >= 0; i -= 1) {
      try {
        await cleanups[i]();
      } catch (err) {
        if (!firstErr) {
          firstErr = err;
        }
      }
    }
    if (firstErr) {
      throw firstErr;
    }
  });
  return (fn) => {
    cleanups.push(fn);
  };
}

function makeStandardEnv(mockAdo, extra = {}) {
  return {
    AZURE_DEVOPS_ORG_URL: mockAdo.url,
    AZURE_DEVOPS_AUTH_METHOD: 'pat',
    AZURE_DEVOPS_PAT: 'test-pat-12345',
    AZURE_DEVOPS_DEFAULT_PROJECT: 'DemoProject',
    ...extra,
  };
}

function makeGitPushWebhook(pushId, eventUuid, comment) {
  return {
    id: eventUuid,
    eventType: 'git.push',
    publisherId: 'tfs',
    createdDate: '2026-11-25T10:00:00Z',
    resourceVersion: '1.0',
    resourceContainers: {
      project: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    },
    resource: {
      pushId,
      url: `http://127.0.0.1/tfs/DefaultCollection/DemoProject/_git/DemoRepo/pushes/${pushId}`,
      pushedBy: {
        displayName: 'Bob Developer',
        uniqueName: 'bob@example.com',
      },
      refUpdates: [
        {
          name: 'refs/heads/main',
          oldObjectId: '1111111111111111111111111111111111111111',
          newObjectId: '9999999999999999999999999999999999999999',
        },
      ],
      commits: [
        {
          commitId: '9999999999999999999999999999999999999999',
          comment,
        },
      ],
      repository: {
        id: '77777777-7777-4777-8777-777777777777',
        name: 'DemoRepo',
        project: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          name: 'DemoProject',
        },
      },
    },
  };
}

describe('Tier 1 — Area 9: Streamable HTTP Transport & Official Docker Image (F22, F23)', () => {
  it('T7.1 [F22] GET /healthz and GET /readyz return 200 OK with version/mode metadata and zero ADO calls', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const srv = await startHttpMcpServer({
      passPortZero: true,
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => srv.close());

    const client = createHttpMcpClient(srv.baseUrl);
    addCleanup(() => client.close());

    const pkg = readRepoJson('package.json');

    const healthz = await client.getHealthz();
    assert.equal(healthz.status, 200);
    assert.equal(healthz.json?.status, 'ok');
    assert.equal(healthz.json?.version, pkg.version);

    const readyz = await client.getReadyz();
    assert.equal(readyz.status, 200);
    assert.ok(
      readyz.json &&
        typeof readyz.json === 'object' &&
        !Array.isArray(readyz.json),
      'Expected JSON object body from /readyz',
    );
    const readyStatus =
      typeof readyz.json.status === 'string'
        ? readyz.json.status.toLowerCase()
        : null;
    assert.ok(
      readyStatus === 'ready' ||
        readyStatus === 'ok' ||
        readyz.json.ready === true,
      `Expected /readyz to report status "ready"/"ok" or ready: true, got ${JSON.stringify(readyz.json)}`,
    );
    assert.equal(
      mockAdo.requests.length,
      0,
      'Health probes must not trigger Azure DevOps requests',
    );
  });

  it('T7.2 [F22] Stateful Streamable HTTP lifecycle: initialize issues Mcp-Session-Id, tools/list, spotlighted tools/call, DELETE /mcp terminates session (404 on reuse)', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const srv = await startHttpMcpServer({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => srv.close());

    const client = createHttpMcpClient(srv.baseUrl);
    addCleanup(() => client.close());

    await client.initialize();
    const sessionId = client.sessionId;
    assert.ok(
      typeof sessionId === 'string' && sessionId.trim().length > 0,
      `Expected non-empty Mcp-Session-Id in stateful mode, got ${JSON.stringify(sessionId)}`,
    );

    const { tools } = await client.listTools();
    assert.ok(Array.isArray(tools) && tools.length >= 70);

    const projRes = await client.callTool('list_projects', {});
    const projects = unwrapToolResultJson(projRes, { expectSpotlighted: true });
    const projStr = JSON.stringify(projects);
    assert.ok(projStr.includes('DemoProject'));
    assert.ok(projStr.includes('OtherProject'));

    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'GET' && /^\/_apis\/projects$/i.test(req.relPath),
      ),
      'Expected GET /_apis/projects on mock ADO server',
    );

    const delRes = await client.deleteSession();
    assert.ok(
      delRes.status === 200 || delRes.status === 204,
      `Expected DELETE /mcp to return 200 or 204, got ${delRes.status}`,
    );

    // Reusing the terminated session ID must return HTTP 404
    const reuseRes = await client.rawRequest('/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Mcp-Session-Id': sessionId,
        'MCP-Protocol-Version': '2025-11-25',
      },
      body: {
        jsonrpc: '2.0',
        id: 999,
        method: 'tools/list',
        params: {},
      },
    });
    assert.equal(
      reuseRes.status,
      404,
      `Expected HTTP 404 when reusing terminated Mcp-Session-Id, got ${reuseRes.status}`,
    );
  });

  it('T7.3 [F22] Stateful GET /mcp SSE stream + Last-Event-ID resumability replays missed event on reconnect', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const secret = 'e2e-resume-wh-secret';
    const srv = await startHttpMcpServer({
      args: ['--webhook-secret', secret],
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => srv.close());

    const client = createHttpMcpClient(srv.baseUrl);
    addCleanup(() => client.close());

    await client.initialize();
    assert.ok(client.sessionId, 'Expected stateful Mcp-Session-Id');

    const uri = 'ado://DefaultCollection/DemoProject/events/feed';
    const sse1 = await client.openSseStream();
    addCleanup(() => sse1.close());
    assert.equal(sse1.status, 200);

    await client.subscribeResource(uri);

    const wh1 = await client.postWebhook(
      makeGitPushWebhook(
        99,
        '11111111-aaaa-4aaa-8aaa-000000000099',
        'Resume event 1',
      ),
      { 'X-ADO-Webhook-Secret': secret },
    );
    assert.equal(wh1.status, 200);

    const ev1 = await sse1.waitForEvent(
      (ev) => ev.json?.method === 'notifications/resources/updated',
      5000,
    );
    assert.equal(ev1.json?.params?.uri, uri);
    assert.ok(
      typeof ev1.id === 'string' && ev1.id.trim().length > 0,
      `Expected non-empty SSE event id for Last-Event-ID resumability, got ${JSON.stringify(ev1.id)}`,
    );

    // Disconnect first SSE stream and wait briefly for server-side TCP FIN / cancel() cleanup
    sse1.close();
    await delay(150);

    const wh2 = await client.postWebhook(
      makeGitPushWebhook(
        100,
        '11111111-aaaa-4aaa-8aaa-000000000100',
        'Resume event 2 while offline',
      ),
      { 'X-ADO-Webhook-Secret': secret },
    );
    assert.equal(wh2.status, 200);

    // Reconnect with Last-Event-ID from ev1 -> must replay missed notification for event 2.
    // Under CPU load, SDK 1.32.2 may briefly return 409 until _GET_stream cancel() settles.
    let sse2 = null;
    const reconnectDeadline = Date.now() + 1000;
    while (true) {
      const attempt = await client.openSseStream({ lastEventId: ev1.id });
      if (attempt.status !== 409 || Date.now() >= reconnectDeadline) {
        sse2 = attempt;
        break;
      }
      attempt.close();
      await delay(50);
    }
    addCleanup(() => sse2.close());
    assert.equal(
      sse2.status,
      200,
      `Expected 200 on SSE reconnect with Last-Event-ID, got ${sse2.status}: ${sse2.text}`,
    );

    const ev2 = await sse2.waitForEvent(
      (ev) => ev.json?.method === 'notifications/resources/updated',
      5000,
    );
    assert.equal(ev2.json?.params?.uri, uri);
    assert.ok(
      typeof ev2.id === 'string' && ev2.id.length > 0 && ev2.id !== ev1.id,
      `Expected distinct replayed event id after ${ev1.id}, got ${JSON.stringify(ev2.id)}`,
    );

    const feedRes = await client.readResource(uri);
    const feedJson = JSON.parse(feedRes.contents[0].text);
    assert.ok(
      Array.isArray(feedJson.events) && feedJson.events.length >= 2,
      `Expected both webhook events in feed, got ${JSON.stringify(feedJson)}`,
    );
    assert.ok(
      feedJson.events.some(
        (ev) =>
          ev.eventId === '11111111-aaaa-4aaa-8aaa-000000000099' ||
          ev.data?.pushId === 99,
      ),
      `Expected push 99 event in feed, got ${JSON.stringify(feedJson)}`,
    );
    assert.ok(
      feedJson.events.some(
        (ev) =>
          ev.eventId === '11111111-aaaa-4aaa-8aaa-000000000100' ||
          ev.data?.pushId === 100,
      ),
      `Expected push 100 event in feed, got ${JSON.stringify(feedJson)}`,
    );
  });

  it('T7.4 [F22] Stateless Streamable HTTP (--http-mode stateless --enable-json-response) returns application/json, emits no Mcp-Session-Id, and handles repeated calls', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const srv = await startHttpMcpServer({
      args: ['--http-mode', 'stateless', '--enable-json-response'],
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => srv.close());

    const client = createHttpMcpClient(srv.baseUrl);
    addCleanup(() => client.close());

    await client.initialize(undefined, {}, { sendInitialized: false });
    assert.equal(
      client.sessionId,
      null,
      `Expected no Mcp-Session-Id in stateless mode, got ${JSON.stringify(client.sessionId)}`,
    );
    assert.match(
      String(client.lastResponseHeaders?.['content-type'] ?? ''),
      /application\/json/i,
      'Expected application/json on initialize response when --enable-json-response is set',
    );
    await client.notify('notifications/initialized');

    const res1 = await client.callTool('list_projects', {});
    assert.match(
      String(client.lastResponseHeaders?.['content-type'] ?? ''),
      /application\/json/i,
      'Expected application/json on first stateless tools/call response',
    );
    const data1 = unwrapToolResultJson(res1, { expectSpotlighted: true });
    assert.ok(JSON.stringify(data1).includes('DemoProject'));
    assert.equal(client.sessionId, null);

    const res2 = await client.callTool('list_projects', {});
    assert.match(
      String(client.lastResponseHeaders?.['content-type'] ?? ''),
      /application\/json/i,
      'Expected application/json on second stateless tools/call response',
    );
    const data2 = unwrapToolResultJson(res2, { expectSpotlighted: true });
    assert.ok(JSON.stringify(data2).includes('OtherProject'));
    assert.equal(client.sessionId, null);

    const projReqs = mockAdo.requests.filter(
      (req) => req.method === 'GET' && /^\/_apis\/projects$/i.test(req.relPath),
    );
    assert.equal(
      projReqs.length,
      2,
      'Expected two independent GET /_apis/projects calls across stateless invocations',
    );
  });

  it('T7.5 [F22] Custom --http-path /custom-mcp serves MCP on custom path and returns 404 on /mcp', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const srv = await startHttpMcpServer({
      httpPath: '/custom-mcp',
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => srv.close());

    const client = createHttpMcpClient(srv.baseUrl, {
      mcpPath: '/custom-mcp',
    });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    assert.ok(Array.isArray(tools) && tools.length >= 70);

    const defaultPathRes = await client.rawRequest('/mcp', {
      method: 'POST',
      headers: { Accept: 'application/json, text/event-stream' },
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'e2e', version: '1.0.0' },
        },
      },
    });
    assert.equal(
      defaultPathRes.status,
      404,
      `Expected 404 on /mcp when --http-path /custom-mcp is active, got ${defaultPathRes.status}`,
    );
  });

  it('T7.6 [F22] --http-auth-token authorizes Bearer callers on /mcp while keeping /healthz reachable without auth', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const token = 'tok-e2e-valid-99';
    const srv = await startHttpMcpServer({
      args: ['--http-auth-token', token],
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => srv.close());

    const client = createHttpMcpClient(srv.baseUrl, {
      defaultHeaders: { Authorization: `Bearer ${token}` },
    });
    addCleanup(() => client.close());

    const healthz = await client.rawRequest('/healthz', {
      method: 'GET',
      headers: { Authorization: null },
    });
    assert.equal(
      healthz.status,
      200,
      'Expected unauthenticated GET /healthz to remain reachable (200)',
    );

    const unauthMcp = await client.rawRequest('/mcp', {
      method: 'POST',
      headers: {
        Authorization: null,
        Accept: 'application/json, text/event-stream',
      },
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'e2e-unauth', version: '1.0.0' },
        },
      },
    });
    assert.equal(
      unauthMcp.status,
      401,
      `Expected unauthenticated POST /mcp to be rejected with 401 when --http-auth-token is set, got ${unauthMcp.status}`,
    );

    await client.initialize();
    const { tools } = await client.listTools();
    assert.ok(Array.isArray(tools) && tools.length >= 70);
  });

  it('T7.7 [F22] Opt-in --allow-per-request-pat forwards X-Azure-DevOps-PAT in isolated per-request/session context', async (t) => {
    const addCleanup = registerCleanup(t);
    const callerPat = 'caller-only-pat-777';
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: callerPat,
    });
    addCleanup(() => mockAdo.close());

    const srv = await startHttpMcpServer({
      args: ['--allow-per-request-pat'],
      env: makeStandardEnv(mockAdo, { AZURE_DEVOPS_PAT: 'wrong-default-pat' }),
    });
    addCleanup(() => srv.close());

    const client = createHttpMcpClient(srv.baseUrl, {
      defaultHeaders: { 'X-Azure-DevOps-PAT': callerPat },
    });
    addCleanup(() => client.close());

    await client.initialize();
    const projRes = await client.callTool('list_projects', {});
    const projects = unwrapToolResultJson(projRes, { expectSpotlighted: true });
    assert.ok(JSON.stringify(projects).includes('DemoProject'));

    const projReq = mockAdo.requests.find(
      (req) => req.method === 'GET' && /^\/_apis\/projects$/i.test(req.relPath),
    );
    assert.ok(projReq, 'Expected GET /_apis/projects on mock ADO server');
    const authHeader = String(projReq.headers?.authorization ?? '');
    assert.ok(
      authHeader.startsWith('Basic '),
      `Expected Basic auth header to mock ADO, got ${JSON.stringify(authHeader)}`,
    );
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const colonIdx = decoded.indexOf(':');
    assert.ok(colonIdx >= 0, 'Expected colon-separated Basic credentials');
    assert.equal(
      decoded.slice(colonIdx + 1),
      callerPat,
      'Expected mock ADO server to receive per-request X-Azure-DevOps-PAT credential',
    );
  });

  it('T7.8 [F22] HTTP Filesystem Tool Lockout disables create_work_item_attachment and get_work_item_attachment by default under --transport http', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const srv = await startHttpMcpServer({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => srv.close());

    const client = createHttpMcpClient(srv.baseUrl);
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const names = new Set(tools.map((tool) => tool.name));

    assert.equal(
      names.has('create_work_item_attachment'),
      false,
      'create_work_item_attachment must be disabled by default in HTTP transport',
    );
    assert.equal(
      names.has('get_work_item_attachment'),
      false,
      'get_work_item_attachment must be disabled by default in HTTP transport',
    );
    assert.equal(names.has('get_work_item'), true);
    assert.equal(names.has('add_work_item_comment'), true);
  });

  it('T7.9 [F22] Graceful SIGTERM shutdown drains cleanly with exit code 0', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const srv = await startHttpMcpServer({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => srv.close());

    const client = createHttpMcpClient(srv.baseUrl);
    addCleanup(() => client.close());

    await client.initialize();
    const ready = await client.getReadyz();
    assert.equal(ready.status, 200);

    srv.sendSignal('SIGTERM');
    const exit = await srv.waitForExit(5000);
    assert.equal(
      exit.timedOut,
      false,
      'Expected SIGTERM drain to complete before timeout',
    );
    assert.equal(
      exit.code,
      0,
      `Expected clean SIGTERM exit code 0, got code=${exit.code} signal=${exit.signal}`,
    );
    assert.equal(exit.signal, null);
  });

  it('T7.10 [F23] Official Multi-Stage Non-Root Dockerfile and .dockerignore satisfy Node 24/26-slim, USER node, /healthz HEALTHCHECK, OCI labels, and ignore rules', () => {
    assert.equal(
      repoFileExists('Dockerfile'),
      true,
      'Expected Dockerfile at repository root',
    );
    assert.equal(
      repoFileExists('.dockerignore'),
      true,
      'Expected .dockerignore at repository root',
    );

    const dockerfile = readRepoFile('Dockerfile');
    // Join backslash line continuations and strip comments into logical instructions
    const logicalLines = dockerfile
      .replace(/\\\r?\n[ \t]*/g, ' ')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    // Collect ARG defaults (KEY=VALUE) to resolve ${KEY}, ${KEY:-default}, and $KEY in FROM/EXPOSE
    const argDefaults = new Map();
    for (const line of logicalLines) {
      const argMatch = /^ARG\s+([A-Za-z_][A-Za-z0-9_]*)=(.+)$/i.exec(line);
      if (argMatch && !argDefaults.has(argMatch[1])) {
        argDefaults.set(
          argMatch[1],
          argMatch[2].trim().replace(/^["']|["']$/g, ''),
        );
      }
    }
    const expandArgs = (line) =>
      line.replace(
        /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
        (full, braced, fallback, bare) => {
          const name = braced ?? bare;
          if (argDefaults.has(name)) {
            return argDefaults.get(name);
          }
          return fallback !== undefined ? fallback : full;
        },
      );

    // Split logical instructions into FROM stages
    const stages = [];
    for (const line of logicalLines) {
      if (/^FROM\s+/i.test(line)) {
        stages.push([line]);
      } else if (stages.length > 0) {
        stages[stages.length - 1].push(line);
      }
    }

    assert.ok(
      stages.length >= 2,
      `Expected multi-stage Dockerfile (>= 2 FROM stages), found ${stages.length}`,
    );

    const nodeSlimFromRe =
      /^FROM\s+(?:--platform=\S+\s+)?(?:\S*\/)?node:(?:24|26)(?:\.\d+)*(?:-[a-z0-9]+)*-slim(?:@sha256:[0-9a-f]+)?\b/i;
    const builderFrom = expandArgs(stages[0][0]);
    const runtimeStage = stages[stages.length - 1];
    const runtimeFrom = expandArgs(runtimeStage[0]);

    assert.match(
      builderFrom,
      nodeSlimFromRe,
      `Expected builder stage using node:24-slim or node:26-slim, got: ${stages[0][0]}`,
    );
    assert.match(
      builderFrom,
      /\bAS\s+[a-z0-9._-]+\b/i,
      `Expected named builder stage (AS <stage>) in Dockerfile, got: ${stages[0][0]}`,
    );
    assert.match(
      runtimeFrom,
      nodeSlimFromRe,
      `Expected runtime stage using node:24-slim or node:26-slim, got: ${runtimeStage[0]}`,
    );
    assert.ok(
      runtimeStage.some((line) => /^COPY\s+.*--from=/i.test(line)),
      'Expected runtime stage to COPY artifacts --from= a prior build stage',
    );

    const runtimeUserLines = runtimeStage.filter((line) =>
      /^USER\s+/i.test(line),
    );
    assert.ok(
      runtimeUserLines.length > 0,
      'Expected non-root USER node in Dockerfile runtime stage',
    );
    assert.match(
      runtimeUserLines[runtimeUserLines.length - 1],
      /^USER\s+node(?::node)?\b/i,
      `Expected final runtime USER to be node, got: ${runtimeUserLines[runtimeUserLines.length - 1]}`,
    );

    assert.ok(
      runtimeStage.some(
        (line) =>
          /^HEALTHCHECK\b/i.test(line) &&
          !/^HEALTHCHECK\s+NONE\b/i.test(line) &&
          /\/healthz\b/i.test(line),
      ),
      'Expected HEALTHCHECK targeting /healthz in Dockerfile runtime stage',
    );
    assert.ok(
      logicalLines.some(
        (line) =>
          /^LABEL\b/i.test(line) && /org\.opencontainers\.image\./i.test(line),
      ),
      'Expected OCI org.opencontainers.image.* LABEL in Dockerfile',
    );
    assert.ok(
      runtimeStage.some((line) =>
        /^EXPOSE\s+.*\b3000(?:\/tcp)?\b/i.test(expandArgs(line)),
      ),
      'Expected EXPOSE 3000 in Dockerfile runtime stage',
    );
    assert.ok(
      runtimeStage.some((line) =>
        /^(?:ENTRYPOINT|CMD)\b.*dist\/index\.js/i.test(line),
      ),
      'Expected ENTRYPOINT or CMD executing dist/index.js in Dockerfile runtime stage',
    );

    const dockerignore = readRepoFile('.dockerignore');
    const ignoreLines = dockerignore
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.length > 0 && !line.startsWith('#') && !line.startsWith('!'),
      );

    const hasIgnoreRule = (re) => ignoreLines.some((line) => re.test(line));
    assert.ok(
      hasIgnoreRule(/^(?:\/|\*\*\/)?\.git(?:\/(?:\*{1,2})?)?$/),
      'Expected .dockerignore to exclude .git',
    );
    assert.ok(
      hasIgnoreRule(/^(?:\/|\*\*\/)?\.agents(?:\/(?:\*{1,2})?)?$/),
      'Expected .dockerignore to exclude .agents',
    );
    assert.ok(
      hasIgnoreRule(/^(?:\/|\*\*\/)?node_modules(?:\/(?:\*{1,2})?)?$/),
      'Expected .dockerignore to exclude node_modules',
    );
    assert.ok(
      hasIgnoreRule(/^(?:\/|\*\*\/)?tests(?:\/(?:\*{1,2})?)?$/),
      'Expected .dockerignore to exclude tests',
    );
    assert.ok(
      hasIgnoreRule(/^(?:\/|\*\*\/)?\.env\*$/) ||
        (hasIgnoreRule(/^(?:\/|\*\*\/)?\.env$/) &&
          hasIgnoreRule(/^(?:\/|\*\*\/)?\.env\.\*$/)),
      'Expected .dockerignore to exclude .env and .env.* (e.g. .env*)',
    );
    assert.ok(
      hasIgnoreRule(/(?:^|\/)\*\.spec\.(?:\*\.)?(?:ts|mts|js|mjs|\*)$/i),
      'Expected .dockerignore to exclude test spec files (e.g. **/*.spec.*.ts)',
    );
  });
});
