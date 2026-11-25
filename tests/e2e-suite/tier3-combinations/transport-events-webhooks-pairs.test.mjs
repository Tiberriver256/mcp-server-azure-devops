import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import {
  assertSpotlighted,
  extractTextContent,
  parseSpotlightedText,
  unwrapToolResultJson,
} from '../harness/assertions.mjs';
import {
  createHttpMcpClient,
  startHttpMcpServer,
} from '../harness/mcp-http-client.mjs';
import { createStdioMcpClient } from '../harness/mcp-stdio-client.mjs';
import { createMockAdoServer } from '../harness/mock-ado-server.mjs';

const TEST_PAT = 'e3-tier3-evt-pat-54321';
const CURSOR_REGEX = /^v1:[0-9a-f]{8}:\d+$/i;

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

function getQueryParamCI(query, name) {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (k.toLowerCase() === lower) {
      return v;
    }
  }
  return undefined;
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

function buildWorkItemUpdatedWebhook(collectionUrl, overrides = {}) {
  const rev = overrides.rev ?? 3;
  const state = overrides.state ?? 'Resolved';
  const title = overrides.title ?? 'Implement OData Analytics';
  return {
    subscriptionId: '11111111-aaaa-4111-8111-111111111111',
    notificationId: overrides.notificationId ?? 10,
    id: overrides.id ?? `wh-wi-updated-${rev}`,
    eventType: 'workitem.updated',
    publisherId: 'tfs',
    createdDate: overrides.createdDate ?? '2026-11-25T10:01:00Z',
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
      revisedDate: overrides.createdDate ?? '2026-11-25T10:01:00Z',
      url: `${collectionUrl}/DemoProject/_apis/wit/workItems/101/updates/${rev}`,
      fields: {
        'System.Rev': { oldValue: rev - 1, newValue: rev },
        'System.State': { oldValue: 'Active', newValue: state },
      },
      revision: {
        id: 101,
        rev,
        url: `${collectionUrl}/DemoProject/_apis/wit/workItems/101`,
        fields: {
          'System.TeamProject': 'DemoProject',
          'System.WorkItemType': 'User Story',
          'System.Title': title,
          'System.State': state,
          'System.AreaPath': 'DemoProject',
          'System.AssignedTo': 'Alice Reviewer <alice@example.com>',
        },
      },
    },
  };
}

