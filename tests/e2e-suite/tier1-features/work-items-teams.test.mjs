import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { unwrapToolResultJson } from '../harness/assertions.mjs';
import { createStdioMcpClient } from '../harness/mcp-stdio-client.mjs';
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

function flattenSchemaBranches(schema) {
  if (!schema || typeof schema !== 'object') {
    return [];
  }
  const branches = [schema];
  for (const key of ['anyOf', 'oneOf']) {
    if (Array.isArray(schema[key])) {
      for (const sub of schema[key]) {
        branches.push(...flattenSchemaBranches(sub));
      }
    }
  }
  return branches;
}

function branchHasType(branch, targetTypes) {
  if (!branch || typeof branch !== 'object') {
    return false;
  }
  if (typeof branch.type === 'string') {
    return targetTypes.includes(branch.type);
  }
  if (Array.isArray(branch.type)) {
    return branch.type.some((t) => targetTypes.includes(t));
  }
  return false;
}

function collectAllowedValues(propSchema) {
  if (!propSchema || typeof propSchema !== 'object') {
    return null;
  }
  const vals = [];
  for (const branch of flattenSchemaBranches(propSchema)) {
    if (Array.isArray(branch.enum)) {
      vals.push(...branch.enum);
    }
    if (Object.hasOwn(branch, 'const')) {
      vals.push(branch.const);
    }
  }
  return vals.length > 0 ? vals : null;
}

function resolveSchemaValueFromSchema(
  toolName,
  propKey,
  propSchema,
  candidates,
) {
  assert.ok(propSchema, `Tool "${toolName}" missing schema for "${propKey}"`);
  const allowed = collectAllowedValues(propSchema);
  if (allowed) {
    for (const candidate of candidates) {
      const exact = allowed.find(
        (v) =>
          v === candidate ||
          (typeof v === 'string' &&
            typeof candidate === 'string' &&
            v.toLowerCase() === candidate.toLowerCase()),
      );
      if (exact !== undefined) {
        return exact;
      }
    }
  }

  const unconstrained = flattenSchemaBranches(propSchema).filter(
    (b) => !Array.isArray(b.enum) && !Object.hasOwn(b, 'const'),
  );
  if (unconstrained.some((b) => branchHasType(b, ['number', 'integer']))) {
    const num = candidates.find((c) => typeof c === 'number');
    if (num !== undefined) {
      return num;
    }
  }
  if (unconstrained.some((b) => branchHasType(b, ['string']))) {
    const str = candidates.find((c) => typeof c === 'string');
    if (str !== undefined) {
      return str;
    }
  }

  if (allowed) {
    assert.fail(
      `Tool "${toolName}" property "${propKey}" enum [${allowed.join(', ')}] accepts none of [${candidates.join(', ')}]`,
    );
  }
  return candidates[0];
}

function resolveSchemaValue(tool, propKey, candidates) {
  return resolveSchemaValueFromSchema(
    tool.name,
    propKey,
    tool.inputSchema?.properties?.[propKey],
    candidates,
  );
}

function getQueryParamCI(query, name) {
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (k.toLowerCase() === target) {
      return v;
    }
  }
  return undefined;
}

function extractListItems(payload, preferredKeys = []) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === 'object') {
    for (const key of [...preferredKeys, 'value', 'items', 'data']) {
      if (Array.isArray(payload[key])) {
        return payload[key];
      }
    }
  }
  assert.fail(
    `Expected array or wrapped list payload, got: ${JSON.stringify(payload).slice(0, 300)}`,
  );
}

