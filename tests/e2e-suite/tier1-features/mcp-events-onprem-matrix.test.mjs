import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import {
  readRepoFile,
  readRepoJson,
  repoFileExists,
  repoPath,
  unwrapToolResultJson,
  unwrapToolResultText,
} from '../harness/assertions.mjs';
import {
  createHttpMcpClient,
  startHttpMcpServer,
} from '../harness/mcp-http-client.mjs';
import { createStdioMcpClient } from '../harness/mcp-stdio-client.mjs';
import { getProfile } from '../harness/mock-ado-profiles.mjs';
import { createMockAdoServer } from '../harness/mock-ado-server.mjs';

const CURSOR_RE = /^v1:[0-9a-f]{8}:\d+$/;

const CANONICAL_EVENT_NAMES = [
  'ado.git.pushed',
  'ado.pipeline.run_state_changed',
  'ado.pull_request.checks_changed',
  'ado.pull_request.updated',
  'ado.work_item.updated',
];

const GIT_PUSH_WEBHOOK = {
  id: '11111111-aaaa-4aaa-8aaa-000000000001',
  eventType: 'git.push',
  publisherId: 'tfs',
  createdDate: '2026-11-25T10:00:00Z',
  resourceVersion: '1.0',
  resourceContainers: {
    project: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  },
  resource: {
    pushId: 99,
    url: 'http://127.0.0.1/tfs/DefaultCollection/DemoProject/_git/DemoRepo/pushes/99',
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
        comment: 'Push from E2E webhook',
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

const ADO_TEST_WEBHOOK = {
  ...GIT_PUSH_WEBHOOK,
  id: '00000000-0000-0000-0000-000000000000',
  subscriptionId: '00000000-0000-0000-0000-000000000000',
  message: { text: 'Test event from Azure DevOps Service Hooks' },
};

const PR_UPDATED_WEBHOOK = {
  id: '11111111-aaaa-4aaa-8aaa-000000000002',
  eventType: 'git.pullrequest.updated',
  publisherId: 'tfs',
  createdDate: '2026-11-25T10:01:00Z',
  resourceVersion: '1.0',
  resourceContainers: {
    project: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  },
  resource: {
    pullRequestId: 42,
    status: 'active',
    mergeStatus: 'succeeded',
    title: 'Add PR review actions',
    url: 'http://127.0.0.1/tfs/DefaultCollection/DemoProject/_git/DemoRepo/pullrequest/42',
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

const BUILD_COMPLETE_WEBHOOK = {
  id: '11111111-aaaa-4aaa-8aaa-000000000003',
  eventType: 'build.complete',
  publisherId: 'tfs',
  createdDate: '2026-11-25T10:02:00Z',
  resourceVersion: '1.0',
  resourceContainers: {
    project: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  },
  resource: {
    id: 500,
    buildNumber: '20261125.1',
    status: 'completed',
    result: 'succeeded',
    sourceBranch: 'refs/heads/main',
    definition: { id: 10, name: 'CI-Main' },
    project: {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'DemoProject',
    },
    url: 'http://127.0.0.1/tfs/DefaultCollection/DemoProject/_build/results?buildId=500',
  },
};

const WORKITEM_UPDATED_WEBHOOK = {
  id: '11111111-aaaa-4aaa-8aaa-000000000004',
  eventType: 'workitem.updated',
  publisherId: 'tfs',
  createdDate: '2026-11-25T10:03:00Z',
  resourceVersion: '1.0',
  resourceContainers: {
    project: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  },
  resource: {
    id: 101,
    workItemId: 101,
    rev: 3,
    fields: {
      'System.State': { oldValue: 'Active', newValue: 'Resolved' },
    },
    revision: {
      id: 101,
      rev: 3,
      fields: {
        'System.TeamProject': 'DemoProject',
        'System.WorkItemType': 'User Story',
        'System.Title': 'Implement OData Analytics',
        'System.State': 'Resolved',
      },
    },
    url: 'http://127.0.0.1/tfs/DefaultCollection/DemoProject/_workitems/edit/101',
  },
};

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
  const env = {
    AZURE_DEVOPS_ORG_URL: mockAdo.url,
    AZURE_DEVOPS_AUTH_METHOD: 'pat',
    AZURE_DEVOPS_PAT: 'test-pat-12345',
    AZURE_DEVOPS_DEFAULT_PROJECT: 'DemoProject',
    ...extra,
  };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) {
      delete env[k];
    }
  }
  return env;
}

function requireTool(tools, name) {
  const tool = tools.find((item) => item.name === name);
  assert.ok(tool, `Expected tool "${name}" to be registered in tools/list`);
  assert.ok(
    tool.inputSchema && typeof tool.inputSchema === 'object',
    `Expected tool "${name}" to publish an inputSchema object`,
  );
  return tool;
}

function resolvePropKey(tool, allowedKeys, { required = true } = {}) {
  const props = tool.inputSchema?.properties ?? {};
  for (const key of allowedKeys) {
    if (Object.hasOwn(props, key)) {
      return key;
    }
  }
  if (required) {
    assert.fail(
      `Tool "${tool.name}" inputSchema.properties lacks any valid parameter from [${allowedKeys.join(', ')}]. Found: [${Object.keys(props).join(', ')}]`,
    );
  }
  return null;
}

function schemaSupportsType(schema, targetType) {
  if (!schema || typeof schema !== 'object') {
    return false;
  }
  if (schema.type === targetType) {
    return true;
  }
  if (Array.isArray(schema.type) && schema.type.includes(targetType)) {
    return true;
  }
  for (const key of ['anyOf', 'oneOf']) {
    if (
      Array.isArray(schema[key]) &&
      schema[key].some((branch) => schemaSupportsType(branch, targetType))
    ) {
      return true;
    }
  }
  return false;
}

function resolveSelectArg(tool, selectKey, fields) {
  const propSchema = tool.inputSchema?.properties?.[selectKey];
  if (schemaSupportsType(propSchema, 'array')) {
    return fields;
  }
  if (schemaSupportsType(propSchema, 'string')) {
    return fields.join(',');
  }
  return fields;
}

function schemaAllowsNull(propSchema) {
  return schemaSupportsType(propSchema, 'null');
}

function parseMajorMinor(versionStr) {
  const match = /^(\d+)\.(\d+)/.exec(String(versionStr ?? ''));
  assert.ok(match, `Invalid api-version format: ${JSON.stringify(versionStr)}`);
  return [Number.parseInt(match[1], 10), Number.parseInt(match[2], 10)];
}

function isVersionLte(actual, maxVersion) {
  const [aMaj, aMin] = parseMajorMinor(actual);
  const [mMaj, mMin] = parseMajorMinor(maxVersion);
  return aMaj < mMaj || (aMaj === mMaj && aMin <= mMin);
}

describe('Tier 1 — Area 10: MCP Events Primitive — SEP-3415, Resource Subscriptions, Webhooks & Polling (F24, F25)', () => {
  it('T8.1 [F24, F25] initialize advertises resources.subscribe & events extension; events/list & resources/templates/list expose all 5 canonical events & 4 URI templates', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    const init = await client.initialize();
    assert.equal(
      init.capabilities?.resources?.subscribe,
      true,
      `Expected capabilities.resources.subscribe === true, got ${JSON.stringify(init.capabilities)}`,
    );
    const eventsExt =
      init.capabilities?.extensions?.['io.modelcontextprotocol/events'];
    assert.ok(
      eventsExt && typeof eventsExt === 'object',
      `Expected capabilities.extensions['io.modelcontextprotocol/events'] object, got ${JSON.stringify(init.capabilities)}`,
    );

    const evList = await client.request('events/list', {});
    assert.equal(evList.resultType, 'complete');
    assert.ok(
      Array.isArray(evList.events),
      'Expected events/list events array',
    );
    const names = evList.events.map((e) => e.name).sort();
    assert.deepEqual(names, CANONICAL_EVENT_NAMES);

    for (const evDef of evList.events) {
      assert.ok(
        Array.isArray(evDef.delivery) &&
          evDef.delivery.includes('poll') &&
          evDef.delivery.includes('push') &&
          !evDef.delivery.includes('webhook'),
        `Expected event "${evDef.name}" delivery to include poll & push (not webhook), got ${JSON.stringify(evDef.delivery)}`,
      );
      assert.ok(
        evDef.inputSchema && typeof evDef.inputSchema === 'object',
        `Expected event "${evDef.name}" inputSchema`,
      );
      assert.ok(
        evDef.payloadSchema && typeof evDef.payloadSchema === 'object',
        `Expected event "${evDef.name}" payloadSchema`,
      );
    }

    const tpls = await client.listResourceTemplates();
    const uriTemplates = (tpls.resourceTemplates ?? []).map(
      (tpl) => tpl.uriTemplate,
    );
    for (const [label, pattern] of [
      [
        'pull-requests',
        /^ado:\/\/\{[^}]+\}\/\{[^}]+\}\/events\/pull-requests\/\{(?:prId|pullRequestId)\}$/,
      ],
      [
        'pipelines',
        /^ado:\/\/\{[^}]+\}\/\{[^}]+\}\/events\/pipelines\/\{(?:runId|buildId)\}$/,
      ],
      [
        'work-items',
        /^ado:\/\/\{[^}]+\}\/\{[^}]+\}\/events\/work-items\/\{(?:workItemId|id)\}$/,
      ],
      ['feed', /^ado:\/\/\{[^}]+\}\/\{[^}]+\}\/events\/feed$/],
    ]) {
      assert.ok(
        uriTemplates.some((u) => pattern.test(u)),
        `Expected ado:// resource template for "${label}", got ${JSON.stringify(uriTemplates)}`,
      );
    }
    client.assertCleanStdout();
  });

  it('T8.2 [F24, F25] SEP-3415 events/poll cursor bootstrap (cursor: null) and incremental delivery after POST /webhooks/ado (git.push)', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const secret = 'e2e-wh-secret';
    const srv = await startHttpMcpServer({
      args: ['--webhook-secret', secret],
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => srv.close());

    const client = createHttpMcpClient(srv.baseUrl);
    addCleanup(() => client.close());

    await client.initialize();

    const boot = await client.request('events/poll', {
      name: 'ado.git.pushed',
      arguments: { projectId: 'DemoProject' },
      cursor: null,
    });
    assert.equal(boot.resultType, 'complete');
    assert.deepEqual(boot.events, []);
    assert.match(boot.cursor, CURSOR_RE);
    assert.equal(boot.truncated, false);
    assert.equal(boot.hasMore, false);
    assert.ok(
      typeof boot.nextPollMs === 'number' && boot.nextPollMs > 0,
      `Expected positive nextPollMs, got ${JSON.stringify(boot.nextPollMs)}`,
    );

    const wh = await client.postWebhook(GIT_PUSH_WEBHOOK, {
      'X-ADO-Webhook-Secret': secret,
    });
    assert.equal(wh.status, 200);

    const poll = await client.request('events/poll', {
      name: 'ado.git.pushed',
      arguments: { projectId: 'DemoProject' },
      cursor: boot.cursor,
    });
    assert.equal(poll.resultType, 'complete');
    assert.equal(poll.truncated, false);
    assert.equal(poll.hasMore, false);
    assert.ok(
      typeof poll.nextPollMs === 'number' && poll.nextPollMs > 0,
      `Expected positive nextPollMs on incremental poll, got ${JSON.stringify(poll.nextPollMs)}`,
    );
    assert.notEqual(poll.cursor, boot.cursor);
    assert.match(poll.cursor, CURSOR_RE);
    assert.equal(poll.events.length, 1);
    assert.equal(poll.events[0].name, 'ado.git.pushed');
    assert.ok(
      typeof poll.events[0].eventId === 'string' &&
        poll.events[0].eventId.length > 0,
      `Expected non-empty eventId on EventOccurrence, got ${JSON.stringify(poll.events[0])}`,
    );
    assert.ok(
      typeof poll.events[0].timestamp === 'string' &&
        !Number.isNaN(Date.parse(poll.events[0].timestamp)),
      `Expected valid ISO-8601 timestamp on EventOccurrence, got ${JSON.stringify(poll.events[0])}`,
    );
    assert.equal(poll.events[0].data?.project, 'DemoProject');
    assert.equal(poll.events[0].data?.repository, 'DemoRepo');
  });

  it('T8.3 [F24] POST /webhooks/ado accepts ADO Test event + Basic Auth and normalizes git.pullrequest.updated, build.complete, and workitem.updated', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const secret = 'basic-wh-secret';
    const basicAuth = `Basic ${Buffer.from(`:${secret}`).toString('base64')}`;

    const srv = await startHttpMcpServer({
      args: ['--webhook-secret', secret],
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => srv.close());

    const client = createHttpMcpClient(srv.baseUrl);
    addCleanup(() => client.close());

    await client.initialize();

    const prBoot = await client.request('events/poll', {
      name: 'ado.pull_request.updated',
      arguments: { projectId: 'DemoProject' },
      cursor: null,
    });
    const buildBoot = await client.request('events/poll', {
      name: 'ado.pipeline.run_state_changed',
      arguments: { projectId: 'DemoProject' },
      cursor: null,
    });
    const wiBoot = await client.request('events/poll', {
      name: 'ado.work_item.updated',
      arguments: { projectId: 'DemoProject' },
      cursor: null,
    });

    const testWh = await client.postWebhook(ADO_TEST_WEBHOOK, {
      Authorization: basicAuth,
    });
    assert.equal(testWh.status, 200, 'ADO Test webhook must return 200');

    const prWh = await client.postWebhook(PR_UPDATED_WEBHOOK, {
      Authorization: basicAuth,
    });
    assert.equal(prWh.status, 200);

    const buildWh = await client.postWebhook(BUILD_COMPLETE_WEBHOOK, {
      Authorization: basicAuth,
    });
    assert.equal(buildWh.status, 200);

    const wiWh = await client.postWebhook(WORKITEM_UPDATED_WEBHOOK, {
      Authorization: basicAuth,
    });
    assert.equal(wiWh.status, 200);

    const prPoll = await client.request('events/poll', {
      name: 'ado.pull_request.updated',
      arguments: { projectId: 'DemoProject' },
      cursor: prBoot.cursor,
    });
    assert.equal(prPoll.events.length, 1);
    assert.equal(prPoll.events[0].name, 'ado.pull_request.updated');
    assert.ok(
      typeof prPoll.events[0].eventId === 'string' &&
        prPoll.events[0].eventId.length > 0,
      `Expected non-empty eventId on prPoll event, got ${JSON.stringify(prPoll.events[0])}`,
    );
    assert.equal(prPoll.events[0].data?.pullRequestId, 42);

    const buildPoll = await client.request('events/poll', {
      name: 'ado.pipeline.run_state_changed',
      arguments: { projectId: 'DemoProject' },
      cursor: buildBoot.cursor,
    });
    assert.equal(buildPoll.events.length, 1);
    assert.equal(buildPoll.events[0].name, 'ado.pipeline.run_state_changed');
    assert.ok(
      typeof buildPoll.events[0].eventId === 'string' &&
        buildPoll.events[0].eventId.length > 0,
      `Expected non-empty eventId on buildPoll event, got ${JSON.stringify(buildPoll.events[0])}`,
    );
    assert.equal(buildPoll.events[0].data?.runId, 500);

    const wiPoll = await client.request('events/poll', {
      name: 'ado.work_item.updated',
      arguments: { projectId: 'DemoProject' },
      cursor: wiBoot.cursor,
    });
    assert.equal(wiPoll.events.length, 1);
    assert.equal(wiPoll.events[0].name, 'ado.work_item.updated');
    assert.ok(
      typeof wiPoll.events[0].eventId === 'string' &&
        wiPoll.events[0].eventId.length > 0,
      `Expected non-empty eventId on wiPoll event, got ${JSON.stringify(wiPoll.events[0])}`,
    );
    assert.equal(wiPoll.events[0].data?.workItemId, 101);
  });

  it(
    'T8.4 [F24, F25] SEP-3415 events/stream emits notifications/events/active, live notifications/events/event, and notifications/events/heartbeat all correlated via _meta subscriptionId',
    { timeout: 20_000 },
    async (t) => {
      const addCleanup = registerCleanup(t);
      const mockAdo = await createMockAdoServer({ profile: 'services' });
      addCleanup(() => mockAdo.close());

      const secret = 'stream-wh-secret';
      const srv = await startHttpMcpServer({
        args: ['--webhook-secret', secret],
        env: makeStandardEnv(mockAdo),
      });
      addCleanup(() => srv.close());

      const client = createHttpMcpClient(srv.baseUrl);
      addCleanup(() => client.close());

      await client.initialize();

      const stream = await client.openPostStream('events/stream', {
        name: 'ado.work_item.updated',
        arguments: { projectId: 'DemoProject' },
        cursor: null,
        heartbeatMs: 5000,
      });
      addCleanup(() => stream.close());
      assert.equal(stream.status, 200);

      const assertSubId = (notif, label) => {
        const subId =
          notif.json?.params?._meta?.['io.modelcontextprotocol/subscriptionId'];
        assert.ok(
          subId !== undefined && subId !== null,
          `Expected ${label} notification _meta['io.modelcontextprotocol/subscriptionId'], got ${JSON.stringify(notif.json?.params)}`,
        );
        assert.equal(
          String(subId),
          String(stream.requestId),
          `Expected ${label} notification _meta subscriptionId to match events/stream requestId`,
        );
      };

      const active = await stream.waitForEvent(
        (ev) => ev.json?.method === 'notifications/events/active',
        5000,
      );
      assertSubId(active, 'active');
      assert.match(active.json?.params?.cursor ?? '', CURSOR_RE);
      assert.equal(active.json?.params?.truncated, false);
      assert.ok(
        typeof active.json?.params?.heartbeatMs === 'number' &&
          active.json.params.heartbeatMs >= 5000,
        `Expected granted heartbeatMs >= 5000 on notifications/events/active, got ${JSON.stringify(active.json?.params?.heartbeatMs)}`,
      );

      const wh = await client.postWebhook(WORKITEM_UPDATED_WEBHOOK, {
        'X-ADO-Webhook-Secret': secret,
      });
      assert.equal(wh.status, 200);

      const pushed = await stream.waitForEvent(
        (ev) => ev.json?.method === 'notifications/events/event',
        5000,
      );
      assertSubId(pushed, 'event');
      const evParams = pushed.json?.params;
      assert.equal(
        evParams?.name,
        'ado.work_item.updated',
        `Expected flat SEP-3415 EventOccurrence in notifications/events/event params (no params.event wrapper), got ${JSON.stringify(evParams)}`,
      );
      assert.equal(evParams?.data?.workItemId, 101);
      assert.ok(
        typeof evParams?.eventId === 'string' && evParams.eventId.length > 0,
        `Expected non-empty eventId on notifications/events/event, got ${JSON.stringify(evParams)}`,
      );
      assert.ok(
        typeof evParams?.timestamp === 'string' &&
          !Number.isNaN(Date.parse(evParams.timestamp)),
        `Expected valid ISO-8601 timestamp on notifications/events/event, got ${JSON.stringify(evParams)}`,
      );
      assert.ok(
        evParams?.cursor === null ||
          (typeof evParams?.cursor === 'string' &&
            CURSOR_RE.test(evParams.cursor)),
        `Expected notifications/events/event cursor to match CURSOR_RE or be null, got ${JSON.stringify(evParams?.cursor)}`,
      );

      const heartbeat = await stream.waitForEvent(
        (ev) => ev.json?.method === 'notifications/events/heartbeat',
        10_000,
      );
      assertSubId(heartbeat, 'heartbeat');
      assert.ok(
        Object.hasOwn(heartbeat.json?.params ?? {}, 'cursor'),
        `Expected cursor property on notifications/events/heartbeat, got ${JSON.stringify(heartbeat.json?.params)}`,
      );
      const hbCursor = heartbeat.json.params.cursor;
      assert.ok(
        hbCursor === null ||
          (typeof hbCursor === 'string' && CURSOR_RE.test(hbCursor)),
        `Expected heartbeat cursor to match CURSOR_RE or be null, got ${JSON.stringify(hbCursor)}`,
      );
    },
  );

  it('T8.5 [F25] 2025-11-25 Resource Subscriptions (resources/subscribe -> notifications/resources/updated over GET SSE -> resources/read -> resources/unsubscribe)', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const secret = 'sub-wh-secret';
    const srv = await startHttpMcpServer({
      args: ['--webhook-secret', secret],
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => srv.close());

    const client = createHttpMcpClient(srv.baseUrl);
    addCleanup(() => client.close());

    await client.initialize();
    const sse = await client.openSseStream();
    addCleanup(() => sse.close());
    assert.equal(sse.status, 200);

    const uri = 'ado://DefaultCollection/DemoProject/events/feed';
    await client.subscribeResource(uri);

    const wh = await client.postWebhook(PR_UPDATED_WEBHOOK, {
      'X-ADO-Webhook-Secret': secret,
    });
    assert.equal(wh.status, 200);

    const notif = await sse.waitForEvent(
      (ev) => ev.json?.method === 'notifications/resources/updated',
      5000,
    );
    assert.equal(notif.json?.params?.uri, uri);

    const read = await client.readResource(uri);
    assert.ok(Array.isArray(read.contents) && read.contents.length > 0);
    assert.match(String(read.contents[0].mimeType ?? ''), /application\/json/i);
    const feed = JSON.parse(read.contents[0].text);
    assert.match(feed.cursor ?? '', CURSOR_RE);
    assert.equal(typeof feed.truncated, 'boolean');
    assert.ok(
      Array.isArray(feed.events) &&
        feed.events.some(
          (ev) =>
            ev.name === 'ado.pull_request.updated' &&
            ev.data?.pullRequestId === 42,
        ),
      `Expected PR 42 event in resource feed, got ${JSON.stringify(feed)}`,
    );

    await client.unsubscribeResource(uri);
  });

  it(
    'T8.6 [F24, F25] Bounded Polling Watcher detects Mock ADO work item revision change over stdio (zero webhooks) and emits notifications/resources/updated',
    { timeout: 45_000 },
    async (t) => {
      const addCleanup = registerCleanup(t);
      const mockAdo = await createMockAdoServer({ profile: 'services' });
      addCleanup(() => mockAdo.close());

      const client = createStdioMcpClient({
        args: ['--event-poll-interval', '10000'],
        env: makeStandardEnv(mockAdo),
      });
      addCleanup(() => client.close());

      await client.initialize();
      const uri = 'ado://DefaultCollection/DemoProject/events/work-items/101';
      await client.subscribeResource(uri);

      const isWi101Poll = (req) => {
        if (
          req.method === 'GET' &&
          /\/_apis\/wit\/workitems\/101(?:\/revisions)?$/i.test(req.relPath)
        ) {
          return true;
        }
        if (
          req.method === 'GET' &&
          /\/_apis\/wit\/workitems$/i.test(req.relPath)
        ) {
          const ids = String(req.query?.ids ?? '')
            .split(',')
            .map((s) => s.trim());
          return ids.includes('101');
        }
        if (
          req.method === 'POST' &&
          /\/_apis\/wit\/workitemsbatch$/i.test(req.relPath)
        ) {
          return (
            Array.isArray(req.parsedBody?.ids) &&
            req.parsedBody.ids.map(Number).includes(101)
          );
        }
        return false;
      };

      // Wait up to 13s for initial baseline poll against Mock ADO (handles both t=0 and 10s interval start)
      const deadline = Date.now() + 13_000;
      while (!mockAdo.requests.some(isWi101Poll) && Date.now() < deadline) {
        await delay(50);
      }
      assert.ok(
        mockAdo.requests.some(isWi101Poll),
        'Expected Bounded Polling Watcher to execute baseline WIT poll for work item 101',
      );

      mockAdo.mutateState((state) => {
        state.workItems[101].rev = 3;
        state.workItems[101].fields['System.State'] = 'Resolved';
        state.workItems[101].fields['System.ChangedDate'] =
          new Date().toISOString();
        if (Array.isArray(state.workItemRevisions[101])) {
          state.workItemRevisions[101].push(
            structuredClone(state.workItems[101]),
          );
        }
      });

      const notif = await client.waitForNotification(
        (msg) =>
          msg.method === 'notifications/resources/updated' &&
          msg.params?.uri === uri,
        18_000,
      );
      assert.equal(notif.params.uri, uri);

      const read = await client.readResource(uri);
      const feed = JSON.parse(read.contents[0].text);
      assert.ok(
        Array.isArray(feed.events) &&
          feed.events.some(
            (ev) =>
              ev.name === 'ado.work_item.updated' &&
              ev.data?.workItemId === 101 &&
              (ev.data?.rev === 3 || ev.data?.state === 'Resolved'),
          ),
        `Expected polled work item 101 update in resource feed, got: ${JSON.stringify(feed)}`,
      );

      await client.unsubscribeResource(uri);
      const pollCount = mockAdo.requests.filter(isWi101Poll).length;
      assert.ok(
        pollCount >= 2,
        `Expected >= 2 poll requests on work item 101, got ${pollCount}`,
      );
      client.assertCleanStdout();
    },
  );

  it('T8.7 [F25] Opt-in events read-only toolset (--toolsets events) exposes list_event_types and poll_events with Spotlighting and accurate ToolAnnotations', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const secret = 'ev-tool-secret';
    const srv = await startHttpMcpServer({
      args: ['--toolsets', 'events', '--webhook-secret', secret],
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => srv.close());

    const client = createHttpMcpClient(srv.baseUrl);
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      'list_event_types',
      'poll_events',
    ]);

    const listTool = requireTool(tools, 'list_event_types');
    const pollTool = requireTool(tools, 'poll_events');
    for (const tool of [listTool, pollTool]) {
      assert.equal(tool.annotations?.readOnlyHint, true);
      assert.equal(tool.annotations?.destructiveHint, false);
      assert.equal(tool.annotations?.idempotentHint, true);
    }
    assert.equal(
      listTool.annotations?.openWorldHint,
      false,
      'list_event_types reads static local catalog and must have openWorldHint === false',
    );

    const typesRes = await client.callTool('list_event_types', {});
    const typesData = unwrapToolResultJson(typesRes, {
      expectSpotlighted: true,
    });
    const typesStr = JSON.stringify(typesData);
    for (const evName of CANONICAL_EVENT_NAMES) {
      assert.ok(
        typesStr.includes(evName),
        `Expected list_event_types to include "${evName}"`,
      );
    }

    const nameKey = resolvePropKey(pollTool, [
      'name',
      'eventName',
      'eventType',
    ]);
    const cursorKey = resolvePropKey(pollTool, ['cursor']);
    const cursorSchema = pollTool.inputSchema?.properties?.[cursorKey];
    const bootArgs = {
      [nameKey]: 'ado.pipeline.run_state_changed',
      ...(schemaAllowsNull(cursorSchema) ? { [cursorKey]: null } : {}),
    };
    const bootRes = await client.callTool('poll_events', bootArgs);
    const boot = unwrapToolResultJson(bootRes, { expectSpotlighted: true });
    assert.match(boot.cursor ?? '', CURSOR_RE);
    assert.deepEqual(boot.events, []);

    const wh = await client.postWebhook(BUILD_COMPLETE_WEBHOOK, {
      'X-ADO-Webhook-Secret': secret,
    });
    assert.equal(wh.status, 200);

    const pollRes = await client.callTool('poll_events', {
      [nameKey]: 'ado.pipeline.run_state_changed',
      [cursorKey]: boot.cursor,
    });
    const polled = unwrapToolResultJson(pollRes, { expectSpotlighted: true });
    assert.ok(
      Array.isArray(polled.events) &&
        polled.events.some(
          (ev) =>
            ev.name === 'ado.pipeline.run_state_changed' &&
            ev.data?.runId === 500,
        ),
      `Expected build 500 event in poll_events tool response, got: ${JSON.stringify(polled)}`,
    );
  });
});