function buildPullRequestUpdatedWebhook(collectionUrl, overrides = {}) {
  return {
    subscriptionId: '11111111-aaaa-4111-8111-111111111112',
    notificationId: overrides.notificationId ?? 11,
    id: overrides.id ?? 'wh-pr-updated-001',
    eventType: 'git.pullrequest.updated',
    publisherId: 'tfs',
    createdDate: '2026-11-25T10:02:00Z',
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

function buildGitPushWebhook(collectionUrl, overrides = {}) {
  return {
    subscriptionId: '11111111-aaaa-4111-8111-111111111114',
    notificationId: overrides.notificationId ?? 13,
    id: overrides.id ?? 'wh-git-push-001',
    eventType: 'git.push',
    publisherId: 'tfs',
    createdDate: '2026-11-25T10:04:00Z',
    resourceVersion: '1.0',
    resourceContainers: {
      project: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: 'DemoProject',
        baseUrl: `${collectionUrl}/`,
      },
    },
    resource: {
      pushId: 99,
      date: '2026-11-25T10:04:00Z',
      pushedBy: {
        id: '22222222-2222-4222-8222-222222222222',
        displayName: 'Bob Developer',
        uniqueName: 'bob@example.com',
      },
      refUpdates: [
        {
          name: 'refs/heads/main',
          oldObjectId: '1111111111111111111111111111111111111111',
          newObjectId: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
        },
      ],
      commits: [
        {
          commitId: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
          comment: 'Fix login flake in CI',
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
      url: `${collectionUrl}/DemoProject/_apis/git/repositories/77777777-7777-4777-8777-777777777777/pushes/99`,
    },
  };
}

describe('Tier 3 — Transport, Events & Webhooks Pairwise Combinations', () => {
  it('pair 1: Streamable HTTP + POST /webhooks/ado (Basic Auth) drives SEP-3415 events/poll cursor progression and rejects wrong Basic Auth', async (t) => {
    const addCleanup = createLifoCleanup(t);
    const webhookSecret = 'wh-basic-secret';

    const mockAdo = await createMockAdoServer({
      profile: 'server-2022',
      expectedPat: TEST_PAT,
    });
    addCleanup(() => mockAdo.close());

    const httpServer = await startHttpMcpServer({
      passPortZero: true,
      args: ['--webhook-secret', webhookSecret],
      env: buildAdoEnv(mockAdo),
    });
    addCleanup(() => httpServer.close());

    const client = createHttpMcpClient(httpServer.baseUrl);
    addCleanup(() => client.close());
    const webhookClient = createHttpMcpClient(httpServer.baseUrl);
    addCleanup(() => webhookClient.close());

    const initResult = await client.initialize();
    assert.ok(
      initResult.capabilities?.extensions?.['io.modelcontextprotocol/events'] &&
        typeof initResult.capabilities.extensions[
          'io.modelcontextprotocol/events'
        ] === 'object',
      'InitializeResult must advertise io.modelcontextprotocol/events extension',
    );

    const poll1 = await client.request('events/poll', {
      name: 'ado.work_item.updated',
      arguments: { projectId: 'DemoProject' },
      cursor: null,
    });
    assert.equal(poll1.resultType, 'complete');
    assert.deepEqual(poll1.events, []);
    assert.match(poll1.cursor, CURSOR_REGEX);
    assert.equal(poll1.truncated, false);
    assert.ok(
      typeof poll1.nextPollMs === 'number' && poll1.nextPollMs > 0,
      'events/poll must return positive nextPollMs',
    );

    // Wrong Basic Auth MUST return 401 and emit zero events.
    const badBasic = Buffer.from('ado:wrong-secret', 'utf8').toString('base64');
    const badRes = await webhookClient.postWebhook(
      buildWorkItemUpdatedWebhook(mockAdo.collectionUrl, {
        id: 'wh-basic-rejected',
      }),
      { Authorization: `Basic ${badBasic}` },
    );
    assert.equal(badRes.status, 401);

    const afterBadPoll = await client.request('events/poll', {
      name: 'ado.work_item.updated',
      arguments: { projectId: 'DemoProject' },
      cursor: poll1.cursor,
    });
    assert.equal(
      afterBadPoll.events.length,
      0,
      'Rejected 401 webhook must not ingest any event',
    );

    // Valid Basic Auth -> 200 -> events/poll advances cursor and returns normalized event.
    const goodBasic = Buffer.from(`ado:${webhookSecret}`, 'utf8').toString(
      'base64',
    );
    const okRes = await webhookClient.postWebhook(
      buildWorkItemUpdatedWebhook(mockAdo.collectionUrl, {
        id: 'wh-basic-ok-1',
        rev: 3,
      }),
      { Authorization: `Basic ${goodBasic}` },
    );
    assert.equal(okRes.status, 200);

    const poll2 = await client.request('events/poll', {
      name: 'ado.work_item.updated',
      arguments: { projectId: 'DemoProject' },
      cursor: poll1.cursor,
    });
    assert.equal(poll2.resultType, 'complete');
    assert.equal(poll2.truncated, false);
    assert.ok(
      poll2.events.length >= 1,
      'Expected >= 1 event after webhook POST',
    );
    assert.match(poll2.cursor, CURSOR_REGEX);
    assert.notEqual(
      poll2.cursor,
      poll1.cursor,
      'Cursor must advance after receiving webhook event',
    );

    const wiEvt = poll2.events.find(
      (e) =>
        e.name === 'ado.work_item.updated' &&
        Number(e.data?.workItemId) === 101,
    );
    assert.ok(
      wiEvt,
      `Expected normalized ado.work_item.updated for WI 101, got: ${JSON.stringify(poll2.events)}`,
    );
    assert.ok(
      typeof wiEvt.eventId === 'string' && wiEvt.eventId.length > 0,
      `Expected non-empty eventId string, got: ${String(wiEvt.eventId)}`,
    );
    assert.ok(
      typeof wiEvt.timestamp === 'string' && wiEvt.timestamp.length > 0,
      `Expected non-empty timestamp string, got: ${String(wiEvt.timestamp)}`,
    );

    // Third poll with cursor2 -> empty.
    const poll3 = await client.request('events/poll', {
      name: 'ado.work_item.updated',
      arguments: { projectId: 'DemoProject' },
      cursor: poll2.cursor,
    });
    assert.equal(poll3.resultType, 'complete');
    assert.equal(poll3.events.length, 0);
  });

  it('pair 2: Streamable HTTP + POST /webhooks/ado (X-ADO-Webhook-Secret) pushes live SEP-3415 events/stream notifications and tears down cleanly', async (t) => {
    const addCleanup = createLifoCleanup(t);
    const webhookSecret = 'wh-hdr-secret';
    const mcpToken = 'mcp-stream-tok';

    const mockAdo = await createMockAdoServer({
      profile: 'server-2022',
      expectedPat: TEST_PAT,
    });
    addCleanup(() => mockAdo.close());

    const httpServer = await startHttpMcpServer({
      passPortZero: true,
      args: ['--webhook-secret', webhookSecret, '--http-auth-token', mcpToken],
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

    await client.initialize();

    const stream = await client.openPostStream('events/stream', {
      name: 'ado.pull_request.updated',
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
      'notifications/events/active must carry matching subscriptionId',
    );
    assert.match(activeEvt.json.params?.cursor, CURSOR_REGEX);
    assert.equal(activeEvt.json.params?.truncated, false);

    const whRes = await webhookClient.postWebhook(
      buildPullRequestUpdatedWebhook(mockAdo.collectionUrl),
      { 'X-ADO-Webhook-Secret': webhookSecret },
    );
    assert.equal(whRes.status, 200);

    const pushedEvt = await stream.waitForEvent(
      (e) => e.json?.method === 'notifications/events/event',
      5000,
    );
    assert.equal(pushedEvt.json.params?.name, 'ado.pull_request.updated');
    assert.equal(
      pushedEvt.json.params?._meta?.['io.modelcontextprotocol/subscriptionId'],
      stream.requestId,
      'notifications/events/event must correlate subscriptionId === stream.requestId',
    );
    assert.equal(Number(pushedEvt.json.params?.data?.pullRequestId), 42);

    stream.close();
    assert.equal(stream.closed, true);

    // Server remains completely healthy for subsequent RPCs after stream disconnect.
    const listRes = await client.request('events/list', {});
    assert.equal(listRes.resultType, 'complete');
    assert.ok(Array.isArray(listRes.events));
    assert.ok(
      listRes.events.some((ev) => ev.name === 'ado.pull_request.updated'),
      'events/list must succeed cleanly after stream teardown',
    );
  });

  it('pair 3: Streamable HTTP + POST /webhooks/ado triggers 2025-11-25 resources/subscribe GET SSE notification and raw resources/read', async (t) => {
    const addCleanup = createLifoCleanup(t);
    const webhookSecret = 'wh-sub-secret';
    const feedUri = 'ado://DefaultCollection/DemoProject/events/feed';

    const mockAdo = await createMockAdoServer({
      profile: 'server-2022',
      expectedPat: TEST_PAT,
    });
    addCleanup(() => mockAdo.close());

    const httpServer = await startHttpMcpServer({
      passPortZero: true,
      args: ['--webhook-secret', webhookSecret],
      env: buildAdoEnv(mockAdo),
    });
    addCleanup(() => httpServer.close());

    const client = createHttpMcpClient(httpServer.baseUrl);
    addCleanup(() => client.close());
    const webhookClient = createHttpMcpClient(httpServer.baseUrl);
    addCleanup(() => webhookClient.close());

    const initResult = await client.initialize();
    assert.equal(
      initResult.capabilities?.resources?.subscribe,
      true,
      'Server must advertise capabilities.resources.subscribe === true',
    );

    await client.subscribeResource(feedUri);
    const sse = await client.openSseStream();
    addCleanup(() => sse.close());
    assert.equal(sse.status, 200);

    const whRes = await webhookClient.postWebhook(
      buildWorkItemUpdatedWebhook(mockAdo.collectionUrl, {
        id: 'wh-sub-wi-1',
        rev: 3,
      }),
      { 'X-ADO-Webhook-Secret': webhookSecret },
    );
    assert.equal(whRes.status, 200);

    const updated = await sse.waitForEvent(
      (e) =>
        e.json?.method === 'notifications/resources/updated' &&
        e.json?.params?.uri === feedUri,
      5000,
    );
    assert.equal(updated.json.params.uri, feedUri);

    const readRes = await client.readResource(feedUri);
    assert.ok(
      Array.isArray(readRes.contents) && readRes.contents.length >= 1,
      'resources/read must return contents array',
    );
    const rawText = readRes.contents[0].text;
    assert.equal(
      parseSpotlightedText(rawText).isSpotlighted,
      false,
      'resources/read must return raw JSON without Spotlighting delimiters',
    );
    const feed = JSON.parse(rawText);
    assert.ok(Array.isArray(feed.events));
    assert.ok(
      feed.events.some(
        (evt) =>
          evt.name === 'ado.work_item.updated' &&
          Number(evt.data?.workItemId) === 101,
      ),
      'Feed JSON must include ingested WI 101 event',
    );

    await client.unsubscribeResource(feedUri);
  });

  it('pair 4: Streamable HTTP + POST /webhooks/ado feeds opt-in events toolset poll_events with default Spotlighting ON', async (t) => {
    const addCleanup = createLifoCleanup(t);
    const webhookSecret = 'wh-tool-secret';

    const mockAdo = await createMockAdoServer({
      profile: 'server-2022',
      expectedPat: TEST_PAT,
    });
    addCleanup(() => mockAdo.close());

    const httpServer = await startHttpMcpServer({
      passPortZero: true,
      args: ['--toolsets', 'events', '--webhook-secret', webhookSecret],
      env: buildAdoEnv(mockAdo),
    });
    addCleanup(() => httpServer.close());

    const client = createHttpMcpClient(httpServer.baseUrl);
    addCleanup(() => client.close());
    const webhookClient = createHttpMcpClient(httpServer.baseUrl);
    addCleanup(() => webhookClient.close());

    await client.initialize();
    const toolMap = indexTools(await client.listTools());
    assert.ok(toolMap.has('list_event_types'));
    assert.ok(toolMap.has('poll_events'));

    const typesRes = await client.callTool('list_event_types', {});
    const typesJson = unwrapToolResultJson(typesRes, {
      expectSpotlighted: 'auto',
    });
    assert.ok(
      JSON.stringify(typesJson).includes('ado.git.pushed'),
      'list_event_types must include ado.git.pushed',
    );

    const bootstrapRes = await client.callTool(
      'poll_events',
      buildSchemaArgs(toolMap, 'poll_events', [
        [['name', 'eventName', 'eventType'], 'ado.git.pushed'],
        [['arguments', 'filter', 'args'], { projectId: 'DemoProject' }],
        [['cursor'], null],
      ]),
    );
    const bootSpot = assertSpotlighted(extractTextContent(bootstrapRes), {
      checkNotDoubleWrapped: true,
    });
    const bootJson = unwrapToolResultJson(bootstrapRes, {
      expectSpotlighted: true,
    });
    assert.match(bootJson.cursor, CURSOR_REGEX);

    const whRes = await webhookClient.postWebhook(
      buildGitPushWebhook(mockAdo.collectionUrl),
      { 'X-ADO-Webhook-Secret': webhookSecret },
    );
    assert.equal(whRes.status, 200);

    const nextRes = await client.callTool(
      'poll_events',
      buildSchemaArgs(toolMap, 'poll_events', [
        [['name', 'eventName', 'eventType'], 'ado.git.pushed'],
        [['arguments', 'filter', 'args'], { projectId: 'DemoProject' }],
        [['cursor'], bootJson.cursor],
      ]),
    );
    const nextSpot = assertSpotlighted(extractTextContent(nextRes), {
      checkNotDoubleWrapped: true,
    });
    assert.notEqual(nextSpot.nonce, bootSpot.nonce);

    const nextJson = unwrapToolResultJson(nextRes, { expectSpotlighted: true });
    assert.match(nextJson.cursor, CURSOR_REGEX);
    assert.notEqual(nextJson.cursor, bootJson.cursor);
    assert.ok(Array.isArray(nextJson.events) && nextJson.events.length >= 1);
    const pushEvt = nextJson.events.find(
      (e) => e.name === 'ado.git.pushed' && Number(e.data?.pushId) === 99,
    );
    assert.ok(
      pushEvt,
      `Expected ado.git.pushed for pushId 99, got: ${JSON.stringify(nextJson.events)}`,
    );
  });

  it(
    'pair 5: Stdio transport + Polling Watcher (--event-poll-interval 10000) detects mockAdo work-item mutation and emits notifications/resources/updated + events/poll',
    { timeout: 50000 },
    async (t) => {
      const addCleanup = createLifoCleanup(t);
      const wiUri = 'ado://DefaultCollection/DemoProject/events/work-items/101';

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

      const bootPoll = await client.request('events/poll', {
        name: 'ado.work_item.updated',
        arguments: { projectId: 'DemoProject', workItemId: 101 },
        cursor: null,
      });
      assert.match(bootPoll.cursor, CURSOR_REGEX);

      mockAdo.clearRequests();
      await client.subscribeResource(wiUri);

      const sawBaseline = await waitForMockRequest(
        mockAdo,
        (r) =>
          r.method === 'GET' &&
          /\/wit\/workitems(?:\/101\b|\?)/i.test(`${r.pathname}?`),
        13000,
      );
      assert.equal(
        sawBaseline,
        true,
        'Expected Polling Watcher to execute baseline GET for work item 101 within 13s',
      );
      await delay(100);

      mockAdo.mutateState((state) => {
        const now = new Date().toISOString();
        const wi = state.workItems[101];
        wi.rev = (wi.rev || 2) + 1;
        wi.fields['System.State'] = 'Resolved';
        wi.fields['System.Title'] = 'Implement OData Analytics [resolved]';
        wi.fields['System.ChangedDate'] = now;
        state.workItemRevisions[101].push(structuredClone(wi));
        const commentId = state.nextCommentId;
        state.nextCommentId += 1;
        state.workItemComments[101].push({
          id: commentId,
          workItemId: 101,
          version: 1,
          text: 'Watcher transition comment on 101',
          renderedText: '<p>Watcher transition comment on 101</p>',
          format: 'html',
          createdBy: wi.fields['System.AssignedTo'],
          createdDate: now,
          modifiedBy: wi.fields['System.AssignedTo'],
          modifiedDate: now,
          isDeleted: false,
          url: `${mockAdo.collectionUrl}/DemoProject/_apis/wit/workItems/101/comments/${commentId}`,
        });
      });

      const notif = await client.waitForNotification(
        (m) =>
          m.method === 'notifications/resources/updated' &&
          m.params?.uri === wiUri,
        28000,
      );
      assert.equal(notif.params.uri, wiUri);

      const afterPoll = await client.request('events/poll', {
        name: 'ado.work_item.updated',
        arguments: { projectId: 'DemoProject', workItemId: 101 },
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
            e.name === 'ado.work_item.updated' &&
            Number(e.data?.workItemId) === 101,
        ),
        `Expected ado.work_item.updated for WI 101 in events/poll, got: ${JSON.stringify(afterPoll.events)}`,
      );

      await client.unsubscribeResource(wiUri);
      client.assertCleanStdout();
    },
  );

  it('pair 6: Streamable HTTP stateful mode replays missed notifications on SSE reconnect via Last-Event-ID and BoundedEventStore', async (t) => {
    const addCleanup = createLifoCleanup(t);
    const webhookSecret = 'wh-sec-replay';
    const feedUri = 'ado://DefaultCollection/DemoProject/events/feed';

    const mockAdo = await createMockAdoServer({
      profile: 'server-2022',
      expectedPat: TEST_PAT,
    });
    addCleanup(() => mockAdo.close());

    const httpServer = await startHttpMcpServer({
      passPortZero: true,
      args: ['--http-mode', 'stateful', '--webhook-secret', webhookSecret],
      env: buildAdoEnv(mockAdo),
    });
    addCleanup(() => httpServer.close());

    const client = createHttpMcpClient(httpServer.baseUrl);
    addCleanup(() => client.close());
    const webhookClient = createHttpMcpClient(httpServer.baseUrl);
    addCleanup(() => webhookClient.close());

    await client.initialize();
    assert.ok(
      typeof client.sessionId === 'string' && client.sessionId.length > 0,
      'Stateful HTTP initialize must issue Mcp-Session-Id',
    );
    await client.subscribeResource(feedUri);

    const sse1 = await client.openSseStream();
    addCleanup(() => sse1.close());
    assert.equal(sse1.status, 200);

    // Event #1 delivered while connected so client acquires initial SSE event ID.
    const wh1 = await webhookClient.postWebhook(
      buildWorkItemUpdatedWebhook(mockAdo.collectionUrl, {
        id: 'wh-replay-1',
        notificationId: 101,
        rev: 3,
        state: 'Resolved',
      }),
      { 'X-ADO-Webhook-Secret': webhookSecret },
    );
    assert.equal(wh1.status, 200);

    const evt1 = await sse1.waitForEvent(
      (e) =>
        e.json?.method === 'notifications/resources/updated' &&
        e.json?.params?.uri === feedUri,
      5000,
    );
    const savedId = evt1.id ?? sse1.lastEventId ?? client.lastEventId;
    assert.ok(
      typeof savedId === 'string' && savedId.length > 0,
      `Expected non-empty SSE Last-Event-ID on Event #1, got: ${String(savedId)}`,
    );

    // Disconnect and settle so server clears _GET_stream mapping before reconnect.
    sse1.close();
    await delay(150);

    // Event #2 arrives while client is disconnected (buffered in BoundedEventStore).
    const wh2 = await webhookClient.postWebhook(
      buildWorkItemUpdatedWebhook(mockAdo.collectionUrl, {
        id: 'wh-replay-2',
        notificationId: 102,
        rev: 4,
        state: 'Closed',
      }),
      { 'X-ADO-Webhook-Secret': webhookSecret },
    );
    assert.equal(wh2.status, 200);

    // Reconnect with Last-Event-ID (retry once if 409 from async cancel race).
    let sse2 = await client.openSseStream({ lastEventId: savedId });
    if (sse2.status === 409) {
      sse2.close();
      await delay(150);
      sse2 = await client.openSseStream({ lastEventId: savedId });
    }
    addCleanup(() => sse2.close());
    assert.equal(
      sse2.status,
      200,
      `Expected SSE reconnect with Last-Event-ID to return 200, got ${sse2.status}`,
    );

    const replayed = await sse2.waitForEvent(
      (e) =>
        e.json?.method === 'notifications/resources/updated' &&
        e.json?.params?.uri === feedUri,
      5000,
    );
    const replayedId = replayed.id ?? sse2.lastEventId;
    assert.ok(
      typeof replayedId === 'string' && replayedId.length > 0,
      `Expected non-empty SSE id on replayed Event #2, got: ${String(replayedId)}`,
    );
    assert.notEqual(
      replayedId,
      savedId,
      'Replayed Event #2 must carry a distinct SSE id from Event #1',
    );
    assert.equal(replayed.json.params.uri, feedUri);

    // Confirm resources/read contains BOTH Event #1 and Event #2 in raw JSON.
    const readRes = await client.readResource(feedUri);
    const rawText = readRes.contents[0].text;
    assert.equal(parseSpotlightedText(rawText).isSpotlighted, false);
    const feed = JSON.parse(rawText);
    const wiEvents = feed.events.filter(
      (e) =>
        e.name === 'ado.work_item.updated' &&
        Number(e.data?.workItemId) === 101,
    );
    assert.ok(
      wiEvents.length >= 2,
      `Expected both Event #1 and Event #2 in resources/read feed, got ${wiEvents.length}`,
    );
    assert.ok(
      wiEvents.some((e) => Number(e.data?.rev) === 3) &&
        wiEvents.some((e) => Number(e.data?.rev) === 4),
      `Expected rev 3 and rev 4 events in feed, got: ${JSON.stringify(wiEvents)}`,
    );
  });

  it('pair 7: Streamable HTTP + --allow-per-request-pat isolates concurrent multi-tenant SDK & OData requests with zero cross-session PAT leakage', async (t) => {
    const addCleanup = createLifoCleanup(t);
    const mcpToken = 'tok-mt';

    // Omit expectedPat so mockAdo accepts all 3 tenant PATs and records every Authorization header.
    const mockAdo = await createMockAdoServer({
      profile: 'server-2022',
    });
    addCleanup(() => mockAdo.close());

    const httpServer = await startHttpMcpServer({
      passPortZero: true,
      args: [
        '--http-auth-token',
        mcpToken,
        '--allow-per-request-pat',
        '--toolsets',
        'work-items,pull-requests,analytics',
      ],
      env: buildAdoEnv(mockAdo, { AZURE_DEVOPS_PAT: 'pat-default' }),
    });
    addCleanup(() => httpServer.close());

    const clientA = createHttpMcpClient(httpServer.baseUrl, {
      defaultHeaders: {
        Authorization: `Bearer ${mcpToken}`,
        'X-Azure-DevOps-PAT': 'pat-alpha',
      },
    });
    addCleanup(() => clientA.close());

    const clientB = createHttpMcpClient(httpServer.baseUrl, {
      defaultHeaders: {
        Authorization: `Bearer ${mcpToken}`,
        'X-Azure-DevOps-PAT': 'pat-beta',
      },
    });
    addCleanup(() => clientB.close());

    const clientDefault = createHttpMcpClient(httpServer.baseUrl, {
      defaultHeaders: {
        Authorization: `Bearer ${mcpToken}`,
      },
    });
    addCleanup(() => clientDefault.close());

    await Promise.all([
      clientA.initialize(),
      clientB.initialize(),
      clientDefault.initialize(),
    ]);

    const sessionIds = new Set([
      clientA.sessionId,
      clientB.sessionId,
      clientDefault.sessionId,
    ]);
    assert.equal(
      sessionIds.size,
      3,
      'Multi-tenant clients must receive 3 distinct Mcp-Session-Id values',
    );

    const toolMap = indexTools(await clientA.listTools());
    const odata101Args = buildSchemaArgs(toolMap, 'query_analytics', [
      [['projectId', 'project'], 'DemoProject'],
      [['entitySet', 'entity', 'table'], 'WorkItems'],
      [
        ['select', '$select'],
        ['WorkItemId', 'Title'],
      ],
      [['filter', '$filter'], 'WorkItemId eq 101'],
    ]);
    const odata102Args = buildSchemaArgs(toolMap, 'query_analytics', [
      [['projectId', 'project'], 'DemoProject'],
      [['entitySet', 'entity', 'table'], 'WorkItems'],
      [
        ['select', '$select'],
        ['WorkItemId', 'Title'],
      ],
      [['filter', '$filter'], 'WorkItemId eq 102'],
    ]);

    mockAdo.clearRequests();

    // Concurrent round across all 3 tenants (SDK WebApi + direct-HTTP OData).
    const [wiA, prA, odataA, wiB, prB, odataB, wiDef] = await Promise.all([
      clientA.callTool('get_work_item', { workItemId: 101 }),
      clientA.callTool('get_pull_request', {
        projectId: 'DemoProject',
        pullRequestId: 42,
      }),
      clientA.callTool('query_analytics', odata101Args),
      clientB.callTool('get_work_item', { workItemId: 102 }),
      clientB.callTool('get_pull_request', {
        projectId: 'DemoProject',
        pullRequestId: 43,
      }),
      clientB.callTool('query_analytics', odata102Args),
      clientDefault.callTool('get_work_item', { workItemId: 103 }),
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
        unwrapToolResultJson(odataA, { expectSpotlighted: true }),
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
        unwrapToolResultJson(odataB, { expectSpotlighted: true }),
      ).includes('102'),
    );
    assert.equal(
      unwrapToolResultJson(wiDef, { expectSpotlighted: true }).id,
      103,
    );

    // Interleaved sequential check verifying cached sessions never cross-contaminate.
    const wiB2 = await clientB.callTool('get_work_item', { workItemId: 102 });
    const wiA2 = await clientA.callTool('get_work_item', { workItemId: 101 });
    assert.equal(
      unwrapToolResultJson(wiB2, { expectSpotlighted: true }).id,
      102,
    );
    assert.equal(
      unwrapToolResultJson(wiA2, { expectSpotlighted: true }).id,
      101,
    );

    const assertEveryMatchUsesPat = (label, matcher, expectedPat) => {
      const matched = mockAdo.requests.filter(matcher);
      assert.ok(
        matched.length >= 1,
        `Expected >= 1 mockAdo request for ${label}, found 0`,
      );
      for (const req of matched) {
        const pat = decodeBasicPat(req);
        assert.equal(
          pat,
          expectedPat,
          `Tenant isolation violation on ${label} (${req.method} ${req.url}): expected PAT "${expectedPat}", got "${String(pat)}"`,
        );
      }
    };

    assertEveryMatchUsesPat(
      'Tenant A WI 101',
      (r) =>
        /\/wit\/workitems\/101(?:\b|$)/i.test(r.pathname) ||
        getQueryParamCI(r.query, 'ids') === '101',
      'pat-alpha',
    );
    assertEveryMatchUsesPat(
      'Tenant A PR 42',
      (r) => /\/pullrequests\/42(?:\b|$)/i.test(r.pathname),
      'pat-alpha',
    );
    assertEveryMatchUsesPat(
      'Tenant A OData 101',
      (r) =>
        /\/_odata\//i.test(r.pathname) && `${r.url} ${r.body}`.includes('101'),
      'pat-alpha',
    );
    assertEveryMatchUsesPat(
      'Tenant B WI 102',
      (r) =>
        /\/wit\/workitems\/102(?:\b|$)/i.test(r.pathname) ||
        getQueryParamCI(r.query, 'ids') === '102',
      'pat-beta',
    );
    assertEveryMatchUsesPat(
      'Tenant B PR 43',
      (r) => /\/pullrequests\/43(?:\b|$)/i.test(r.pathname),
      'pat-beta',
    );
    assertEveryMatchUsesPat(
      'Tenant B OData 102',
      (r) =>
        /\/_odata\//i.test(r.pathname) && `${r.url} ${r.body}`.includes('102'),
      'pat-beta',
    );
    assertEveryMatchUsesPat(
      'Default Tenant WI 103',
      (r) =>
        /\/wit\/workitems\/103(?:\b|$)/i.test(r.pathname) ||
        getQueryParamCI(r.query, 'ids') === '103',
      'pat-default',
    );

    const stderr = httpServer.getStderr();
    for (const secret of ['pat-alpha', 'pat-beta', 'pat-default', mcpToken]) {
      assert.equal(
        stderr.includes(secret),
        false,
        `Server stderr must NEVER leak secret "${secret}"`,
      );
    }
  });
});
