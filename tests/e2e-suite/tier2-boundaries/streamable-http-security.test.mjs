import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { readRepoFile, repoFileExists } from '../harness/assertions.mjs';
import {
  createHttpMcpClient,
  startHttpMcpServer,
} from '../harness/mcp-http-client.mjs';
import { spawnServerExpectExit } from '../harness/mcp-stdio-client.mjs';
import { createMockAdoServer } from '../harness/mock-ado-server.mjs';

const TEST_PAT = 'e2e-tier2-pat-secret-0123456789';

function makePatEnv(orgUrl, extra = {}) {
  return {
    AZURE_DEVOPS_ORG_URL: orgUrl,
    AZURE_DEVOPS_AUTH_METHOD: 'pat',
    AZURE_DEVOPS_PAT: TEST_PAT,
    AZURE_DEVOPS_DEFAULT_PROJECT: 'DemoProject',
    ...extra,
  };
}

function makeInitializeRpcPayload(name = 'tier2-http-test') {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name, version: '1.0.0' },
    },
  };
}

function expandDockerfileArgs(str, argMap) {
  return str.replace(
    /\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*)\b)/g,
    (match, bracedName, bareName) => {
      const name = bracedName ?? bareName;
      return argMap.has(name) ? argMap.get(name) : match;
    },
  );
}

