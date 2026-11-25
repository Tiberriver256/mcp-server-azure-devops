import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import {
  assertSpotlighted,
  extractTextContent,
  parseSpotlightedText,
  unwrapToolResultJson,
  unwrapToolResultText,
} from '../harness/assertions.mjs';
import {
  createHttpMcpClient,
  startHttpMcpServer,
} from '../harness/mcp-http-client.mjs';
import {
  JsonRpcError,
  createStdioMcpClient,
} from '../harness/mcp-stdio-client.mjs';
import { createMockAdoServer } from '../harness/mock-ado-server.mjs';

const TEST_PAT = 'e3-tier4-ent-pat-86420';
const CURSOR_REGEX = /^v1:[0-9a-f]{8}:\d+$/i;
const WIKI_UUID = '66666666-6666-4666-8666-666666666666';
const EXPECTED_DRAIN_CLOSE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ECONNABORTED',
  'ERR_SOCKET_CLOSED',
]);

function createLifoCleanup(t) {
  const cleanups = [];
  t.after(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      try {
        await fn();
      } catch {
        // Best-effort LIFO teardown so subsequent resources still close.
      }
    }
  });
  return (fn) => {
    cleanups.push(fn);
  };
}

function buildAdoEnv(mockAdo, extra = {}) {
  return {
    AZURE_DEVOPS_ORG_URL: mockAdo.url,
    AZURE_DEVOPS_AUTH_METHOD: 'pat',
    AZURE_DEVOPS_PAT: TEST_PAT,
    AZURE_DEVOPS_DEFAULT_PROJECT: 'DemoProject',
    AZURE_DEVOPS_API_VERSION: '7.0',
    ...extra,
  };
}

function indexTools(listResult) {
  assert.ok(
    listResult && Array.isArray(listResult.tools),
    'Expected tools/list response to contain tools array',
  );
  const map = new Map();
  for (const tool of listResult.tools) {
    map.set(tool.name, tool);
  }
  return map;
}

function resolvePropKey(props, candidates, required = []) {
  const requiredSet = Array.isArray(required) ? new Set(required) : null;
  if (requiredSet && requiredSet.size > 0) {
    for (const key of candidates) {
      if (Object.hasOwn(props, key) && requiredSet.has(key)) {
        return key;
      }
    }
  }
  for (const key of candidates) {
    if (Object.hasOwn(props, key)) {
      return key;
    }
  }
  return candidates[0];
}

function schemaAllowsNull(schema) {
  if (!schema || typeof schema !== 'object') {
    return true;
  }
  if (
    schema.type === 'null' ||
    schema.nullable === true ||
    schema.const === null
  ) {
    return true;
  }
  if (Array.isArray(schema.type) && schema.type.includes('null')) {
    return true;
  }
  if (Array.isArray(schema.enum) && schema.enum.includes(null)) {
    return true;
  }
  for (const branchKey of ['anyOf', 'oneOf']) {
    if (
      Array.isArray(schema[branchKey]) &&
      schema[branchKey].some((branch) => schemaAllowsNull(branch))
    ) {
      return true;
    }
  }
  return (
    schema.type === undefined &&
    !Array.isArray(schema.anyOf) &&
    !Array.isArray(schema.oneOf) &&
    !Array.isArray(schema.allOf) &&
    !Array.isArray(schema.enum) &&
    schema.const === undefined
  );
}

function schemaAllowsType(schema, targetType) {
  if (!schema || typeof schema !== 'object') {
    return false;
  }
  if (schema.type === targetType) {
    return true;
  }
  if (Array.isArray(schema.type) && schema.type.includes(targetType)) {
    return true;
  }
  if (targetType === 'string') {
    if (typeof schema.const === 'string') {
      return true;
    }
    if (
      Array.isArray(schema.enum) &&
      schema.enum.some((v) => typeof v === 'string')
    ) {
      return true;
    }
  }
  for (const branchKey of ['anyOf', 'oneOf']) {
    if (
      Array.isArray(schema[branchKey]) &&
      schema[branchKey].some((branch) => schemaAllowsType(branch, targetType))
    ) {
      return true;
    }
  }
  return false;
}

function isStringOnlySchema(schema) {
  return (
    schemaAllowsType(schema, 'string') && !schemaAllowsType(schema, 'array')
  );
}

function buildSchemaArgs(toolMap, toolName, entries) {
  const tool = toolMap.get(toolName);
  assert.ok(tool, `Expected tool "${toolName}" to be registered in tools/list`);
  const props =
    tool.inputSchema && typeof tool.inputSchema.properties === 'object'
      ? tool.inputSchema.properties
      : {};
  const required = Array.isArray(tool.inputSchema?.required)
    ? tool.inputSchema.required
    : [];
  const args = {};
  for (const [candidates, rawValue] of entries) {
    const key = resolvePropKey(props, candidates, required);
    const schema = Object.hasOwn(props, key) ? props[key] : undefined;
    if (
      rawValue === null &&
      schema !== undefined &&
      !schemaAllowsNull(schema) &&
      !required.includes(key)
    ) {
      continue;
    }
    if (Array.isArray(rawValue) && schema && isStringOnlySchema(schema)) {
      args[key] = rawValue.join(',');
    } else {
      args[key] = rawValue;
    }
  }
  return args;
}

function hasQueryParamCI(query, name) {
  const lower = name.toLowerCase();
  return Object.keys(query ?? {}).some((k) => k.toLowerCase() === lower);
}

function getQueryParamCI(query, name) {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (k.toLowerCase() === lower) {
      return v;
    }
  }
  return undefined;
}