describe('Tier 1 — Area 4: Work Items, Comments, Revisions & Teams (F10, F11, F12)', () => {
  it('T3.1 [F10] add_work_item_comment posts Markdown comment on Services (>=7.1-preview.4) with ?format=markdown query param', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'add_work_item_comment');

    const wiKey = resolvePropKey(tool, ['workItemId', 'id']);
    const textKey = resolvePropKey(tool, ['text', 'comment', 'content']);
    const formatKey = resolvePropKey(tool, ['format', 'commentFormat']);
    const markdownVal = resolveSchemaValue(tool, formatKey, [
      'markdown',
      'Markdown',
    ]);

    const args = {
      [wiKey]: 101,
      [textKey]: '**Triage**: verified on Services',
      [formatKey]: markdownVal,
    };

    const res = await client.callTool('add_work_item_comment', args);
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });

    assert.ok(
      data && typeof data === 'object',
      'Expected object response from add_work_item_comment',
    );
    const commentObj =
      data.comment && typeof data.comment === 'object' ? data.comment : data;
    const serialized = JSON.stringify(data);
    assert.ok(
      serialized.includes('verified on Services'),
      `Expected created comment response to reflect posted text, got: ${serialized.slice(0, 300)}`,
    );
    const fmt = commentObj.format ?? commentObj.commentFormat;
    assert.ok(
      fmt === 0 ||
        (typeof fmt === 'string' && fmt.toLowerCase() === 'markdown'),
      `Expected created comment format to be "markdown" (or CommentFormat.Markdown = 0), got ${JSON.stringify(fmt)} in ${serialized.slice(0, 300)}`,
    );

    const postReq = mockAdo.requests.find(
      (req) =>
        req.method === 'POST' &&
        /^\/DemoProject\/_apis\/wit\/workitems\/101\/comments$/i.test(
          req.relPath,
        ),
    );
    assert.ok(
      postReq,
      'Expected POST /DemoProject/_apis/wit/workItems/101/comments on mock ADO server',
    );
    assert.match(
      String(postReq.apiVersion ?? ''),
      /^7\.[12]-preview\.4$/i,
      `Expected Services comment api-version >= 7.1-preview.4, got ${JSON.stringify(postReq.apiVersion)}`,
    );
    const qFormat = getQueryParamCI(postReq.query, 'format');
    assert.ok(
      qFormat !== undefined &&
        (qFormat.toLowerCase() === 'markdown' || qFormat === '0'),
      `Expected ?format=markdown (or 0) query param on Services, got ${JSON.stringify(postReq.query)}`,
    );
    assert.ok(
      typeof postReq.parsedBody?.text === 'string' &&
        postReq.parsedBody.text.includes('Triage'),
      `Expected parsedBody.text to contain posted comment, got ${JSON.stringify(postReq.parsedBody)}`,
    );
    assert.equal(
      postReq.parsedBody?.format,
      undefined,
      'Comment format must be passed in query string, NOT in JSON request body',
    );
    assert.equal(
      mockAdo.state.workItemComments[101].length,
      2,
      'Expected new comment appended to mockAdo.state.workItemComments[101]',
    );
    assert.equal(
      mockAdo.state.workItemComments[101][1].format,
      'markdown',
      'Expected persisted mock comment format to be "markdown"',
    );
  });

  it('T3.2 [F10] add_work_item_comment auto-resolves projectId from work item when both projectId and AZURE_DEVOPS_DEFAULT_PROJECT are omitted', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      env: makeStandardEnv(mockAdo, {
        AZURE_DEVOPS_DEFAULT_PROJECT: undefined,
      }),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'add_work_item_comment');

    const wiKey = resolvePropKey(tool, ['workItemId', 'id']);
    const textKey = resolvePropKey(tool, ['text', 'comment', 'content']);

    const res = await client.callTool('add_work_item_comment', {
      [wiKey]: 101,
      [textKey]: 'Auto-resolved project comment',
    });
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    assert.ok(
      JSON.stringify(data).includes('Auto-resolved project comment'),
      'Expected created comment text in response',
    );

    const getIdx = mockAdo.requests.findIndex(
      (req) =>
        req.method === 'GET' &&
        /\/_apis\/wit\/workitems\/101$/i.test(req.relPath),
    );
    const postIdx = mockAdo.requests.findIndex(
      (req) =>
        req.method === 'POST' &&
        /^\/DemoProject\/_apis\/wit\/workitems\/101\/comments$/i.test(
          req.relPath,
        ),
    );
    assert.ok(
      getIdx !== -1,
      'Expected GET /_apis/wit/workitems/101 to resolve work item project',
    );
    assert.ok(
      postIdx !== -1,
      'Expected POST /DemoProject/_apis/wit/workItems/101/comments after project resolution',
    );
    assert.ok(
      getIdx < postIdx,
      'Expected work item lookup GET to precede comment POST',
    );
    assert.equal(mockAdo.state.workItemComments[101].length, 2);
    assert.ok(
      mockAdo.state.workItemComments[101][1].text.includes(
        'Auto-resolved project comment',
      ),
      'Expected persisted mock comment text to match Auto-resolved project comment',
    );
  });

  it('T3.3 [F10] add_work_item_comment on server-2022 (7.0-preview.3, rv <= 3) succeeds cleanly WITHOUT sending unsupported format=markdown query param', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'server-2022' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      env: makeStandardEnv(mockAdo, { AZURE_DEVOPS_API_VERSION: '7.0' }),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'add_work_item_comment');

    const wiKey = resolvePropKey(tool, ['workItemId', 'id']);
    const textKey = resolvePropKey(tool, ['text', 'comment', 'content']);
    const formatKey = resolvePropKey(tool, ['format', 'commentFormat']);
    const markdownVal = resolveSchemaValue(tool, formatKey, [
      'markdown',
      'Markdown',
    ]);

    const args = {
      [wiKey]: 101,
      [textKey]: 'Server 2022 rv3 comment',
      [formatKey]: markdownVal,
    };

    const res = await client.callTool('add_work_item_comment', args);
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    assert.ok(
      JSON.stringify(data).includes('Server 2022 rv3 comment'),
      'Expected created comment text in Server 2022 response',
    );

    const postReq = mockAdo.requests.find(
      (req) =>
        req.method === 'POST' &&
        /^\/DemoProject\/_apis\/wit\/workitems\/101\/comments$/i.test(
          req.relPath,
        ),
    );
    assert.ok(
      postReq,
      'Expected POST /DemoProject/_apis/wit/workItems/101/comments on Server 2022',
    );
    assert.equal(
      postReq.apiVersion,
      '7.0-preview.3',
      `Expected negotiated api-version 7.0-preview.3 on Server 2022, got ${JSON.stringify(postReq.apiVersion)}`,
    );
    assert.equal(
      getQueryParamCI(postReq.query, 'format'),
      undefined,
      `Expected unsupported format query param to be omitted on Server 2022 (rv <= 3), got ${JSON.stringify(postReq.query)}`,
    );
    assert.equal(mockAdo.state.workItemComments[101].length, 2);
  });

  it('T3.4 [F10] add_work_item_comment falls back cleanly to PATCH /fields/System.History on server-2019-rtm (5.0)', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'server-2019-rtm' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      env: makeStandardEnv(mockAdo, { AZURE_DEVOPS_API_VERSION: '5.0' }),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'add_work_item_comment');

    const wiKey = resolvePropKey(tool, ['workItemId', 'id']);
    const textKey = resolvePropKey(tool, ['text', 'comment', 'content']);

    const commentText = 'Server 2019 history fallback comment';
    const res = await client.callTool('add_work_item_comment', {
      [wiKey]: 101,
      [textKey]: commentText,
    });
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    assert.ok(
      data && typeof data === 'object',
      'Expected structured response from Server 2019 fallback',
    );
    assert.ok(
      JSON.stringify(data).includes(commentText),
      `Expected Server 2019 fallback response to reflect comment text, got: ${JSON.stringify(data).slice(0, 300)}`,
    );

    const patchReq = mockAdo.requests.find(
      (req) =>
        req.method === 'PATCH' &&
        /\/_apis\/wit\/workitems\/101$/i.test(req.relPath),
    );
    assert.ok(
      patchReq,
      'Expected fallback PATCH /_apis/wit/workitems/101 on Server 2019 RTM',
    );
    assert.equal(
      patchReq.apiVersion,
      '5.0',
      `Expected apiVersion 5.0 on Server 2019 RTM PATCH, got ${JSON.stringify(patchReq.apiVersion)}`,
    );
    assert.ok(
      Array.isArray(patchReq.parsedBody),
      'Expected JSON Patch operations array in PATCH body',
    );
    const historyOp = patchReq.parsedBody.find(
      (op) =>
        op &&
        typeof op === 'object' &&
        String(op.path ?? '').toLowerCase() === '/fields/system.history',
    );
    assert.ok(
      historyOp && String(historyOp.value ?? '').includes(commentText),
      `Expected /fields/System.History patch op with comment text, got ${JSON.stringify(patchReq.parsedBody)}`,
    );
    assert.ok(
      String(
        mockAdo.state.workItems[101].fields['System.History'] ?? '',
      ).includes(commentText),
      'Expected mockAdo.state.workItems[101].fields["System.History"] to record comment text',
    );
    assert.equal(
      mockAdo.state.workItems[101].rev,
      3,
      'Expected work item 101 rev incremented to 3 by fallback PATCH',
    );
  });

  it('T3.5 [F11] get_work_item_revisions lists revision history with bounded default $top (<= 50) and passes explicit expand as $expand on the wire', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'get_work_item_revisions');

    const wiKey = resolvePropKey(tool, ['workItemId', 'id']);
    const expandKey = resolvePropKey(tool, ['expand']);

    // 1. Default list call — verifies bounded default $top <= 50 and seeded rev 1 + rev 2
    const defaultRes = await client.callTool('get_work_item_revisions', {
      [wiKey]: 101,
    });
    const defaultData = unwrapToolResultJson(defaultRes, {
      expectSpotlighted: true,
    });
    const revisions = extractListItems(defaultData, ['revisions']);
    assert.equal(revisions.length, 2, 'Expected 2 seeded revisions for WI 101');
    const rev1 = revisions.find((r) => r.rev === 1);
    const rev2 = revisions.find((r) => r.rev === 2);
    assert.ok(rev1, 'Expected revision 1 in response');
    assert.ok(rev2, 'Expected revision 2 in response');
    assert.equal(
      rev1.fields?.['System.Title'],
      'Implement OData Analytics (initial)',
    );
    assert.equal(rev1.fields?.['System.State'], 'New');
    assert.equal(rev2.fields?.['System.Title'], 'Implement OData Analytics');
    assert.equal(rev2.fields?.['System.State'], 'Active');

    const listReq = mockAdo.requests.find(
      (req) =>
        req.method === 'GET' &&
        /\/_apis\/wit\/workitems\/101\/revisions$/i.test(req.relPath),
    );
    assert.ok(listReq, 'Expected GET /_apis/wit/workitems/101/revisions');
    const defaultTopStr = getQueryParamCI(listReq.query, '$top');
    assert.ok(
      defaultTopStr !== undefined,
      `Expected explicit bounded default $top on wire, got query=${JSON.stringify(listReq.query)}`,
    );
    const defaultTop = Number.parseInt(defaultTopStr, 10);
    assert.ok(
      Number.isInteger(defaultTop) && defaultTop >= 1 && defaultTop <= 50,
      `Expected default $top to be bounded between 1 and 50, got ${defaultTopStr}`,
    );

    // 2. Explicit expand call — verifies $expand sent on the wire
    mockAdo.clearRequests();
    const expandRes = await client.callTool('get_work_item_revisions', {
      [wiKey]: 101,
      [expandKey]: resolveSchemaValue(tool, expandKey, [
        'relations',
        'Relations',
      ]),
    });
    const expandRevs = extractListItems(
      unwrapToolResultJson(expandRes, { expectSpotlighted: true }),
      ['revisions'],
    );
    assert.equal(
      expandRevs.length,
      2,
      'Expected 2 revisions returned when expand=relations is set',
    );

    const expandReq = mockAdo.requests.find(
      (req) =>
        req.method === 'GET' &&
        /\/_apis\/wit\/workitems\/101\/revisions$/i.test(req.relPath),
    );
    assert.ok(
      expandReq,
      'Expected second GET /_apis/wit/workitems/101/revisions with $expand',
    );
    const wireExpand = getQueryParamCI(expandReq.query, '$expand');
    assert.ok(
      wireExpand !== undefined &&
        (wireExpand.toLowerCase() === 'relations' || wireExpand === '1'),
      `Expected $expand=relations (or enum 1) on the wire, got query=${JSON.stringify(expandReq.query)}`,
    );
  });

  it('T3.6 [F11] get_work_item_revisions fetches a single specific revision (revisionNumber: 1)', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'get_work_item_revisions');

    const wiKey = resolvePropKey(tool, ['workItemId', 'id']);
    const revKey = resolvePropKey(tool, ['revisionNumber', 'revision']);

    const res = await client.callTool('get_work_item_revisions', {
      [wiKey]: 101,
      [revKey]: 1,
    });
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    let revObj;
    if (Array.isArray(data)) {
      assert.equal(
        data.length,
        1,
        `Expected single revision in array response, got length ${data.length}`,
      );
      revObj = data[0];
    } else if (Array.isArray(data?.revisions)) {
      assert.equal(
        data.revisions.length,
        1,
        `Expected single revision in data.revisions, got length ${data.revisions.length}`,
      );
      revObj = data.revisions[0];
    } else if (Array.isArray(data?.value)) {
      assert.equal(
        data.value.length,
        1,
        `Expected single revision in data.value, got length ${data.value.length}`,
      );
      revObj = data.value[0];
    } else if (data?.revision && typeof data.revision === 'object') {
      revObj = data.revision;
    } else {
      revObj = data;
    }

    assert.equal(revObj.rev, 1, 'Expected single revision 1');
    assert.equal(revObj.fields?.['System.State'], 'New');
    assert.equal(
      revObj.fields?.['System.Title'],
      'Implement OData Analytics (initial)',
    );
    assert.equal(
      JSON.stringify(data).includes('"Active"'),
      false,
      'Single revision 1 response must not include rev 2 Active state',
    );

    const singleReq = mockAdo.requests.find(
      (req) =>
        req.method === 'GET' &&
        /\/_apis\/wit\/workitems\/101\/revisions\/1$/i.test(req.relPath),
    );
    assert.ok(
      singleReq,
      'Expected GET /_apis/wit/workitems/101/revisions/1 on mock ADO server',
    );
  });

  it('T3.7 [F12] list_teams returns project-scoped teams and supports mine: true filter', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'list_teams');

    const projKey = resolvePropKey(tool, ['projectId', 'project']);
    const mineKey = resolvePropKey(tool, ['mine', 'mineOnly']);

    const allRes = await client.callTool('list_teams', {
      [projKey]: 'DemoProject',
    });
    const allTeams = extractListItems(
      unwrapToolResultJson(allRes, { expectSpotlighted: true }),
      ['teams'],
    );
    const allNames = allTeams
      .map((team) => String(team.name))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    assert.deepEqual(
      allNames,
      ['DemoProject Team', 'Platform Team'],
      'Expected DemoProject teams only (excluding OtherProject Team)',
    );

    const req1 = mockAdo.requests.find(
      (req) =>
        req.method === 'GET' &&
        /^\/_apis\/projects\/DemoProject\/teams$/i.test(req.relPath),
    );
    assert.ok(req1, 'Expected GET /_apis/projects/DemoProject/teams');
    assert.equal(
      getQueryParamCI(req1.query, '$expandIdentity'),
      undefined,
      'Expected $expandIdentity to be omitted when not requested',
    );

    mockAdo.clearRequests();
    const mineRes = await client.callTool('list_teams', {
      [projKey]: 'DemoProject',
      [mineKey]: true,
    });
    const mineTeams = extractListItems(
      unwrapToolResultJson(mineRes, { expectSpotlighted: true }),
      ['teams'],
    );
    assert.deepEqual(
      mineTeams.map((team) => team.name),
      ['DemoProject Team'],
      'Expected mine: true to return only DemoProject Team',
    );

    const req2 = mockAdo.requests.find(
      (req) =>
        req.method === 'GET' &&
        /^\/_apis\/projects\/DemoProject\/teams$/i.test(req.relPath),
    );
    assert.ok(req2, 'Expected second GET /_apis/projects/DemoProject/teams');
    assert.equal(
      String(getQueryParamCI(req2.query, '$mine') ?? '').toLowerCase(),
      'true',
      `Expected $mine=true query param on wire, got ${JSON.stringify(req2.query)}`,
    );
    assert.equal(
      getQueryParamCI(req2.query, '$expandIdentity'),
      undefined,
      'Expected $expandIdentity omitted when unset',
    );
  });

  it('T3.8 [F12] list_teams lists all org/collection teams via preview /_apis/teams AND works on server-2019-rtm (5.0) omitting $expandIdentity', async (t) => {
    const addCleanup = registerCleanup(t);

    // Part A: org/collection-wide teams on Services (no default project)
    const mockAdoServices = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdoServices.close());

    const servicesClient = createStdioMcpClient({
      env: makeStandardEnv(mockAdoServices, {
        AZURE_DEVOPS_DEFAULT_PROJECT: undefined,
      }),
    });
    addCleanup(() => servicesClient.close());

    await servicesClient.initialize();
    const { tools } = await servicesClient.listTools();
    const tool = requireTool(tools, 'list_teams');
    const allProjKey = resolvePropKey(
      tool,
      ['allProjects', 'includeAllProjects'],
      {
        required: false,
      },
    );
    const projKey = resolvePropKey(tool, ['projectId', 'project']);

    const orgArgs = allProjKey ? { [allProjKey]: true } : {};
    const orgRes = await servicesClient.callTool('list_teams', orgArgs);
    const orgTeams = extractListItems(
      unwrapToolResultJson(orgRes, { expectSpotlighted: true }),
      ['teams'],
    );
    assert.deepEqual(
      orgTeams
        .map((team) => String(team.name))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
      ['DemoProject Team', 'OtherProject Team', 'Platform Team'],
      'Expected all 3 teams across DemoProject and OtherProject',
    );

    const orgReq = mockAdoServices.requests.find(
      (req) => req.method === 'GET' && /^\/_apis\/teams$/i.test(req.relPath),
    );
    assert.ok(orgReq, 'Expected GET /_apis/teams for org-wide team listing');
    assert.match(
      String(orgReq.apiVersion ?? ''),
      /-preview/i,
      `Expected preview api-version on /_apis/teams, got ${JSON.stringify(orgReq.apiVersion)}`,
    );

    // Part B: Server 2019 RTM (5.0) — must omit $expandIdentity (2019 rejects it with 400!)
    const mockAdo2019 = await createMockAdoServer({
      profile: 'server-2019-rtm',
    });
    addCleanup(() => mockAdo2019.close());

    const client2019 = createStdioMcpClient({
      env: makeStandardEnv(mockAdo2019, { AZURE_DEVOPS_API_VERSION: '5.0' }),
    });
    addCleanup(() => client2019.close());

    await client2019.initialize();
    const res2019 = await client2019.callTool('list_teams', {
      [projKey]: 'DemoProject',
    });
    const teams2019 = extractListItems(
      unwrapToolResultJson(res2019, { expectSpotlighted: true }),
      ['teams'],
    );
    assert.deepEqual(
      teams2019
        .map((team) => String(team.name))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
      ['DemoProject Team', 'Platform Team'],
    );

    const req2019 = mockAdo2019.requests.find(
      (req) =>
        req.method === 'GET' &&
        /^\/_apis\/projects\/DemoProject\/teams$/i.test(req.relPath),
    );
    assert.ok(
      req2019,
      'Expected GET /_apis/projects/DemoProject/teams on 2019',
    );
    assert.equal(req2019.apiVersion, '5.0');
    assert.equal(
      getQueryParamCI(req2019.query, '$expandIdentity'),
      undefined,
      'Expected Server 2019 RTM request to omit $expandIdentity',
    );
  });
});