function parseDockerfileInstructions(raw) {
  const instructions = [];
  let current = '';

  for (const rawLine of raw.split(/\r?\n/)) {
    if (/^\s*#/.test(rawLine)) {
      continue;
    }
    if (current === '' && rawLine.trim() === '') {
      continue;
    }
    if (/\\[ \t]*$/.test(rawLine)) {
      current += rawLine.replace(/\\[ \t]*$/, ' ');
      continue;
    }
    const joined = (current + rawLine).trim();
    if (joined.length > 0) {
      instructions.push(joined);
    }
    current = '';
  }
  if (current.trim().length > 0) {
    instructions.push(current.trim());
  }

  const globalInstructions = [];
  const globalArgs = new Map();
  const stages = [];
  for (const inst of instructions) {
    if (/^FROM\s+/i.test(inst)) {
      stages.push([inst]);
    } else if (stages.length === 0) {
      globalInstructions.push(inst);
      const argMatch = /^ARG\s+(.+)$/i.exec(inst);
      if (argMatch) {
        for (const tokenMatch of argMatch[1].matchAll(
          /([A-Za-z_][A-Za-z0-9_]*)(?:=("[^"]*"|'[^']*'|[^\s]*))?/g,
        )) {
          const [, argName, rawVal] = tokenMatch;
          if (rawVal !== undefined) {
            const unquoted =
              (rawVal.startsWith('"') && rawVal.endsWith('"')) ||
              (rawVal.startsWith("'") && rawVal.endsWith("'"))
                ? rawVal.slice(1, -1)
                : rawVal;
            globalArgs.set(argName, expandDockerfileArgs(unquoted, globalArgs));
          }
        }
      }
    } else {
      stages[stages.length - 1].push(inst);
    }
  }
  return { instructions, globalInstructions, globalArgs, stages };
}

describe('Tier 2 Boundaries — Streamable HTTP Security & Docker Hygiene (Area 9, F22–F23)', () => {
  test('Area 9 (F22): rejects malicious Host header (DNS rebinding) with 403 Forbidden', async (t) => {
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

    const client = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      client.close();
    });

    for (const forgedHost of [
      'evil.example:3000',
      '127.0.0.1.evil.example:3000',
    ]) {
      const res = await client.rawRequest('/mcp', {
        method: 'POST',
        headers: {
          Host: forgedHost,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: makeInitializeRpcPayload('forged-host-client'),
      });

      assert.equal(
        res.status,
        403,
        `Expected 403 Forbidden for forged Host "${forgedHost}", got ${res.status} (${res.text})`,
      );
    }

    // Positive control: valid loopback Host is accepted (not unconditional 403)
    const validInit = await client.initialize({
      name: 'valid-host-control',
      version: '1.0.0',
    });
    assert.ok(
      validInit && validInit.serverInfo,
      'Positive control: valid loopback Host must succeed on /mcp',
    );
  });

  test('Area 9 (F22): rejects malicious Origin header with 403 Forbidden even when Host is valid loopback', async (t) => {
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

    const client = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      client.close();
    });

    for (const forgedOrigin of [
      'https://evil.example',
      'http://localhost.evil.example',
    ]) {
      const res = await client.rawRequest('/mcp', {
        method: 'POST',
        headers: {
          Origin: forgedOrigin,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: makeInitializeRpcPayload('forged-origin-client'),
      });

      assert.equal(
        res.status,
        403,
        `Expected 403 Forbidden for forged Origin "${forgedOrigin}", got ${res.status} (${res.text})`,
      );
    }

    // Positive control: valid loopback Origin is accepted (not unconditional 403)
    const validInit = await client.initialize(
      { name: 'valid-origin-control', version: '1.0.0' },
      { Origin: server.baseUrl },
    );
    assert.ok(
      validInit && validInit.serverInfo,
      'Positive control: valid loopback Origin must succeed on /mcp',
    );
  });

  test('Area 9 (F22): allows absent Origin header for non-browser CLI/agent clients', async (t) => {
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

    const client = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      client.close();
    });

    const init = await client.initialize(
      { name: 'cli-no-origin', version: '1.0.0' },
      { Origin: undefined },
    );
    assert.ok(
      init && typeof init === 'object' && init.serverInfo,
      'Expected initialize() to succeed without Origin header',
    );

    const { tools } = await client.listTools({ Origin: undefined });
    assert.ok(
      Array.isArray(tools) && tools.length > 0,
      'Expected tools/list to succeed without Origin header',
    );
  });

  test('Area 9 (F22): --http-auth-token rejects missing/invalid Bearer & X-API-Key with 401 and accepts valid credentials with 200', async (t) => {
    const authToken = 'e2e-http-secret-token-999';
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const server = await startHttpMcpServer({
      passPortZero: true,
      args: ['--http-auth-token', authToken],
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await server.close();
    });

    const unauthClient = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      unauthClient.close();
    });

    const missingAuth = await unauthClient.rawRequest('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: makeInitializeRpcPayload('missing-auth'),
    });
    assert.equal(
      missingAuth.status,
      401,
      `Expected 401 on missing auth header, got ${missingAuth.status}`,
    );

    const wrongBearer = await unauthClient.rawRequest('/mcp', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer wrong-secret-token',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: makeInitializeRpcPayload('wrong-bearer'),
    });
    assert.equal(
      wrongBearer.status,
      401,
      `Expected 401 on wrong Bearer token, got ${wrongBearer.status}`,
    );

    const wrongApiKey = await unauthClient.rawRequest('/mcp', {
      method: 'POST',
      headers: {
        'X-API-Key': 'wrong-api-key',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: makeInitializeRpcPayload('wrong-apikey'),
    });
    assert.equal(
      wrongApiKey.status,
      401,
      `Expected 401 on wrong X-API-Key, got ${wrongApiKey.status}`,
    );

    // Valid Bearer token -> 200
    const bearerClient = createHttpMcpClient(server.baseUrl, {
      defaultHeaders: { Authorization: `Bearer ${authToken}` },
    });
    t.after(() => {
      bearerClient.close();
    });
    const bearerInit = await bearerClient.initialize({
      name: 'valid-bearer',
      version: '1.0.0',
    });
    assert.ok(bearerInit.serverInfo);

    // Valid X-API-Key -> 200
    const apiKeyClient = createHttpMcpClient(server.baseUrl, {
      defaultHeaders: { 'X-API-Key': authToken },
    });
    t.after(() => {
      apiKeyClient.close();
    });
    const apiKeyInit = await apiKeyClient.initialize({
      name: 'valid-apikey',
      version: '1.0.0',
    });
    assert.ok(apiKeyInit.serverInfo);
  });

  test('Area 9 (F22): fail-closed startup refuses non-loopback 0.0.0.0 bind without --http-auth-token or --allow-unauthenticated', async () => {
    const res = await spawnServerExpectExit(
      ['--transport', 'http', '--host', '0.0.0.0', '--port', '0'],
      makePatEnv('http://127.0.0.1:1/tfs/DefaultCollection'),
      10000,
    );

    assert.equal(
      res.timedOut,
      false,
      `Expected server binding 0.0.0.0 without auth to exit immediately, not stay running! stderr=${res.stderr}`,
    );
    assert.notEqual(
      res.code,
      0,
      `Expected non-zero exit code for unauthenticated 0.0.0.0 bind, got ${res.code}`,
    );
    assert.equal(
      res.stdout.trim(),
      '',
      `Expected empty stdout on fail-closed 0.0.0.0 startup error, got: ${JSON.stringify(res.stdout)}`,
    );
    assert.match(
      res.stderr,
      /auth|token|unauthenticated|loopback/i,
      `Expected stderr to explain non-loopback auth requirement, got: ${res.stderr}`,
    );
    assert.doesNotMatch(
      res.stderr,
      /unknown\s+(?:flag|option|argument)|unrecognized|EACCES|EADDRINUSE|EADDRNOTAVAIL/i,
      `Expected auth/loopback policy rejection rather than parser or OS bind error, got: ${res.stderr}`,
    );
  });

  test('Area 9 (F22): HTTP transport locks out local filesystem attachment tools from tools/list and direct tools/call', async (t) => {
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

    const client = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      client.close();
    });

    await client.initialize();
    const { tools } = await client.listTools();
    const toolNames = new Set(tools.map((tool) => tool.name));

    assert.equal(
      toolNames.has('get_work_item_attachment'),
      false,
      'get_work_item_attachment MUST be excluded in --transport http mode',
    );
    assert.equal(
      toolNames.has('create_work_item_attachment'),
      false,
      'create_work_item_attachment MUST be excluded in --transport http mode',
    );

    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'ado-tier2-http-fs-'),
    );
    t.after(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });
    const outFile = path.join(tempDir, 'blocked-download.bin');
    const srcFile = path.join(tempDir, 'blocked-upload.txt');
    fs.writeFileSync(srcFile, 'secret local content', 'utf8');

    mockAdo.clearRequests();
    const getRes = await client.callTool('get_work_item_attachment', {
      attachmentId: '11111111-1111-4111-8111-111111111111',
      outputPath: outFile,
    });
    assert.equal(
      getRes.isError,
      true,
      'Direct tools/call of get_work_item_attachment in HTTP mode must return isError: true',
    );
    assert.equal(
      fs.existsSync(outFile),
      false,
      'Blocked HTTP get_work_item_attachment must not write local files',
    );

    const createRes = await client.callTool('create_work_item_attachment', {
      workItemId: 101,
      filePath: srcFile,
    });
    assert.equal(
      createRes.isError,
      true,
      'Direct tools/call of create_work_item_attachment in HTTP mode must return isError: true',
    );

    assert.equal(
      mockAdo.requests.length,
      0,
      `Expected zero upstream ADO calls for locked-out HTTP filesystem tools, got ${mockAdo.requests.length}`,
    );
  });

  test('Area 9 (F22): stateless mode returns 405 on GET /mcp and DELETE /mcp while independent POST /mcp requests succeed', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const server = await startHttpMcpServer({
      passPortZero: true,
      args: ['--http-mode', 'stateless'],
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await server.close();
    });

    const rawClient = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      rawClient.close();
    });

    const getRes = await rawClient.rawRequest('/mcp', {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    });
    assert.equal(
      getRes.status,
      405,
      `Expected 405 Method Not Allowed for GET /mcp in stateless mode, got ${getRes.status}`,
    );

    const delRes = await rawClient.rawRequest('/mcp', {
      method: 'DELETE',
    });
    assert.equal(
      delRes.status,
      405,
      `Expected 405 Method Not Allowed for DELETE /mcp in stateless mode, got ${delRes.status}`,
    );

    const client1 = createHttpMcpClient(server.baseUrl);
    const client2 = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      client1.close();
      client2.close();
    });

    const init1 = await client1.initialize({
      name: 'stateless-1',
      version: '1.0.0',
    });
    assert.ok(init1.serverInfo);
    assert.equal(
      client1.sessionId,
      null,
      'Stateless mode must not issue Mcp-Session-Id for client1',
    );
    const list1 = await client1.listTools();
    assert.ok(list1.tools.length > 0);

    const init2 = await client2.initialize({
      name: 'stateless-2',
      version: '1.0.0',
    });
    assert.ok(init2.serverInfo);
    assert.equal(
      client2.sessionId,
      null,
      'Stateless mode must not issue Mcp-Session-Id for client2',
    );
    const list2 = await client2.listTools();
    assert.ok(list2.tools.length > 0);
  });

  test('Area 9 (F22): unknown Mcp-Session-Id is rejected cleanly with HTTP 404 or 400 in stateful mode', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const server = await startHttpMcpServer({
      passPortZero: true,
      args: ['--http-mode', 'stateful'],
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await server.close();
    });

    // Positive baseline control: prove /mcp is mounted and issues valid stateful sessions
    const validClient = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      validClient.close();
    });
    const validInit = await validClient.initialize({
      name: 'valid-stateful-control',
      version: '1.0.0',
    });
    assert.ok(
      validInit && validInit.serverInfo,
      'Positive control: stateful /mcp initialize must succeed',
    );
    assert.ok(
      validClient.sessionId,
      'Positive control: stateful mode must return a non-empty Mcp-Session-Id',
    );

    const client = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      client.close();
    });

    const rawRes = await client.callRpcRaw(
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      { 'Mcp-Session-Id': 'nonexistent-session-id-0000' },
    );

    assert.ok(
      rawRes.status === 404 || rawRes.status === 400,
      `Expected HTTP 404 or 400 for unknown Mcp-Session-Id, got ${rawRes.status} (${rawRes.text})`,
    );
  });

  test('Area 9 (F22): oversized HTTP request body (>4 MiB) is rejected with 413 Payload Too Large', async (t) => {
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

    const client = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      client.close();
    });

    const oversizedBody = Buffer.alloc(4 * 1024 * 1024 + 4096, 0x61);
    const res = await client.rawRequest('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: oversizedBody,
    });

    assert.equal(
      res.status,
      413,
      `Expected 413 Payload Too Large for >4 MiB POST /mcp body, got ${res.status}`,
    );

    const health = await client.getHealthz();
    assert.equal(
      health.status,
      200,
      'Server must remain healthy after rejecting oversized 413 request',
    );
  });

  test('Area 9 (F22): unknown route returns 404, /readyz returns 200 while running, and SIGTERM drains cleanly', async (t) => {
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

    const client = createHttpMcpClient(server.baseUrl);
    t.after(() => {
      client.close();
    });

    const notFound = await client.rawRequest('/does-not-exist', {
      method: 'GET',
    });
    assert.equal(
      notFound.status,
      404,
      `Expected 404 on unknown HTTP route, got ${notFound.status}`,
    );

    const ready = await client.getReadyz();
    assert.equal(
      ready.status,
      200,
      `Expected 200 on /readyz while running, got ${ready.status}`,
    );

    const health = await client.getHealthz();
    assert.equal(health.status, 200);
    assert.equal(health.json?.status, 'ok');

    const init = await client.initialize({
      name: 'sigterm-drain-session',
      version: '1.0.0',
    });
    assert.ok(init && init.serverInfo);

    server.sendSignal('SIGTERM');
    const exitInfo = await server.waitForExit(5000);
    assert.equal(
      exitInfo.timedOut,
      false,
      'Expected graceful SIGTERM shutdown without hanging/timing out',
    );
    assert.equal(
      exitInfo.code,
      0,
      `Expected graceful SIGTERM drain exit code 0, got code=${exitInfo.code} signal=${exitInfo.signal}`,
    );
    assert.equal(
      exitInfo.signal,
      null,
      `Expected server to handle SIGTERM gracefully (signal === null), got signal=${exitInfo.signal}`,
    );
  });

  test('Area 9 (F23): Dockerfile and .dockerignore enforce multi-stage node:24/26-slim, non-root USER node, /healthz HEALTHCHECK, and secret hygiene', () => {
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
    const { globalInstructions, globalArgs, stages } =
      parseDockerfileInstructions(dockerfile);
    const allInstructions = [...globalInstructions, ...stages.flat()];
    assert.ok(
      stages.length >= 2,
      `Expected multi-stage Dockerfile (>= 2 FROM statements), found ${stages.length}`,
    );

    const finalStage = stages[stages.length - 1];
    const stageAliases = new Map();
    const stageUsers = new Map();
    const stageHealthchecks = new Map();
    let finalBaseImage = '';
    let finalEffectiveUser = null;
    let finalEffectiveHealthcheck = null;
    for (const stage of stages) {
      const fromMatch =
        /^FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+([A-Za-z0-9._-]+))?/i.exec(
          stage[0],
        );
      let parentAlias = '';
      let alias;
      if (fromMatch) {
        const rawImage = expandDockerfileArgs(fromMatch[1], globalArgs);
        parentAlias = rawImage.toLowerCase();
        alias = fromMatch[2]?.toLowerCase();
        const resolvedImage = stageAliases.get(parentAlias) ?? rawImage;
        if (alias) {
          stageAliases.set(alias, resolvedImage);
        }
        finalBaseImage = resolvedImage;
      } else {
        finalBaseImage = '';
      }

      let effectiveUser = stageUsers.get(parentAlias) ?? null;
      let effectiveHealthcheck = stageHealthchecks.get(parentAlias) ?? null;
      for (const inst of stage.slice(1)) {
        if (/^USER\s+/i.test(inst)) {
          effectiveUser = inst;
        } else if (/^HEALTHCHECK\s+/i.test(inst)) {
          effectiveHealthcheck = inst;
        }
      }
      if (alias) {
        stageUsers.set(alias, effectiveUser);
        stageHealthchecks.set(alias, effectiveHealthcheck);
      }
      finalEffectiveUser = effectiveUser;
      finalEffectiveHealthcheck = effectiveHealthcheck;
    }
    assert.match(
      finalBaseImage,
      /^(?:docker\.io\/(?:library\/)?|library\/)?node:(?:24|26)(?:\.\d+)*(?:-[a-z0-9]+)?-slim(?:@sha256:[0-9a-f]+)?$/i,
      `Expected final runtime stage FROM to resolve to node:24/26-slim, got: ${finalStage[0]} (resolved: ${finalBaseImage})`,
    );

    assert.ok(
      finalEffectiveUser !== null,
      'Expected final runtime stage to declare or inherit a non-root USER instruction',
    );
    assert.match(
      finalEffectiveUser,
      /^USER\s+(?:node|1000)(?::(?:node|[1-9]\d*))?$/i,
      `Expected final runtime stage effective USER instruction to be non-root node/1000 with non-zero GID, got: ${finalEffectiveUser}`,
    );

    assert.ok(
      finalEffectiveHealthcheck !== null,
      'Expected final runtime stage to include or inherit an active HEALTHCHECK instruction',
    );
    assert.doesNotMatch(
      finalEffectiveHealthcheck,
      /^HEALTHCHECK\s+NONE\b/i,
      `Final runtime stage HEALTHCHECK must not be disabled (NONE): ${finalEffectiveHealthcheck}`,
    );
    assert.match(
      finalEffectiveHealthcheck,
      /\/healthz\b/i,
      `Expected final runtime stage HEALTHCHECK to target /healthz, got: ${finalEffectiveHealthcheck}`,
    );

    const secretEqualsRe =
      /^(?:ENV|ARG)\b.*?\b(?:AZURE_DEVOPS_PAT|AZURE_DEVOPS_HTTP_AUTH_TOKEN|AZURE_DEVOPS_WEBHOOK_SECRET)=(?!""(?:\s|$)|''(?:\s|$))\S+/i;
    const secretWhitespaceRe =
      /^ENV\s+(?:AZURE_DEVOPS_PAT|AZURE_DEVOPS_HTTP_AUTH_TOKEN|AZURE_DEVOPS_WEBHOOK_SECRET)\s+(?!""$|''$)\S+/i;
    for (const inst of allInstructions) {
      assert.doesNotMatch(
        inst,
        secretEqualsRe,
        `Dockerfile must never hardcode secrets or tokens: ${inst}`,
      );
      assert.doesNotMatch(
        inst,
        secretWhitespaceRe,
        `Dockerfile must never hardcode secrets or tokens: ${inst}`,
      );
    }

    const dockerignore = readRepoFile('.dockerignore');
    const ignoreLines = dockerignore
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    const isAllowlist = ignoreLines.some(
      (line) => line === '*' || line === '**' || line === '**/*',
    );

    const requiredExclusions = [
      {
        name: '.git',
        deny: /^(?:\*\*\/|\/)?\.git(?:\/(?:\*\*|\*)?)?$/,
        reinclude: /^!(?:\*\*\/|\/)?\.git(?:\/|$)/,
      },
      {
        name: '.env',
        deny: /^(?:\*\*\/|\/)?\.env(?:\*|\.\*|\/(?:\*\*|\*)?)?$/,
        reinclude: /^!(?:\*\*\/|\/)?\.env(?:\*|\.\*|\/|$)/,
      },
      {
        name: 'node_modules',
        deny: /^(?:\*\*\/|\/)?node_modules(?:\/(?:\*\*|\*)?)?$/,
        reinclude: /^!(?:\*\*\/|\/)?node_modules(?:\/|$)/,
      },
      {
        name: '.agents',
        deny: /^(?:\*\*\/|\/)?\.agents(?:\/(?:\*\*|\*)?)?$/,
        reinclude: /^!(?:\*\*\/|\/)?\.agents(?:\/|$)/,
      },
      {
        name: 'tests',
        deny: /^(?:\*\*\/|\/)?tests(?:\/(?:\*\*|\*)?)?$/,
        reinclude: /^!(?:\*\*\/|\/)?tests(?:\/|$)/,
      },
    ];

    if (isAllowlist) {
      assert.equal(
        ignoreLines.some((line) => /^!\/?(?:\*|\*\*|\*\*\/\*)$/.test(line)),
        false,
        '.dockerignore allowlist must not re-include everything via !* or !**',
      );
    }

    for (const entry of requiredExclusions) {
      if (isAllowlist) {
        assert.equal(
          ignoreLines.some((line) => entry.reinclude.test(line)),
          false,
          `.dockerignore allowlist must not re-include ${entry.name}`,
        );
      } else {
        assert.equal(
          ignoreLines.some((line) => entry.deny.test(line)),
          true,
          `.dockerignore must exclude ${entry.name}`,
        );
        assert.equal(
          ignoreLines.some((line) => entry.reinclude.test(line)),
          false,
          `.dockerignore must not re-include ${entry.name}`,
        );
      }
    }
  });
});