function decodeBasicPat(reqRecord) {
  const auth = String(reqRecord.headers?.authorization || '');
  const match = /^Basic\s+(\S+)$/i.exec(auth.trim());
  if (!match) {
    return null;
  }
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  return idx === -1 ? null : decoded.slice(idx + 1);
}

async function waitForMockRequest(mockAdo, predicate, timeoutMs = 13000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (mockAdo.requests.some(predicate)) {
      return true;
    }
    await delay(50);
  }
  return false;
}

async function callToolExpectGracefulError(client, toolName, args) {
  let res;
  let caughtErr = null;
  try {
    res = await client.callTool(toolName, args);
  } catch (err) {
    caughtErr = err;
  }
  if (caughtErr !== null) {
    assert.ok(
      caughtErr instanceof JsonRpcError,
      `Expected graceful isError or JsonRpcError from "${toolName}", got: ${caughtErr}`,
    );
    return caughtErr.message;
  }
  assert.equal(
    res.isError,
    true,
    `Expected "${toolName}" to return isError: true, got success: ${extractTextContent(res).slice(0, 200)}`,
  );
  return unwrapToolResultText(res, {
    allowError: true,
    expectSpotlighted: 'auto',
  }).text;
}

function buildTestWebhook() {
  return {
    subscriptionId: '00000000-0000-0000-0000-000000000000',
    notificationId: 1,
    id: 'wh-ent-test-001',
    eventType: 'test',
    publisherId: 'tfs',
    message: { text: 'Test event from Azure DevOps Service Hooks' },
    detailedMessage: { text: 'Test notification' },
    resourceVersion: '1.0',
    resourceContainers: {
      project: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: 'DemoProject',
      },
    },
    createdDate: '2026-11-25T10:00:00Z',
    resource: { isTest: true },
  };
}

function buildWorkItemUpdatedWebhook(collectionUrl, overrides = {}) {
  const rev = overrides.rev ?? 3;
  return {
    subscriptionId: '11111111-aaaa-4111-8111-111111111111',
    notificationId: overrides.notificationId ?? 31,
    id: overrides.id ?? 'wh-ent-wi-101',
    eventType: 'workitem.updated',
    publisherId: 'tfs',
    createdDate: '2026-11-25T10:20:00Z',
    resourceVersion: '1.0',
    resourceContainers: {
      project: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: 'DemoProject',
        baseUrl: `${collectionUrl}/`,
      },
    },
    resource: {
      id: rev,
      workItemId: 101,
      rev,
      revisedDate: '2026-11-25T10:20:00Z',
      url: `${collectionUrl}/DemoProject/_apis/wit/workItems/101/updates/${rev}`,
      fields: {
        'System.Rev': { oldValue: rev - 1, newValue: rev },
        'System.State': { oldValue: 'Active', newValue: 'Resolved' },
      },
      revision: {
        id: 101,
        rev,
        url: `${collectionUrl}/DemoProject/_apis/wit/workItems/101`,
        fields: {
          'System.TeamProject': 'DemoProject',
          'System.WorkItemType': 'User Story',
          'System.Title': 'Implement OData Analytics',
          'System.State': 'Resolved',
          'System.AreaPath': 'DemoProject',
          'System.AssignedTo': 'Alice Reviewer <alice@example.com>',
        },
      },
    },
  };
}

function buildPullRequestUpdatedWebhook(collectionUrl) {
  return {
    subscriptionId: '11111111-aaaa-4111-8111-111111111112',
    notificationId: 32,
    id: 'wh-ent-pr-42',
    eventType: 'git.pullrequest.updated',
    publisherId: 'tfs',
    createdDate: '2026-11-25T10:21:00Z',
    resourceVersion: '1.0',
    resourceContainers: {
      project: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: 'DemoProject',
        baseUrl: `${collectionUrl}/`,
      },
    },
    resource: {
      pullRequestId: 42,
      status: 'active',
      title: 'Add PR review actions',
      mergeStatus: 'succeeded',
      sourceRefName: 'refs/heads/feature/pr-voting',
      targetRefName: 'refs/heads/main',
      lastMergeSourceCommit: {
        commitId: '3333333333333333333333333333333333333333',
      },
      repository: {
        id: '77777777-7777-4777-8777-777777777777',
        name: 'DemoRepo',
        project: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          name: 'DemoProject',
        },
      },
      url: `${collectionUrl}/DemoProject/_apis/git/repositories/77777777-7777-4777-8777-777777777777/pullRequests/42`,
    },
  };
}