describe('Tier 1 — Area 11: On-Prem api-version Compatibility Matrix & Direct-HTTP Resilience (F26)', () => {
  it('T8.8 [F26] Checked-in server profiles, matrix test suite, and updated azure-devops-rest-api-research.md (Server 2019/2020/2022 + OData matrix) exist', () => {
    const profilesDirRel = 'tests/fixtures/ado-server-profiles';
    assert.equal(
      repoFileExists(profilesDirRel),
      true,
      `Expected directory "${profilesDirRel}" to exist`,
    );
    const profileFiles = fs
      .readdirSync(repoPath(profilesDirRel))
      .filter((f) => f.endsWith('.json'));
    assert.ok(
      profileFiles.length >= 4,
      `Expected >= 4 checked-in JSON server profiles in ${profilesDirRel}, found: [${profileFiles.join(', ')}]`,
    );
    for (const fileName of profileFiles) {
      const parsed = readRepoJson(path.join(profilesDirRel, fileName));
      assert.ok(
        parsed &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          Object.keys(parsed).length > 0,
        `Expected non-empty JSON object in ${fileName}`,
      );
    }
    const loweredNames = profileFiles.map((f) => f.toLowerCase());
    assert.ok(
      loweredNames.some((f) => f.includes('2019')),
      'Expected server-2019 profile JSON',
    );
    assert.ok(
      loweredNames.some((f) => f.includes('2020')),
      'Expected server-2020 profile JSON',
    );
    assert.ok(
      loweredNames.some((f) => f.includes('2022')),
      'Expected server-2022 profile JSON',
    );
    assert.ok(
      loweredNames.some((f) => f.includes('service') || f.includes('cloud')),
      'Expected services/cloud profile JSON',
    );

    const matrixDirRel = 'tests/matrix';
    assert.equal(
      repoFileExists(matrixDirRel),
      true,
      `Expected compatibility matrix directory "${matrixDirRel}" to exist`,
    );
    const matrixEntries = fs
      .readdirSync(repoPath(matrixDirRel))
      .filter((f) => /\.(test|spec)\.(ts|mts|js|mjs)$/i.test(f));
    assert.ok(
      matrixEntries.length >= 1,
      `Expected >= 1 compatibility matrix test file in ${matrixDirRel}`,
    );
    for (const entryName of matrixEntries) {
      const matrixContent = readRepoFile(path.join(matrixDirRel, entryName));
      assert.match(
        matrixContent,
        /from\s+['"]node:test['"]/,
        `Expected ${entryName} to use native node:test`,
      );
    }

    const researchDoc = readRepoFile(
      'docs/important-knowledge/azure-devops-rest-api-research.md',
    );
    for (const serverYear of ['2019', '2020', '2022']) {
      assert.ok(
        researchDoc.includes(serverYear),
        `Expected azure-devops-rest-api-research.md to document Server ${serverYear}`,
      );
    }
    for (const ver of ['5.0', '6.0', '7.0', '7.1']) {
      assert.ok(
        researchDoc.includes(ver),
        `Expected azure-devops-rest-api-research.md to document api-version ${ver}`,
      );
    }
    assert.match(
      researchDoc,
      /\bodata\b/i,
      'Expected azure-devops-rest-api-research.md to document OData',
    );
    assert.match(
      researchDoc,
      /\banalytics\b/i,
      'Expected azure-devops-rest-api-research.md to document Analytics',
    );
    assert.match(
      researchDoc,
      /\bv[1-4]\.0(?:-preview)?\b/i,
      'Expected azure-devops-rest-api-research.md to document OData versions (e.g. v1.0-v4.0-preview)',
    );
  });

  it(
    'T8.9 [F26] Direct-HTTP Search (search_code) resolves per-area preview/GA api-version across ALL 4 profiles without Cloud almsearch host leakage',
    { timeout: 45_000 },
    async () => {
      const matrix = [
        { profile: 'server-2019-rtm', expectedApiVersion: '5.0-preview.1' },
        { profile: 'server-2020', expectedApiVersion: '6.0-preview.1' },
        { profile: 'server-2022', expectedApiVersion: '7.0' },
        { profile: 'services', expectedApiVersion: '7.1' },
      ];

      for (const entry of matrix) {
        const prof = getProfile(entry.profile);
        const mockAdo = await createMockAdoServer({ profile: entry.profile });
        let client = null;
        try {
          client = createStdioMcpClient({
            env: makeStandardEnv(mockAdo, {
              AZURE_DEVOPS_API_VERSION: prof.maxApiVersion,
            }),
          });
          await client.initialize();
          const res = await client.callTool('search_code', {
            projectId: 'DemoProject',
            searchText: 'greet',
          });
          const data = unwrapToolResultJson(res, { expectSpotlighted: true });
          assert.ok(
            Array.isArray(data?.results) &&
              data.results.some((r) => r.path === '/src/app.ts'),
            `Expected /src/app.ts hit in search results on profile ${entry.profile}, got ${JSON.stringify(data)}`,
          );

          const searchReq = mockAdo.requests.find(
            (req) =>
              req.method === 'POST' &&
              /\/_apis\/search\/codesearchresults$/i.test(req.relPath),
          );
          assert.ok(
            searchReq,
            `Expected POST codesearchresults on loopback mock for ${entry.profile}`,
          );
          assert.equal(
            searchReq.apiVersion,
            entry.expectedApiVersion,
            `Profile ${entry.profile}: expected search apiVersion ${entry.expectedApiVersion}, got ${JSON.stringify(searchReq.apiVersion)}`,
          );
        } finally {
          try {
            if (client) {
              await client.close();
            }
          } finally {
            await mockAdo.close();
          }
        }
      }
    },
  );

  it(
    'T8.10 [F26] Direct-HTTP Pipelines (list_pipeline_runs, pipeline_timeline, get_pipeline_log) resolve per-area versions across Server 2019/2020/2022 & Services',
    { timeout: 45_000 },
    async () => {
      // Server 2020, Server 2022, Services: pipelines + build timeline + logs
      const fullProfiles = [
        {
          profile: 'server-2020',
          pipelinesVer: '6.0-preview.1',
          buildVer: '6.0',
        },
        { profile: 'server-2022', pipelinesVer: '7.0', buildVer: '7.0' },
        { profile: 'services', pipelinesVer: '7.1', buildVer: '7.1' },
      ];

      for (const entry of fullProfiles) {
        const prof = getProfile(entry.profile);
        const mockAdo = await createMockAdoServer({ profile: entry.profile });
        let client = null;
        try {
          client = createStdioMcpClient({
            env: makeStandardEnv(mockAdo, {
              AZURE_DEVOPS_API_VERSION: prof.maxApiVersion,
            }),
          });
          await client.initialize();

          const runsRes = await client.callTool('list_pipeline_runs', {
            projectId: 'DemoProject',
            pipelineId: 10,
          });
          const runsData = unwrapToolResultJson(runsRes, {
            expectSpotlighted: true,
          });
          const runsList = Array.isArray(runsData)
            ? runsData
            : (runsData?.runs ?? runsData?.value);
          assert.ok(
            Array.isArray(runsList) &&
              runsList.some((r) => r.id === 500 && r.name === '20261125.1'),
            `Expected pipeline run 500 (20261125.1) on ${entry.profile}, got: ${JSON.stringify(runsData)}`,
          );

          const tlRes = await client.callTool('pipeline_timeline', {
            projectId: 'DemoProject',
            runId: 500,
          });
          const tlData = unwrapToolResultJson(tlRes, {
            expectSpotlighted: true,
          });
          assert.ok(
            Array.isArray(tlData?.records) &&
              tlData.records.some(
                (rec) => rec.identifier === 'Test' && rec.name === 'Test Stage',
              ),
            `Expected timeline record Test / Test Stage on ${entry.profile}, got: ${JSON.stringify(tlData)}`,
          );

          const logRes = await client.callTool('get_pipeline_log', {
            projectId: 'DemoProject',
            runId: 500,
            logId: 1,
          });
          assert.ok(
            unwrapToolResultText(logRes, {
              expectSpotlighted: true,
            }).text.includes('Auth.TokenSpec.shouldHandleExpiredToken'),
          );

          const pipeReq = mockAdo.requests.find(
            (req) =>
              req.method === 'GET' &&
              /^\/DemoProject\/_apis\/pipelines\/10\/runs$/i.test(req.relPath),
          );
          assert.ok(pipeReq, `Expected pipelines/10/runs on ${entry.profile}`);
          assert.equal(pipeReq.apiVersion, entry.pipelinesVer);

          const tlReq = mockAdo.requests.find(
            (req) =>
              req.method === 'GET' &&
              /^\/DemoProject\/_apis\/build\/builds\/500\/timeline$/i.test(
                req.relPath,
              ),
          );
          assert.ok(tlReq, `Expected build timeline on ${entry.profile}`);
          assert.equal(tlReq.apiVersion, entry.buildVer);

          const logReq = mockAdo.requests.find(
            (req) =>
              req.method === 'GET' &&
              /^\/DemoProject\/_apis\/build\/builds\/500\/logs\/1$/i.test(
                req.relPath,
              ),
          );
          assert.ok(logReq, `Expected build log 1 on ${entry.profile}`);
          assert.equal(logReq.apiVersion, entry.buildVer);
        } finally {
          try {
            if (client) {
              await client.close();
            }
          } finally {
            await mockAdo.close();
          }
        }
      }

      // Server 2019 RTM (5.0): classic Build timeline + logs
      const mock2019 = await createMockAdoServer({
        profile: 'server-2019-rtm',
      });
      let client2019 = null;
      try {
        client2019 = createStdioMcpClient({
          env: makeStandardEnv(mock2019, { AZURE_DEVOPS_API_VERSION: '5.0' }),
        });
        await client2019.initialize();

        const tlRes = await client2019.callTool('pipeline_timeline', {
          projectId: 'DemoProject',
          runId: 500,
        });
        const tlData = unwrapToolResultJson(tlRes, { expectSpotlighted: true });
        assert.ok(
          Array.isArray(tlData?.records) &&
            tlData.records.some(
              (rec) => rec.identifier === 'Test' && rec.name === 'Test Stage',
            ),
          `Expected timeline record Test / Test Stage on server-2019-rtm, got: ${JSON.stringify(tlData)}`,
        );

        const logRes = await client2019.callTool('get_pipeline_log', {
          projectId: 'DemoProject',
          runId: 500,
          logId: 1,
        });
        assert.ok(
          unwrapToolResultText(logRes, {
            expectSpotlighted: true,
          }).text.includes('Auth.TokenSpec.shouldHandleExpiredToken'),
        );

        const tlReq = mock2019.requests.find(
          (req) =>
            req.method === 'GET' &&
            /^\/DemoProject\/_apis\/build\/builds\/500\/timeline$/i.test(
              req.relPath,
            ),
        );
        const logReq = mock2019.requests.find(
          (req) =>
            req.method === 'GET' &&
            /^\/DemoProject\/_apis\/build\/builds\/500\/logs\/1$/i.test(
              req.relPath,
            ),
        );
        assert.ok(tlReq, 'Expected build timeline GET on server-2019-rtm');
        assert.equal(tlReq.apiVersion, '5.0');
        assert.ok(logReq, 'Expected build log 1 GET on server-2019-rtm');
        assert.equal(logReq.apiVersion, '5.0');
      } finally {
        try {
          if (client2019) {
            await client2019.close();
          }
        } finally {
          await mock2019.close();
        }
      }
    },
  );

  it(
    'T8.11 [F26] Direct-HTTP Wikis (get_wikis, get_wiki_page, list_wiki_pages pagesbatch) resolve per-area versions across Server 2019/2020/2022 & Services',
    { timeout: 45_000 },
    async () => {
      const fullProfiles = [
        { profile: 'server-2020', pagesBatchVer: '6.0-preview.1' },
        { profile: 'server-2022', pagesBatchVer: '7.0' },
        { profile: 'services', pagesBatchVer: '7.1' },
      ];

      for (const entry of fullProfiles) {
        const prof = getProfile(entry.profile);
        const mockAdo = await createMockAdoServer({ profile: entry.profile });
        let client = null;
        try {
          client = createStdioMcpClient({
            env: makeStandardEnv(mockAdo, {
              AZURE_DEVOPS_API_VERSION: prof.maxApiVersion,
            }),
          });
          await client.initialize();

          const wikisRes = await client.callTool('get_wikis', {
            projectId: 'DemoProject',
          });
          assert.ok(
            JSON.stringify(
              unwrapToolResultJson(wikisRes, { expectSpotlighted: true }),
            ).includes('DemoProject.wiki'),
          );

          const pageRes = await client.callTool('get_wiki_page', {
            projectId: 'DemoProject',
            wikiId: 'DemoProject.wiki',
            pagePath: '/Home',
          });
          assert.ok(
            unwrapToolResultText(pageRes, {
              expectSpotlighted: true,
            }).text.includes('# Demo Wiki'),
          );

          const listRes = await client.callTool('list_wiki_pages', {
            projectId: 'DemoProject',
            wikiId: 'DemoProject.wiki',
          });
          const listStr = JSON.stringify(
            unwrapToolResultJson(listRes, { expectSpotlighted: true }),
          );
          assert.ok(listStr.includes('/Home'));
          assert.ok(listStr.includes('/Architecture'));

          const wikisReq = mockAdo.requests.find(
            (req) =>
              req.method === 'GET' &&
              /^\/DemoProject\/_apis\/wiki\/wikis$/i.test(req.relPath),
          );
          assert.ok(
            wikisReq,
            `Expected GET /DemoProject/_apis/wiki/wikis on ${entry.profile}`,
          );
          assert.equal(wikisReq.apiVersion, prof.maxApiVersion);

          const pageReq = mockAdo.requests.find(
            (req) =>
              req.method === 'GET' &&
              /^\/DemoProject\/_apis\/wiki\/wikis\/[^/]+\/pages$/i.test(
                req.relPath,
              ),
          );
          assert.ok(pageReq, `Expected GET wiki page on ${entry.profile}`);
          assert.equal(pageReq.apiVersion, prof.maxApiVersion);

          const batchReq = mockAdo.requests.find(
            (req) =>
              req.method === 'POST' &&
              /\/_apis\/wiki\/wikis\/.+\/pagesbatch$/i.test(req.relPath),
          );
          assert.ok(
            batchReq,
            `Expected POST pagesbatch on profile ${entry.profile}`,
          );
          assert.equal(batchReq.apiVersion, entry.pagesBatchVer);
        } finally {
          try {
            if (client) {
              await client.close();
            }
          } finally {
            await mockAdo.close();
          }
        }
      }

      // Server 2019 RTM (5.0): get_wikis & get_wiki_page
      const mock2019 = await createMockAdoServer({
        profile: 'server-2019-rtm',
      });
      let client2019 = null;
      try {
        client2019 = createStdioMcpClient({
          env: makeStandardEnv(mock2019, { AZURE_DEVOPS_API_VERSION: '5.0' }),
        });
        await client2019.initialize();

        const wikisRes = await client2019.callTool('get_wikis', {
          projectId: 'DemoProject',
        });
        assert.ok(
          JSON.stringify(
            unwrapToolResultJson(wikisRes, { expectSpotlighted: true }),
          ).includes('DemoProject.wiki'),
        );

        const pageRes = await client2019.callTool('get_wiki_page', {
          projectId: 'DemoProject',
          wikiId: 'DemoProject.wiki',
          pagePath: '/Home',
        });
        assert.ok(
          unwrapToolResultText(pageRes, {
            expectSpotlighted: true,
          }).text.includes('# Demo Wiki'),
        );

        const wikisReq = mock2019.requests.find(
          (req) =>
            req.method === 'GET' &&
            /^\/DemoProject\/_apis\/wiki\/wikis$/i.test(req.relPath),
        );
        assert.ok(
          wikisReq,
          'Expected GET /DemoProject/_apis/wiki/wikis on server-2019-rtm',
        );
        assert.equal(
          wikisReq.apiVersion,
          '5.0',
          `Expected wiki list apiVersion 5.0 on server-2019-rtm, got ${JSON.stringify(wikisReq.apiVersion)}`,
        );

        const pageReq = mock2019.requests.find(
          (req) =>
            req.method === 'GET' &&
            /^\/DemoProject\/_apis\/wiki\/wikis\/[^/]+\/pages$/i.test(
              req.relPath,
            ),
        );
        assert.ok(
          pageReq,
          'Expected GET /DemoProject/_apis/wiki/wikis/.../pages on server-2019-rtm',
        );
        assert.equal(
          pageReq.apiVersion,
          '5.0',
          `Expected wiki page apiVersion 5.0 on server-2019-rtm, got ${JSON.stringify(pageReq.apiVersion)}`,
        );
      } finally {
        try {
          if (client2019) {
            await client2019.close();
          }
        } finally {
          await mock2019.close();
        }
      }
    },
  );

  it(
    'T8.12 [F26] SDK VsoClient auto-negotiates across ALL 4 profiles WITHOUT manual AZURE_DEVOPS_API_VERSION override',
    { timeout: 45_000 },
    async () => {
      const profiles = [
        'server-2019-rtm',
        'server-2020',
        'server-2022',
        'services',
      ];

      for (const profileName of profiles) {
        const prof = getProfile(profileName);
        const mockAdo = await createMockAdoServer({ profile: profileName });
        let client = null;
        try {
          // Deliberately omit AZURE_DEVOPS_API_VERSION to prove automatic OPTIONS negotiation
          client = createStdioMcpClient({
            env: makeStandardEnv(mockAdo, {
              AZURE_DEVOPS_API_VERSION: undefined,
            }),
          });
          await client.initialize();
          const { tools } = await client.listTools();

          const revTool = requireTool(tools, 'get_work_item_revisions');
          const revWiKey = resolvePropKey(revTool, ['workItemId', 'id']);
          const revProjKey = resolvePropKey(revTool, ['projectId', 'project'], {
            required: false,
          });
          const testTool = requireTool(tools, 'get_build_test_results');
          const testRunKey = resolvePropKey(testTool, ['runId', 'buildId']);

          const projRes = await client.callTool('list_projects', {});
          assert.ok(
            JSON.stringify(
              unwrapToolResultJson(projRes, { expectSpotlighted: true }),
            ).includes('DemoProject'),
            `list_projects failed on ${profileName}`,
          );

          const wiRes = await client.callTool('get_work_item', {
            workItemId: 101,
          });
          assert.equal(
            unwrapToolResultJson(wiRes, { expectSpotlighted: true }).id,
            101,
          );

          const revRes = await client.callTool('get_work_item_revisions', {
            ...(revProjKey ? { [revProjKey]: 'DemoProject' } : {}),
            [revWiKey]: 101,
          });
          assert.ok(
            JSON.stringify(
              unwrapToolResultJson(revRes, { expectSpotlighted: true }),
            ).includes('Implement OData Analytics'),
          );

          const brRes = await client.callTool('list_branches', {
            projectId: 'DemoProject',
            repositoryId: 'DemoRepo',
          });
          assert.ok(
            JSON.stringify(
              unwrapToolResultJson(brRes, { expectSpotlighted: true }),
            ).includes('feature/analytics'),
          );

          const iterRes = await client.callTool('list_iterations', {
            projectId: 'DemoProject',
          });
          assert.ok(
            JSON.stringify(
              unwrapToolResultJson(iterRes, { expectSpotlighted: true }),
            ).includes('Sprint 2'),
          );

          const trRes = await client.callTool('get_build_test_results', {
            projectId: 'DemoProject',
            [testRunKey]: 500,
          });
          assert.ok(
            JSON.stringify(
              unwrapToolResultJson(trRes, { expectSpotlighted: true }),
            ).includes('Auth.TokenSpec.shouldHandleExpiredToken'),
          );

          assert.ok(
            mockAdo.requests.some((req) => req.method === 'OPTIONS'),
            `Expected VsoClient OPTIONS negotiation calls on ${profileName}`,
          );

          const maxAllowed =
            profileName === 'services' ? '7.2' : prof.maxApiVersion;
          const versionedReqs = mockAdo.requests.filter(
            (req) => req.apiVersion,
          );
          assert.ok(
            versionedReqs.length >= 6,
            `Expected >= 6 api-versioned requests on ${profileName}, got ${versionedReqs.length}`,
          );
          for (const req of versionedReqs) {
            assert.equal(
              isVersionLte(req.apiVersion, maxAllowed),
              true,
              `Profile ${profileName} sent api-version ${req.apiVersion} exceeding max ${maxAllowed} on ${req.method} ${req.relPath}`,
            );
          }
        } finally {
          try {
            if (client) {
              await client.close();
            }
          } finally {
            await mockAdo.close();
          }
        }
      }
    },
  );

  it('T8.13 [F26] Non-/tfs On-Prem Collection URL (http://127.0.0.1:{port}/DefaultCollection) routes REST and OData cleanly on Server 2022', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({
      profile: 'server-2022',
      collectionPath: '/DefaultCollection',
    });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      env: makeStandardEnv(mockAdo, { AZURE_DEVOPS_API_VERSION: '7.0' }),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const analyticsTool = requireTool(tools, 'query_analytics');
    const selectKey = resolvePropKey(analyticsTool, ['select']);

    const projRes = await client.callTool('list_projects', {});
    assert.ok(
      JSON.stringify(
        unwrapToolResultJson(projRes, { expectSpotlighted: true }),
      ).includes('DemoProject'),
    );

    const searchRes = await client.callTool('search_code', {
      projectId: 'DemoProject',
      searchText: 'greet',
    });
    assert.ok(
      JSON.stringify(
        unwrapToolResultJson(searchRes, { expectSpotlighted: true }),
      ).includes('/src/app.ts'),
    );

    const wikisRes = await client.callTool('get_wikis', {
      projectId: 'DemoProject',
    });
    assert.ok(
      JSON.stringify(
        unwrapToolResultJson(wikisRes, { expectSpotlighted: true }),
      ).includes('DemoProject.wiki'),
    );

    const odataRes = await client.callTool('query_analytics', {
      projectId: 'DemoProject',
      entitySet: 'WorkItems',
      [selectKey]: resolveSelectArg(analyticsTool, selectKey, [
        'WorkItemId',
        'Title',
      ]),
      top: 5,
    });
    assert.ok(
      JSON.stringify(
        unwrapToolResultJson(odataRes, { expectSpotlighted: true }),
      ).includes('Implement OData Analytics'),
    );

    assert.ok(
      mockAdo.requests.length > 0,
      'Expected recorded requests against /DefaultCollection mock server',
    );
    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'POST' &&
          /^\/DefaultCollection\/DemoProject\/_apis\/search\/codesearchresults$/i.test(
            req.pathname,
          ),
      ),
      'Expected direct-HTTP search request under /DefaultCollection/DemoProject/_apis/search/codesearchresults',
    );
    assert.ok(
      mockAdo.requests.some((req) =>
        /^\/DefaultCollection\/DemoProject\/_odata\/[^/]+\/WorkItems$/i.test(
          req.pathname,
        ),
      ),
      'Expected Analytics OData request under /DefaultCollection/DemoProject/_odata/.../WorkItems',
    );
    for (const req of mockAdo.requests) {
      assert.ok(
        req.pathname.startsWith('/DefaultCollection/'),
        `Expected every request pathname to start with "/DefaultCollection/" (zero /tfs/), got: ${req.pathname}`,
      );
      assert.equal(
        req.pathname.includes('/tfs/'),
        false,
        `Unexpected /tfs/ segment in non-/tfs collection URL request: ${req.pathname}`,
      );
    }
  });
});