describe('Tier 4 — Enterprise On-Prem, Streamable HTTP & MCP Events Workflows', () => {
  it('Workflow 5: On-Prem Enterprise Server 2022 over Streamable HTTP + Service Hooks -> SEP-3415 Stream & Resource Subscriptions + Graceful SIGTERM Drain', async (t) => {
    const addCleanup = createLifoCleanup(t);
    const mcpToken = 'ent-tok-5';
    const webhookSecret = 'ent-wh-5';
    const feedUri = 'ado://DefaultCollection/DemoProject/events/feed';

    const mockAdo = await createMockAdoServer({
      profile: 'server-2022',
      expectedPat: TEST_PAT,
    });
    addCleanup(() => mockAdo.close());

    const httpServer = await startHttpMcpServer({
      passPortZero: true,
      args: [
        '--http-auth-token',
        mcpToken,
        '--webhook-secret',
        webhookSecret,
        '--toolsets',
        'work-items,pull-requests,events',
      ],
      env: buildAdoEnv(mockAdo),
    });
    addCleanup(() => httpServer.close());

    const client = createHttpMcpClient(httpServer.baseUrl, {
      defaultHeaders: { Authorization: `Bearer ${mcpToken}` },
    });
    addCleanup(() => client.close());

    // Dedicated webhook client with NO MCP Authorization header.
    const webhookClient = createHttpMcpClient(httpServer.baseUrl);
    addCleanup(() => webhookClient.close());

    // Step 1: Health and readiness probes (unauthenticated, zero secret leaks)
    const healthz = await webhookClient.getHealthz();
    assert.equal(healthz.status, 200);
    assert.equal(healthz.json?.status, 'ok');
    assert.equal(typeof healthz.json?.version, 'string');
    for (const secret of [TEST_PAT, mcpToken, webhookSecret]) {
      assert.equal(
        healthz.text.includes(secret),
        false,
        `/healthz must never leak secret "${secret}"`,
      );
    }

    const readyz = await webhookClient.getReadyz();
    assert.equal(readyz.status, 200);
    assert.ok(
      readyz.json?.status === 'ready' ||
        readyz.json?.status === 'ok' ||
        readyz.json?.ready === true,
      `Expected /readyz to report ready/ok status, got: ${readyz.text}`,
    );

    // Step 2: Initialize session & verify MCP 2025 + SEP-3415 capabilities
    const initRes = await client.initialize();
    assert.equal(initRes.capabilities?.resources?.subscribe, true);
    assert.ok(
      initRes.capabilities?.extensions?.['io.modelcontextprotocol/events'] &&
        typeof initRes.capabilities.extensions[
          'io.modelcontextprotocol/events'
        ] === 'object',
      'Enterprise HTTP server must advertise io.modelcontextprotocol/events extension',
    );

    // Step 3: Subscribe to events/feed + open GET SSE AND open SEP-3415 events/stream
    await client.subscribeResource(feedUri);
    const sse = await client.openSseStream();
    addCleanup(() => sse.close());
    assert.equal(sse.status, 200);

    const stream = await client.openPostStream('events/stream', {
      name: 'ado.work_item.updated',
      arguments: { projectId: 'DemoProject' },
      cursor: null,
    });
    addCleanup(() => stream.close());
    assert.equal(stream.status, 200);

    const activeEvt = await stream.waitForEvent(
      (e) => e.json?.method === 'notifications/events/active',
      5000,
    );
    assert.equal(
      activeEvt.json.params?._meta?.['io.modelcontextprotocol/subscriptionId'],
      stream.requestId,
    );
    assert.match(activeEvt.json.params?.cursor, CURSOR_REGEX);

    // Step 4: Deliver ADO Test ping -> workitem.updated (Basic Auth) -> git.pullrequest.updated (Header secret)
    const testPingRes = await webhookClient.postWebhook(buildTestWebhook(), {
      'X-ADO-Webhook-Secret': webhookSecret,
    });
    assert.equal(testPingRes.status, 200);

    const basicHeader = `Basic ${Buffer.from(`ado:${webhookSecret}`, 'utf8').toString('base64')}`;
    const wiHookRes = await webhookClient.postWebhook(
      buildWorkItemUpdatedWebhook(mockAdo.collectionUrl),
      { Authorization: basicHeader },
    );
    assert.equal(wiHookRes.status, 200);

    const prHookRes = await webhookClient.postWebhook(
      buildPullRequestUpdatedWebhook(mockAdo.collectionUrl),
      { 'X-ADO-Webhook-Secret': webhookSecret },
    );
    assert.equal(prHookRes.status, 200);

    // Step 5: Receive live SEP-3415 push notification AND GET SSE resource update
    const liveStreamEvt = await stream.waitForEvent(
      (e) => e.json?.method === 'notifications/events/event',
      5000,
    );
    assert.equal(liveStreamEvt.json.params?.name, 'ado.work_item.updated');
    assert.equal(
      liveStreamEvt.json.params?._meta?.[
        'io.modelcontextprotocol/subscriptionId'
      ],
      stream.requestId,
    );
    assert.equal(Number(liveStreamEvt.json.params?.data?.workItemId), 101);

    const liveSubEvt = await sse.waitForEvent(
      (e) =>
        e.json?.method === 'notifications/resources/updated' &&
        e.json?.params?.uri === feedUri,
      5000,
    );
    assert.equal(liveSubEvt.json.params.uri, feedUri);

    // Step 6: Verify raw resources/read feed contains BOTH WI 101 and PR 42 events
    const feedRes = await client.readResource(feedUri);
    const feedText = feedRes.contents[0].text;
    assert.equal(
      parseSpotlightedText(feedText).isSpotlighted,
      false,
      'resources/read feed must be raw un-spotlighted JSON',
    );
    const feedJson = JSON.parse(feedText);
    assert.ok(
      feedJson.events.some(
        (e) =>
          e.name === 'ado.work_item.updated' &&
          Number(e.data?.workItemId) === 101,
      ),
      'Feed must contain ado.work_item.updated for WI 101',
    );
    assert.ok(
      feedJson.events.some(
        (e) =>
          e.name === 'ado.pull_request.updated' &&
          Number(e.data?.pullRequestId) === 42,
      ),
      'Feed must contain ado.pull_request.updated for PR 42',
    );

    // Step 7: Action-time tool fetch is Spotlighted by default
    const wiToolRes = await client.callTool('get_work_item', {
      workItemId: 101,
    });
    assertSpotlighted(extractTextContent(wiToolRes), {
      checkNotDoubleWrapped: true,
    });
    const wiToolJson = unwrapToolResultJson(wiToolRes, {
      expectSpotlighted: true,
    });
    assert.equal(wiToolJson.id, 101);

    // Step 8: Graceful SIGTERM drain with active SSE streams open -> /readyz 503 or closed socket -> clean exit 0, ESRCH & closed streams
    assert.equal(
      sse.closed,
      false,
      'GET SSE stream must remain open until SIGTERM drain',
    );
    assert.equal(
      stream.closed,
      false,
      'POST events/stream must remain open until SIGTERM drain',
    );
    const serverPid = httpServer.pid;
    httpServer.sendSignal('SIGTERM');
    await delay(25);

    let drainingReadyz = null;
    let readyzErr = null;
    try {
      drainingReadyz = await webhookClient.getReadyz();
    } catch (err) {
      readyzErr = err;
    }

    if (readyzErr !== null) {
      assert.ok(
        readyzErr instanceof Error &&
          ((typeof readyzErr.code === 'string' &&
            EXPECTED_DRAIN_CLOSE_CODES.has(readyzErr.code)) ||
            /socket hang up/i.test(readyzErr.message)),
        `Expected /readyz during SIGTERM drain to return 503 or close socket cleanly, got unexpected error: ${readyzErr}`,
      );
    } else {
      assert.equal(
        drainingReadyz.status,
        503,
        `Expected /readyz during SIGTERM drain to return 503, got ${drainingReadyz.status}`,
      );
    }

    const exit = await httpServer.waitForExit(8000);
    assert.equal(exit.timedOut, false, 'SIGTERM drain must exit within 8000ms');
    assert.equal(
      exit.code,
      0,
      `Expected graceful SIGTERM handler exit code 0, got code=${String(exit.code)} signal=${String(exit.signal)}`,
    );
    assert.equal(
      exit.signal,
      null,
      `Expected graceful SIGTERM handler exit (signal null), got signal=${String(exit.signal)}`,
    );
    assert.throws(
      () => process.kill(serverPid, 0),
      { code: 'ESRCH' },
      'HTTP server PID must no longer exist after SIGTERM drain',
    );

    const streamCloseDeadline = Date.now() + 1000;
    while (
      (!sse.closed || !stream.closed) &&
      Date.now() < streamCloseDeadline
    ) {
      await delay(20);
    }
    assert.equal(
      sse.closed,
      true,
      'GET SSE stream must be closed by server during graceful SIGTERM drain',
    );
    assert.equal(
      stream.closed,
      true,
      'POST events/stream must be closed by server during graceful SIGTERM drain',
    );
  });

  it('Workflow 6: Multi-Tenant Isolated Per-Request PAT Shared HTTP Deployment Survives Mid-Session DNS-Rebinding & Bad-Origin Attacks', async (t) => {
    const addCleanup = createLifoCleanup(t);
    const mcpToken = 'mt-bearer-6';

    // Omit expectedPat so mockAdo accepts both tenants and records every Basic Auth header.
    const mockAdo = await createMockAdoServer({
      profile: 'server-2022',
    });
    addCleanup(() => mockAdo.close());

    const httpServer = await startHttpMcpServer({
      passPortZero: true,
      args: [
        '--allow-per-request-pat',
        '--http-auth-token',
        mcpToken,
        '--allowed-hosts',
        '127.0.0.1,localhost',
        '--allowed-origins',
        'http://localhost',
        '--toolsets',
        'work-items,pull-requests,analytics',
      ],
      env: buildAdoEnv(mockAdo, { AZURE_DEVOPS_PAT: 'pat-shared-default' }),
    });
    addCleanup(() => httpServer.close());

    const clientA = createHttpMcpClient(httpServer.baseUrl, {
      defaultHeaders: {
        Authorization: `Bearer ${mcpToken}`,
        'X-Azure-DevOps-PAT': 'pat-tenant-a',
      },
    });
    addCleanup(() => clientA.close());

    const clientB = createHttpMcpClient(httpServer.baseUrl, {
      defaultHeaders: {
        Authorization: `Bearer ${mcpToken}`,
        'X-Azure-DevOps-PAT': 'pat-tenant-b',
      },
    });
    addCleanup(() => clientB.close());

    const probeClient = createHttpMcpClient(httpServer.baseUrl);
    addCleanup(() => probeClient.close());

    await Promise.all([clientA.initialize(), clientB.initialize()]);
    assert.ok(clientA.sessionId && clientB.sessionId);
    assert.notEqual(clientA.sessionId, clientB.sessionId);

    // Step 1: Verify attachment disk tools are absent & blocked in shared HTTP deployment
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e3-wf6-fs-lock-'));
    addCleanup(() => fs.rmSync(tempDir, { recursive: true, force: true }));
    const tempSourcePath = path.join(tempDir, 'upload-source.txt');
    const tempOutPath = path.join(tempDir, 'should-not-write-wf6.bin');
    fs.writeFileSync(
      tempSourcePath,
      'sensitive tenant local file content',
      'utf8',
    );

    const toolMap = indexTools(await clientA.listTools());
    assert.equal(toolMap.has('get_work_item_attachment'), false);
    assert.equal(toolMap.has('create_work_item_attachment'), false);

    mockAdo.clearRequests();
    await callToolExpectGracefulError(clientA, 'get_work_item_attachment', {
      attachmentId: '11111111-1111-4111-8111-111111111111',
      outputPath: tempOutPath,
    });
    await callToolExpectGracefulError(clientB, 'create_work_item_attachment', {
      workItemId: 102,
      filePath: tempSourcePath,
    });
    assert.equal(
      fs.existsSync(tempOutPath),
      false,
      'Blocked get_work_item_attachment must not create outputPath on disk',
    );
    assert.equal(
      mockAdo.requests.some((r) => /\/attachments/i.test(r.pathname)),
      false,
      'Blocked filesystem attachment tools must emit zero /attachments requests',
    );

    // Step 2: Concurrent + interleaved Tenant A vs Tenant B SDK & OData workload
    const odataAArgs = buildSchemaArgs(toolMap, 'query_analytics', [
      [['projectId', 'project'], 'DemoProject'],
      [['entitySet', 'entity', 'table'], 'WorkItems'],
      [
        ['select', '$select'],
        ['WorkItemId', 'Title'],
      ],
      [['filter', '$filter'], 'WorkItemId eq 101'],
    ]);
    const odataBArgs = buildSchemaArgs(toolMap, 'query_analytics', [
      [['projectId', 'project'], 'DemoProject'],
      [['entitySet', 'entity', 'table'], 'WorkItems'],
      [
        ['select', '$select'],
        ['WorkItemId', 'Title'],
      ],
      [['filter', '$filter'], 'WorkItemId eq 102'],
    ]);

    mockAdo.clearRequests();
    const [wiA, prA, odA, wiB, prB, odB] = await Promise.all([
      clientA.callTool('get_work_item', { workItemId: 101 }),
      clientA.callTool('get_pull_request', {
        projectId: 'DemoProject',
        pullRequestId: 42,
      }),
      clientA.callTool('query_analytics', odataAArgs),
      clientB.callTool('get_work_item', { workItemId: 102 }),
      clientB.callTool('get_pull_request', {
        projectId: 'DemoProject',
        pullRequestId: 43,
      }),
      clientB.callTool('query_analytics', odataBArgs),
    ]);

    assert.equal(
      unwrapToolResultJson(wiA, { expectSpotlighted: true }).id,
      101,
    );
    assert.equal(
      unwrapToolResultJson(prA, { expectSpotlighted: true }).pullRequestId,
      42,
    );
    assert.ok(
      JSON.stringify(
        unwrapToolResultJson(odA, { expectSpotlighted: true }),
      ).includes('101'),
    );
    assert.equal(
      unwrapToolResultJson(wiB, { expectSpotlighted: true }).id,
      102,
    );
    assert.equal(
      unwrapToolResultJson(prB, { expectSpotlighted: true }).pullRequestId,
      43,
    );
    assert.ok(
      JSON.stringify(
        unwrapToolResultJson(odB, { expectSpotlighted: true }),
      ).includes('102'),
    );

    const assertTenantPat = (label, predicate, expectedPat) => {
      const reqs = mockAdo.requests.filter(predicate);
      assert.ok(reqs.length >= 1, `Expected >= 1 mockAdo request for ${label}`);
      for (const req of reqs) {
        assert.equal(
          decodeBasicPat(req),
          expectedPat,
          `PAT isolation violation on ${label}: expected "${expectedPat}", got "${String(decodeBasicPat(req))}"`,
        );
      }
    };

    assertTenantPat(
      'Tenant A WI 101',
      (r) =>
        /\/wit\/workitems\/101(?:\b|$)/i.test(r.pathname) ||
        getQueryParamCI(r.query, 'ids') === '101',
      'pat-tenant-a',
    );
    assertTenantPat(
      'Tenant A PR 42',
      (r) => /\/pullrequests\/42(?:\b|$)/i.test(r.pathname),
      'pat-tenant-a',
    );
    assertTenantPat(
      'Tenant A OData 101',
      (r) =>
        /\/_odata\//i.test(r.pathname) && `${r.url} ${r.body}`.includes('101'),
      'pat-tenant-a',
    );
    assertTenantPat(
      'Tenant B WI 102',
      (r) =>
        /\/wit\/workitems\/102(?:\b|$)/i.test(r.pathname) ||
        getQueryParamCI(r.query, 'ids') === '102',
      'pat-tenant-b',
    );
    assertTenantPat(
      'Tenant B PR 43',
      (r) => /\/pullrequests\/43(?:\b|$)/i.test(r.pathname),
      'pat-tenant-b',
    );
    assertTenantPat(
      'Tenant B OData 102',
      (r) =>
        /\/_odata\//i.test(r.pathname) && `${r.url} ${r.body}`.includes('102'),
      'pat-tenant-b',
    );

    // Step 3: Fire mid-session DNS-rebinding attack (forged Host) AND bad-Origin attack
    const attackBody = JSON.stringify({
      jsonrpc: '2.0',
      id: 999,
      method: 'tools/list',
      params: {},
    });
    const hostAttack = await probeClient.rawRequest('/mcp', {
      method: 'POST',
      headers: {
        Host: 'attacker.evil:3000',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${mcpToken}`,
        'Mcp-Session-Id': clientA.sessionId,
      },
      body: attackBody,
    });
    assert.equal(
      hostAttack.status,
      403,
      `DNS-rebinding forged Host must return 403, got ${hostAttack.status}`,
    );

    const originAttack = await probeClient.rawRequest('/mcp', {
      method: 'POST',
      headers: {
        Host: `127.0.0.1:${httpServer.port}`,
        Origin: 'https://attacker.evil',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${mcpToken}`,
        'Mcp-Session-Id': clientB.sessionId,
      },
      body: attackBody,
    });
    assert.equal(
      originAttack.status,
      403,
      `Forged Origin must return 403, got ${originAttack.status}`,
    );

    // Step 4: Verify BOTH Tenant A & Tenant B remain healthy and isolated immediately after attacks
    mockAdo.clearRequests();
    const [afterA, afterB] = await Promise.all([
      clientA.callTool('get_work_item', { workItemId: 101 }),
      clientB.callTool('get_work_item', { workItemId: 102 }),
    ]);
    assert.equal(
      unwrapToolResultJson(afterA, { expectSpotlighted: true }).id,
      101,
    );
    assert.equal(
      unwrapToolResultJson(afterB, { expectSpotlighted: true }).id,
      102,
    );
    assertTenantPat(
      'Post-attack Tenant A WI 101',
      (r) =>
        /\/wit\/workitems\/101(?:\b|$)/i.test(r.pathname) ||
        getQueryParamCI(r.query, 'ids') === '101',
      'pat-tenant-a',
    );
    assertTenantPat(
      'Post-attack Tenant B WI 102',
      (r) =>
        /\/wit\/workitems\/102(?:\b|$)/i.test(r.pathname) ||
        getQueryParamCI(r.query, 'ids') === '102',
      'pat-tenant-b',
    );

    const stderr = httpServer.getStderr();
    for (const secret of [
      'pat-tenant-a',
      'pat-tenant-b',
      'pat-shared-default',
      mcpToken,
    ]) {
      assert.equal(
        stderr.includes(secret),
        false,
        `Server stderr must NEVER leak secret "${secret}"`,
      );
    }
  });

  it('Workflow 7: On-Prem Legacy Server 2019 RTM (5.0) Graceful Degradation & Resilience (System.History, Classic TestApi, Stage 404, Analytics 404, HTTP 203, HTTP 429)', async (t) => {
    const addCleanup = createLifoCleanup(t);

    const mockAdo = await createMockAdoServer({
      profile: 'server-2019-rtm',
      expectedPat: TEST_PAT,
      analyticsEnabled: false,
    });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      args: ['--toolsets', 'projects,work-items,pipelines,analytics,wikis'],
      env: buildAdoEnv(mockAdo, { AZURE_DEVOPS_API_VERSION: '5.0' }),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const toolMap = indexTools(await client.listTools());

    // Step 1: add_work_item_comment -> PATCH /fields/System.History fallback on 5.0
    const commentText = 'Legacy Server 2019 RTM fallback comment';
    mockAdo.clearRequests();
    const addCommentRes = await client.callTool(
      'add_work_item_comment',
      buildSchemaArgs(toolMap, 'add_work_item_comment', [
        [['projectId', 'project'], 'DemoProject'],
        [['workItemId', 'id'], 101],
        [['text', 'comment', 'content'], commentText],
      ]),
    );
    unwrapToolResultText(addCommentRes, { expectSpotlighted: true });
    assert.ok(
      mockAdo.requests.some(
        (r) =>
          r.method === 'PATCH' &&
          /\/wit\/workitems\/101$/i.test(r.pathname) &&
          Array.isArray(r.parsedBody) &&
          r.parsedBody.some(
            (op) =>
              String(op?.path || '').toLowerCase() === '/fields/system.history',
          ),
      ),
      'Step 1 must fall back to PATCH /fields/System.History on Server 2019 RTM',
    );

    // Step 2: list_teams -> succeeds without $expandIdentity
    mockAdo.clearRequests();
    const teamsRes = await client.callTool(
      'list_teams',
      buildSchemaArgs(toolMap, 'list_teams', [
        [['projectId', 'project'], 'DemoProject'],
      ]),
    );
    assert.ok(
      JSON.stringify(
        unwrapToolResultJson(teamsRes, { expectSpotlighted: true }),
      ).includes('DemoProject Team'),
    );
    const teamReqs = mockAdo.requests.filter((r) =>
      /\/teams\b/i.test(r.pathname),
    );
    assert.ok(
      teamReqs.length >= 1,
      'Step 2 must issue GET /teams request to mockAdo',
    );
    assert.equal(
      teamReqs.some((r) => hasQueryParamCI(r.query, '$expandIdentity')),
      false,
      'Step 2 must omit $expandIdentity on Server 2019 RTM',
    );

    // Step 3: get_build_test_results -> succeeds via classic TestApi
    const testsRes = await client.callTool(
      'get_build_test_results',
      buildSchemaArgs(toolMap, 'get_build_test_results', [
        [['projectId', 'project'], 'DemoProject'],
        [['runId', 'buildId'], 500],
      ]),
    );
    assert.ok(
      JSON.stringify(
        unwrapToolResultJson(testsRes, { expectSpotlighted: true }),
      ).includes('Auth.TokenSpec.shouldHandleExpiredToken'),
    );

    // Step 4: retry_pipeline_stage -> graceful Server 2020+ unsupported guidance
    const stageErr = await callToolExpectGracefulError(
      client,
      'retry_pipeline_stage',
      buildSchemaArgs(toolMap, 'retry_pipeline_stage', [
        [['projectId', 'project'], 'DemoProject'],
        [['runId', 'buildId'], 500],
        [
          ['stageRefName', 'stageName', 'stageIdentifier', 'stageId', 'stage'],
          'Test',
        ],
      ]),
    );
    assert.match(
      stageErr,
      /2019|2020|not\s+supported|unsupported|unavailable|not\s+available|requires?\s+.*server/i,
      `Step 4 must return actionable Server 2020+ guidance, got: ${stageErr}`,
    );

    // Step 5: query_analytics -> hits 404 on mockAdo and returns Analytics-disabled guidance
    mockAdo.clearRequests();
    const analyticsErr = await callToolExpectGracefulError(
      client,
      'query_analytics',
      buildSchemaArgs(toolMap, 'query_analytics', [
        [['projectId', 'project'], 'DemoProject'],
        [['entitySet', 'entity', 'table'], 'WorkItems'],
        [
          ['select', '$select'],
          ['WorkItemId', 'Title'],
        ],
      ]),
    );
    assert.ok(
      mockAdo.requests.some((r) => /\/_odata\//i.test(r.pathname)),
      'Step 5 must attempt /_odata/ request against mockAdo',
    );
    assert.match(
      analyticsErr,
      /not\s+enabled|disabled|not\s+installed|not\s+available|unavailable|enable\s+analytics|analytics\s+(?:service|extension|is\s+not|not|disabled|unavailable)|404/i,
      `Step 5 must return actionable Analytics-disabled guidance, got: ${analyticsErr}`,
    );

    // Step 6: HTTP 203 HTML sign-in redirect on direct-HTTP get_wiki_page -> graceful auth error (not raw HTML/JSON crash)
    const isWikiPageGet = (r) =>
      r.method === 'GET' &&
      /\/_apis\/wiki\/wikis\/[^/]+\/pages$/i.test(r.pathname);
    mockAdo.clearRequests();
    mockAdo.setNextError(isWikiPageGet, { status: 203, once: true });
    const err203 = await callToolExpectGracefulError(client, 'get_wiki_page', {
      projectId: 'DemoProject',
      wikiId: WIKI_UUID,
      pagePath: '/Home',
    });
    assert.ok(
      mockAdo.requests.some(isWikiPageGet),
      'Step 6 must issue GET /_apis/wiki/wikis/{wikiId}/pages request that hits injected HTTP 203',
    );
    assert.equal(
      /Unexpected token '<'/i.test(err203),
      false,
      `Step 6 HTTP 203 must be translated into a clean auth error, not raw JSON SyntaxError: ${err203}`,
    );
    assert.equal(
      err203.trim().toLowerCase().startsWith('<!doctype html>'),
      false,
      `Step 6 HTTP 203 must never surface raw HTML sign-in page as output: ${err203}`,
    );
    assert.match(
      err203,
      /auth|pat|sign.?in|203|html|unauthorized|credential|login|permission/i,
      `Step 6 must surface authentication guidance on HTTP 203, got: ${err203}`,
    );

    // Step 7: HTTP 429 with Retry-After: 1 on direct-HTTP get_wiki_page -> graceful rate-limit error OR clean retry success
    mockAdo.clearRequests();
    mockAdo.setNextError(isWikiPageGet, {
      status: 429,
      headers: { 'Retry-After': '1' },
      body: { message: 'Rate limited' },
      once: true,
    });
    let res429;
    let err429 = null;
    try {
      res429 = await client.callTool('get_wiki_page', {
        projectId: 'DemoProject',
        wikiId: WIKI_UUID,
        pagePath: '/Home',
      });
    } catch (err) {
      err429 = err;
    }

    const wiki429Reqs = mockAdo.requests.filter(isWikiPageGet);
    assert.ok(
      wiki429Reqs.length >= 1,
      'Step 7 must issue GET /_apis/wiki/wikis/{wikiId}/pages request that hits injected HTTP 429',
    );
    if (err429 !== null) {
      assert.ok(
        err429 instanceof JsonRpcError,
        `Step 7 expected JsonRpcError or tool result on HTTP 429, got: ${err429}`,
      );
      assert.match(
        err429.message,
        /rate.?limit|429|retry|throttl|resets at/i,
        `Step 7 JsonRpcError on HTTP 429 must be actionable, got: ${err429.message}`,
      );
    } else if (res429.isError === true) {
      const errText = unwrapToolResultText(res429, {
        allowError: true,
        expectSpotlighted: 'auto',
      }).text;
      assert.match(
        errText,
        /rate.?limit|429|retry|throttl|resets at/i,
        `Step 7 rate-limit error must be actionable, got: ${errText}`,
      );
    } else {
      assert.ok(
        wiki429Reqs.length >= 2,
        `Step 7 retry-succeeded branch must record >= 2 GET wiki page requests (initial 429 + retry), got ${wiki429Reqs.length}`,
      );
      const page429Text = unwrapToolResultText(res429, {
        expectSpotlighted: true,
      }).text;
      assert.ok(
        page429Text.includes('# Demo Wiki'),
        `Step 7 retried get_wiki_page must return seeded /Home content, got: ${page429Text}`,
      );
    }

    // Step 8: Server remains completely healthy for follow-up SDK & direct-HTTP calls + clean stdout
    const finalWi = await client.callTool('get_work_item', { workItemId: 101 });
    assert.equal(
      unwrapToolResultJson(finalWi, { expectSpotlighted: true }).id,
      101,
    );
    const finalWiki = await client.callTool('get_wiki_page', {
      projectId: 'DemoProject',
      wikiId: WIKI_UUID,
      pagePath: '/Home',
    });
    assert.ok(
      unwrapToolResultText(finalWiki, {
        expectSpotlighted: true,
      }).text.includes('# Demo Wiki'),
      'Step 8 follow-up get_wiki_page must recover cleanly after HTTP 203 & 429',
    );
    client.assertCleanStdout();
  });

  it(
    'Workflow 8: Stdio Agent Autonomous Monitoring via Polling Watcher (--event-poll-interval 10000) + SEP-3415 Poll + Resource Read + Clean Exit',
    { timeout: 60000 },
    async (t) => {
      const addCleanup = createLifoCleanup(t);
      const prUri =
        'ado://DefaultCollection/DemoProject/events/pull-requests/42';

      const mockAdo = await createMockAdoServer({
        profile: 'server-2022',
        expectedPat: TEST_PAT,
      });
      addCleanup(() => mockAdo.close());

      const client = createStdioMcpClient({
        args: ['--event-poll-interval', '10000'],
        env: buildAdoEnv(mockAdo),
      });
      addCleanup(() => client.close());

      await client.initialize();

      // Step 1: Discover all 5 canonical SEP-3415 event descriptors
      const listRes = await client.request('events/list', {});
      assert.equal(listRes.resultType, 'complete');
      assert.ok(Array.isArray(listRes.events));

      const canonicalEvents = [
        'ado.pull_request.updated',
        'ado.pull_request.checks_changed',
        'ado.pipeline.run_state_changed',
        'ado.work_item.updated',
        'ado.git.pushed',
      ];
      for (const name of canonicalEvents) {
        const desc = listRes.events.find((ev) => ev.name === name);
        assert.ok(desc, `events/list must expose canonical event "${name}"`);
        assert.ok(
          Array.isArray(desc.delivery) &&
            desc.delivery.includes('poll') &&
            desc.delivery.includes('push'),
          `Event "${name}" delivery must include both "poll" and "push"`,
        );
        assert.equal(
          desc.delivery.includes('webhook'),
          false,
          `Event "${name}" must not advertise unsupported outbound "webhook" delivery`,
        );
      }

      // Step 2: Bootstrap events/poll cursor for PR 42
      const bootPoll = await client.request('events/poll', {
        name: 'ado.pull_request.updated',
        arguments: { projectId: 'DemoProject', pullRequestId: 42 },
        cursor: null,
      });
      assert.equal(bootPoll.resultType, 'complete');
      assert.deepEqual(bootPoll.events, []);
      assert.match(bootPoll.cursor, CURSOR_REGEX);
      assert.equal(bootPoll.truncated, false);

      // Step 3: Subscribe to PR 42 event resource URI
      mockAdo.clearRequests();
      await client.subscribeResource(prUri);

      // Step 4: Wait for Polling Watcher baseline GET on PR 42
      const sawBaseline = await waitForMockRequest(
        mockAdo,
        (r) => r.method === 'GET' && /\/pullrequests\/42\b/i.test(r.pathname),
        13000,
      );
      assert.equal(
        sawBaseline,
        true,
        'Polling Watcher must perform baseline GET for PR 42 within 13s',
      );
      await delay(100);

      // Step 5: Mutate PR 42 state on Mock ADO Server
      mockAdo.mutateState((state) => {
        const now = new Date().toISOString();
        const pr = state.pullRequests[42];
        pr.title = 'Add PR review actions [watcher-updated]';
        pr.mergeStatus = 'conflicts';
        pr.lastMergeSourceCommit = {
          commitId: '4444444444444444444444444444444444444444',
        };
        pr.threads.push({
          id: pr.threads.length + 1,
          status: 'active',
          publishedDate: now,
          lastUpdatedDate: now,
          comments: [
            {
              id: 1,
              parentCommentId: 0,
              content: 'New PR review comment for watcher',
              commentType: 'text',
              publishedDate: now,
              author: state.identities[1],
            },
          ],
        });
        pr.reviewers[0].vote = 10;
      });

      // Step 6: Await live notifications/resources/updated notification over stdio
      const notif = await client.waitForNotification(
        (m) =>
          m.method === 'notifications/resources/updated' &&
          m.params?.uri === prUri,
        28000,
      );
      assert.equal(notif.params.uri, prUri);

      // Step 7: Poll SEP-3415 cursor to retrieve normalized PR 42 event
      const afterPoll = await client.request('events/poll', {
        name: 'ado.pull_request.updated',
        arguments: { projectId: 'DemoProject', pullRequestId: 42 },
        cursor: bootPoll.cursor,
      });
      assert.equal(afterPoll.resultType, 'complete');
      assert.match(
        String(afterPoll.cursor ?? ''),
        CURSOR_REGEX,
        `Expected valid SEP-3415 cursor on follow-up events/poll, got: ${String(afterPoll.cursor)}`,
      );
      assert.notEqual(afterPoll.cursor, bootPoll.cursor);
      assert.ok(
        afterPoll.events.some(
          (e) =>
            e.name === 'ado.pull_request.updated' &&
            Number(e.data?.pullRequestId) === 42,
        ),
        `Expected ado.pull_request.updated for PR 42 in events/poll, got: ${JSON.stringify(afterPoll.events)}`,
      );

      // Step 8: Read raw un-spotlighted JSON from PR 42 event resource
      const readRes = await client.readResource(prUri);
      assert.ok(
        Array.isArray(readRes.contents) && readRes.contents.length >= 1,
      );
      const rawText = readRes.contents[0].text;
      assert.equal(
        parseSpotlightedText(rawText).isSpotlighted,
        false,
        'resources/read on PR 42 event resource must return raw JSON without Spotlighting',
      );
      const resourceJson = JSON.parse(rawText);
      assert.ok(
        Array.isArray(resourceJson.events) &&
          resourceJson.events.some(
            (e) =>
              e.name === 'ado.pull_request.updated' &&
              Number(e.data?.pullRequestId) === 42,
          ),
        'PR 42 event resource JSON must contain the detected PR transition event',
      );

      // Step 9: Unsubscribe, verify clean stdout, close cleanly, verify zero lingering PID
      await client.unsubscribeResource(prUri);
      client.assertCleanStdout();
      const serverPid = client.pid;
      await client.close();
      assert.throws(
        () => process.kill(serverPid, 0),
        { code: 'ESRCH' },
        'Stdio server PID must be gone after clean close()',
      );
    },
  );
});
