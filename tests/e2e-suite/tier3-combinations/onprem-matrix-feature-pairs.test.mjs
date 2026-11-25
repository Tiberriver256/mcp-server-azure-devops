import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

import {
  repoPath,
  unwrapToolResultJson,
  unwrapToolResultText,
} from '../harness/assertions.mjs';
import { createStdioMcpClient } from '../harness/mcp-stdio-client.mjs';
import { createMockAdoServer } from '../harness/mock-ado-server.mjs';

const TEST_PAT = 'e3-tier3-onprem-pat-13579';
const SPRINT_2_UUID = '10000000-0000-4000-8000-000000000002';
const CHARLIE_UUID = '33333333-3333-4333-8333-333333333333';
const ALICE_UUID = '11111111-1111-4111-8111-111111111111';
const WIKI_UUID = '66666666-6666-4666-8666-666666666666';

const requireFromRepo = createRequire(import.meta.url);

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

function buildAdoEnv(mockAdo, apiVersion, extra = {}) {
  return {
    AZURE_DEVOPS_ORG_URL: mockAdo.url,
    AZURE_DEVOPS_AUTH_METHOD: 'pat',
    AZURE_DEVOPS_PAT: TEST_PAT,
    AZURE_DEVOPS_DEFAULT_PROJECT: 'DemoProject',
    AZURE_DEVOPS_API_VERSION: apiVersion,
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

function buildVoteApproveArgs(toolMap, pullRequestId) {
  const tool = toolMap.get('vote_pull_request');
  assert.ok(tool, 'Expected vote_pull_request to be registered in tools/list');
  const props =
    tool.inputSchema && typeof tool.inputSchema.properties === 'object'
      ? tool.inputSchema.properties
      : {};
  const required = Array.isArray(tool.inputSchema?.required)
    ? tool.inputSchema.required
    : [];
  const voteKey = resolvePropKey(props, ['vote'], required);
  const voteSchema = Object.hasOwn(props, voteKey) ? props[voteKey] : {};

  const branches = Array.isArray(voteSchema.anyOf)
    ? voteSchema.anyOf
    : Array.isArray(voteSchema.oneOf)
      ? voteSchema.oneOf
      : [];
  const allowsNumber =
    voteSchema.type === 'number' ||
    voteSchema.type === 'integer' ||
    (Array.isArray(voteSchema.type) &&
      (voteSchema.type.includes('number') ||
        voteSchema.type.includes('integer'))) ||
    (Array.isArray(voteSchema.enum) &&
      voteSchema.enum.some((v) => typeof v === 'number')) ||
    branches.some(
      (b) =>
        b &&
        (b.type === 'number' ||
          b.type === 'integer' ||
          typeof b.const === 'number' ||
          (Array.isArray(b.enum) && b.enum.some((v) => typeof v === 'number'))),
    );
  const stringCandidates = [
    ...(Array.isArray(voteSchema.enum)
      ? voteSchema.enum.filter((v) => typeof v === 'string')
      : []),
    ...branches.flatMap((b) => {
      if (!b || typeof b !== 'object') {
        return [];
      }
      if (typeof b.const === 'string') {
        return [b.const];
      }
      if (Array.isArray(b.enum)) {
        return b.enum.filter((v) => typeof v === 'string');
      }
      return [];
    }),
  ];
  const isStringOnlyVote =
    !allowsNumber &&
    (voteSchema.type === 'string' ||
      stringCandidates.length > 0 ||
      branches.some((b) => b && b.type === 'string'));

  let voteValue = 10;
  if (isStringOnlyVote) {
    voteValue =
      stringCandidates.find((v) => /^approved?$/i.test(String(v))) ??
      stringCandidates.find(
        (v) => /^approv/i.test(String(v)) && !/suggest/i.test(String(v)),
      ) ??
      'approved';
  }
  const args = {};
  args[resolvePropKey(props, ['projectId', 'project'], required)] =
    'DemoProject';
  args[resolvePropKey(props, ['pullRequestId', 'id'], required)] =
    pullRequestId;
  args[voteKey] = voteValue;
  return args;
}

function buildAddReviewerArgs(
  toolMap,
  pullRequestId,
  reviewerEmail,
  isRequired = true,
) {
  const tool = toolMap.get('manage_pull_request_reviewers');
  assert.ok(
    tool,
    'Expected manage_pull_request_reviewers to be registered in tools/list',
  );
  const props =
    tool.inputSchema && typeof tool.inputSchema.properties === 'object'
      ? tool.inputSchema.properties
      : {};
  const required = Array.isArray(tool.inputSchema?.required)
    ? tool.inputSchema.required
    : [];
  const args = {};
  args[resolvePropKey(props, ['projectId', 'project'], required)] =
    'DemoProject';
  args[resolvePropKey(props, ['pullRequestId', 'id'], required)] =
    pullRequestId;
  const repoKey = resolvePropKey(
    props,
    ['repositoryId', 'repository'],
    required,
  );
  if (Object.hasOwn(props, repoKey)) {
    args[repoKey] = 'DemoRepo';
  }

  if (Object.hasOwn(props, 'action') || Object.hasOwn(props, 'operation')) {
    const actionKey = resolvePropKey(props, ['action', 'operation'], required);
    const actionEnum = props[actionKey]?.enum;
    args[actionKey] =
      (Array.isArray(actionEnum)
        ? actionEnum.find((v) => /^add/i.test(String(v)))
        : undefined) ?? 'add';
  }

  const revKey = resolvePropKey(
    props,
    ['reviewers', 'reviewerIds', 'reviewer', 'reviewerId'],
    required,
  );
  const revSchema = Object.hasOwn(props, revKey) ? props[revKey] : {};
  const arraySchema =
    revSchema.type === 'array'
      ? revSchema
      : Array.isArray(revSchema.anyOf)
        ? revSchema.anyOf.find((v) => v && v.type === 'array')
        : Array.isArray(revSchema.oneOf)
          ? revSchema.oneOf.find((v) => v && v.type === 'array')
          : undefined;

  if (arraySchema) {
    const itemsSchema = arraySchema.items;
    const objItemSchema =
      itemsSchema?.type === 'object'
        ? itemsSchema
        : Array.isArray(itemsSchema?.anyOf)
          ? itemsSchema.anyOf.find((v) => v && v.type === 'object')
          : Array.isArray(itemsSchema?.oneOf)
            ? itemsSchema.oneOf.find((v) => v && v.type === 'object')
            : undefined;

    if (objItemSchema) {
      const itemProps =
        objItemSchema.properties && typeof objItemSchema.properties === 'object'
          ? objItemSchema.properties
          : {};
      const itemRequired = Array.isArray(objItemSchema.required)
        ? objItemSchema.required
        : [];
      const entry = {};
      entry[
        resolvePropKey(
          itemProps,
          ['id', 'reviewerId', 'reviewer', 'identifier', 'email', 'uniqueName'],
          itemRequired,
        )
      ] = reviewerEmail;
      const itemHasReq =
        Object.hasOwn(itemProps, 'isRequired') ||
        Object.hasOwn(itemProps, 'required');
      const topHasReq =
        Object.hasOwn(props, 'isRequired') || Object.hasOwn(props, 'required');
      if (itemHasReq || !topHasReq) {
        entry[
          resolvePropKey(itemProps, ['isRequired', 'required'], itemRequired)
        ] = isRequired;
      } else {
        args[resolvePropKey(props, ['isRequired', 'required'], required)] =
          isRequired;
      }
      args[revKey] = [entry];
    } else {
      args[revKey] = [reviewerEmail];
      args[resolvePropKey(props, ['isRequired', 'required'], required)] =
        isRequired;
    }
  } else {
    args[revKey] = reviewerEmail;
    args[resolvePropKey(props, ['isRequired', 'required'], required)] =
      isRequired;
  }
  return args;
}

function extractRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.value)) {
      return payload.value;
    }
    if (Array.isArray(payload.rows)) {
      return payload.rows;
    }
    if (Array.isArray(payload.branches)) {
      return payload.branches;
    }
    if (Array.isArray(payload.items)) {
      return payload.items;
    }
    if (Array.isArray(payload.revisions)) {
      return payload.revisions;
    }
    if (Array.isArray(payload.results)) {
      return payload.results;
    }
  }
  return [];
}

function loadUrlHelperModule() {
  return requireFromRepo(repoPath('dist/shared/azure-devops-url.js'));
}

describe('Tier 3 — On-Premises Compatibility Matrix & Feature Pairwise Combinations', () => {
  it('pair 1: server-2019-rtm (5.0) + Tier 2.1–2.4 uses System.History fallback, omits $expandIdentity, uses classic TestApi, and negotiates 5.0-preview.1', async (t) => {
    const addCleanup = createLifoCleanup(t);

    const mockAdo = await createMockAdoServer({
      profile: 'server-2019-rtm',
      expectedPat: TEST_PAT,
    });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      args: ['--toolsets', 'projects,work-items,pipelines,work'],
      env: buildAdoEnv(mockAdo, '5.0'),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const toolMap = indexTools(await client.listTools());

    // 1. add_work_item_comment -> PATCH /fields/System.History fallback on 5.0
    const initialRev = mockAdo.state.workItems[101].rev;
    const commentText = 'Fallback comment on Server 2019 RTM';
    mockAdo.clearRequests();

    const commentRes = await client.callTool(
      'add_work_item_comment',
      buildSchemaArgs(toolMap, 'add_work_item_comment', [
        [['workItemId', 'id'], 101],
        [['projectId', 'project'], 'DemoProject'],
        [['text', 'comment', 'content'], commentText],
      ]),
    );
    unwrapToolResultText(commentRes, { expectSpotlighted: true });

    const historyPatchReq = mockAdo.requests.find(
      (r) =>
        r.method === 'PATCH' &&
        /\/wit\/workitems\/101$/i.test(r.pathname) &&
        Array.isArray(r.parsedBody) &&
        r.parsedBody.some(
          (op) =>
            String(op?.path || '').toLowerCase() === '/fields/system.history' &&
            String(op?.value || '').includes(commentText),
        ),
    );
    assert.ok(
      historyPatchReq,
      `Expected PATCH /wit/workitems/101 with /fields/System.History on Server 2019 RTM, saw: ${JSON.stringify(
        mockAdo.requests.map((r) => `${r.method} ${r.pathname}`),
      )}`,
    );
    assert.ok(
      mockAdo.state.workItems[101].rev > initialRev ||
        mockAdo.state.workItemComments[101].some((c) =>
          String(c.text || '').includes(commentText),
        ),
      'Server 2019 System.History fallback must advance work item rev or persist comment',
    );

    // 2. get_work_item_revisions -> >= 2 revisions
    const revsRes = await client.callTool(
      'get_work_item_revisions',
      buildSchemaArgs(toolMap, 'get_work_item_revisions', [
        [['workItemId', 'id'], 101],
        [['projectId', 'project'], 'DemoProject'],
      ]),
    );
    const revsJson = unwrapToolResultJson(revsRes, { expectSpotlighted: true });
    assert.ok(
      extractRows(revsJson).length >= 2,
      'get_work_item_revisions must return >= 2 revisions on Server 2019',
    );

    // 3. list_teams -> succeeds and NEVER sends $expandIdentity on Server 2019
    mockAdo.clearRequests();
    const teamsRes = await client.callTool(
      'list_teams',
      buildSchemaArgs(toolMap, 'list_teams', [
        [['projectId', 'project'], 'DemoProject'],
      ]),
    );
    const teamsJson = unwrapToolResultJson(teamsRes, {
      expectSpotlighted: true,
    });
    assert.ok(JSON.stringify(teamsJson).includes('DemoProject Team'));
    const teamReqs = mockAdo.requests.filter((r) =>
      /\/teams\b/i.test(r.pathname),
    );
    assert.ok(teamReqs.length >= 1, 'Expected GET /teams request to mockAdo');
    for (const req of teamReqs) {
      assert.equal(
        hasQueryParamCI(req.query, '$expandIdentity'),
        false,
        'list_teams on Server 2019 (5.0) must NOT send $expandIdentity query param',
      );
    }

    // 4. get_build_test_results -> classic TestApi (ZERO /_apis/testresults calls)
    mockAdo.clearRequests();
    const testRes = await client.callTool(
      'get_build_test_results',
      buildSchemaArgs(toolMap, 'get_build_test_results', [
        [['projectId', 'project'], 'DemoProject'],
        [['runId', 'buildId'], 500],
      ]),
    );
    const testJson = unwrapToolResultJson(testRes, { expectSpotlighted: true });
    assert.ok(
      JSON.stringify(testJson).includes(
        'Auth.TokenSpec.shouldHandleExpiredToken',
      ),
      'get_build_test_results must return failing test on Server 2019',
    );
    assert.equal(
      mockAdo.requests.some((r) => /\/_apis\/testresults\b/i.test(r.pathname)),
      false,
      'Server 2019 must NEVER call Cloud-only /_apis/testresults endpoints',
    );
    assert.ok(
      mockAdo.requests.some((r) => /\/_apis\/test\/runs\b/i.test(r.pathname)),
      'Expected classic /_apis/test/runs call on Server 2019',
    );
    assert.ok(
      mockAdo.requests.some((r) =>
        /\/_apis\/test\/runs\/700\/results\b/i.test(r.pathname),
      ),
      'Expected classic /_apis/test/Runs/700/results call on Server 2019',
    );

    // 5. list_iterations -> Sprint 1/2/3 hierarchy
    const iterRes = await client.callTool(
      'list_iterations',
      buildSchemaArgs(toolMap, 'list_iterations', [
        [['projectId', 'project'], 'DemoProject'],
      ]),
    );
    const iterText = JSON.stringify(
      unwrapToolResultJson(iterRes, { expectSpotlighted: true }),
    );
    assert.ok(iterText.includes('Sprint 1'));
    assert.ok(iterText.includes('Sprint 2'));
    assert.ok(iterText.includes('Sprint 3'));

    // 6. get_iteration_work_items -> negotiates 5.0-preview.1
    mockAdo.clearRequests();
    const iterWiRes = await client.callTool(
      'get_iteration_work_items',
      buildSchemaArgs(toolMap, 'get_iteration_work_items', [
        [['projectId', 'project'], 'DemoProject'],
        [['teamId', 'team'], 'DemoProject Team'],
        [['iterationId', 'id'], SPRINT_2_UUID],
      ]),
    );
    const iterWiJson = unwrapToolResultJson(iterWiRes, {
      expectSpotlighted: true,
    });
    assert.ok(JSON.stringify(iterWiJson).includes('101'));
    const wiRelReq = mockAdo.requests.find((r) =>
      new RegExp(`/iterations/${SPRINT_2_UUID}/workitems$`, 'i').test(
        r.pathname,
      ),
    );
    assert.ok(wiRelReq, 'Expected GET .../iterations/{uuid}/workitems call');
    assert.equal(
      wiRelReq.apiVersion,
      '5.0-preview.1',
      `Expected 5.0-preview.1 negotiation on Server 2019 RTM, got: ${String(wiRelReq.apiVersion)}`,
    );

    client.assertCleanStdout();
  });

  it('pair 2: server-2020 (6.0) negotiates 6.0-preview.1 across retry_pipeline_stage, search_code, list_wiki_pages, and queries OData v3.0-preview', async (t) => {
    const addCleanup = createLifoCleanup(t);

    const mockAdo = await createMockAdoServer({
      profile: 'server-2020',
      expectedPat: TEST_PAT,
    });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      args: ['--toolsets', 'pipelines,search,wikis,analytics'],
      env: buildAdoEnv(mockAdo, '6.0'),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const toolMap = indexTools(await client.listTools());

    // 1. retry_pipeline_stage -> PATCH .../stages/Test with 6.0-preview.1 -> 204
    mockAdo.clearRequests();
    const retryRes = await client.callTool(
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
    unwrapToolResultText(retryRes, { expectSpotlighted: true });

    const stageReq = mockAdo.requests.find(
      (r) =>
        r.method === 'PATCH' &&
        /\/build\/builds\/500\/stages\/Test$/i.test(r.pathname),
    );
    assert.ok(stageReq, 'Expected PATCH /build/builds/500/stages/Test request');
    assert.equal(
      stageReq.apiVersion,
      '6.0-preview.1',
      `Expected 6.0-preview.1 on Server 2020 stage retry, got ${String(stageReq.apiVersion)}`,
    );
    assert.equal(
      mockAdo.state.builds[500].stages.Test.attempt,
      2,
      'Stage retry must increment Test stage attempt from 1 to 2',
    );

    // 2. search_code -> POST .../search/codesearchresults with 6.0-preview.1
    mockAdo.clearRequests();
    const searchRes = await client.callTool('search_code', {
      projectId: 'DemoProject',
      searchText: 'greet',
      includeContent: false,
    });
    const searchJson = unwrapToolResultJson(searchRes, {
      expectSpotlighted: true,
    });
    assert.ok(
      JSON.stringify(searchJson).includes('/src/app.ts'),
      'search_code must return seeded /src/app.ts hit',
    );
    const searchReq = mockAdo.requests.find(
      (r) =>
        r.method === 'POST' && /\/search\/codesearchresults$/i.test(r.pathname),
    );
    assert.ok(searchReq, 'Expected POST .../search/codesearchresults');
    assert.equal(
      searchReq.apiVersion,
      '6.0-preview.1',
      `Expected 6.0-preview.1 on Server 2020 search_code, got ${String(searchReq.apiVersion)}`,
    );

    // 3. list_wiki_pages -> POST .../pagesbatch with 6.0-preview.1
    mockAdo.clearRequests();
    const wikiRes = await client.callTool('list_wiki_pages', {
      projectId: 'DemoProject',
      wikiId: WIKI_UUID,
    });
    const wikiJson = unwrapToolResultJson(wikiRes, { expectSpotlighted: true });
    const wikiStr = JSON.stringify(wikiJson);
    assert.ok(wikiStr.includes('/Home'));
    assert.ok(wikiStr.includes('/Architecture'));
    const wikiReq = mockAdo.requests.find(
      (r) => r.method === 'POST' && /\/pagesbatch$/i.test(r.pathname),
    );
    assert.ok(wikiReq, 'Expected POST .../pagesbatch');
    assert.equal(
      wikiReq.apiVersion,
      '6.0-preview.1',
      `Expected 6.0-preview.1 on Server 2020 list_wiki_pages, got ${String(wikiReq.apiVersion)}`,
    );

    // 4. query_analytics -> /_odata/v3.0-preview/WorkItems
    mockAdo.clearRequests();
    const odataRes = await client.callTool(
      'query_analytics',
      buildSchemaArgs(toolMap, 'query_analytics', [
        [['projectId', 'project'], 'DemoProject'],
        [['entitySet', 'entity', 'table'], 'WorkItems'],
        [['version', 'odataVersion', 'apiVersion'], 'v3.0-preview'],
        [
          ['select', '$select'],
          ['WorkItemId', 'Title'],
        ],
      ]),
    );
    const odataJson = unwrapToolResultJson(odataRes, {
      expectSpotlighted: true,
    });
    assert.ok(
      extractRows(odataJson).some((r) => r.WorkItemId === 101),
      'query_analytics on Server 2020 must return seeded WorkItemId 101',
    );
    assert.ok(
      mockAdo.requests.some((r) =>
        /\/_odata\/v3\.0-preview\/WorkItems\b/i.test(r.pathname),
      ),
      'Expected GET /_odata/v3.0-preview/WorkItems on Server 2020',
    );

    client.assertCleanStdout();
  });

  it('pair 3: server-2022 (7.0) pairs OData analytics + metrics, vote_pull_request preserving isRequired, and paginated list_branches', async (t) => {
    const addCleanup = createLifoCleanup(t);

    const mockAdo = await createMockAdoServer({
      profile: 'server-2022',
      expectedPat: TEST_PAT,
    });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      args: ['--toolsets', 'repositories,pull-requests,analytics'],
      env: buildAdoEnv(mockAdo, '7.0'),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const toolMap = indexTools(await client.listTools());

    // 1. query_analytics + get_analytics_metrics
    mockAdo.clearRequests();
    const qRes = await client.callTool(
      'query_analytics',
      buildSchemaArgs(toolMap, 'query_analytics', [
        [['projectId', 'project'], 'DemoProject'],
        [['entitySet', 'entity', 'table'], 'WorkItems'],
        [
          ['select', '$select'],
          ['WorkItemId', 'Title', 'State'],
        ],
      ]),
    );
    const qJson = unwrapToolResultJson(qRes, { expectSpotlighted: true });
    assert.ok(extractRows(qJson).length >= 3);
    assert.ok(
      mockAdo.requests.some((r) =>
        /\/_odata\/.*\/WorkItems\b/i.test(r.pathname),
      ),
      'query_analytics must hit /_odata/.../WorkItems on mockAdo',
    );

    mockAdo.clearRequests();
    const metricsRes = await client.callTool(
      'get_analytics_metrics',
      buildSchemaArgs(toolMap, 'get_analytics_metrics', [
        [['projectId', 'project'], 'DemoProject'],
        [['metric', 'preset', 'metricName'], 'pipeline_pass_rate'],
      ]),
    );
    const metricsJson = unwrapToolResultJson(metricsRes, {
      expectSpotlighted: true,
    });
    assert.ok(
      metricsJson && typeof metricsJson === 'object',
      'get_analytics_metrics(pipeline_pass_rate) must return structured metrics',
    );
    assert.ok(
      mockAdo.requests.some((r) => /\/_odata\//i.test(r.pathname)),
      'get_analytics_metrics must hit /_odata/ on mockAdo',
    );

    // 2. vote_pull_request on PR 42 preserves Alice's isRequired === true
    const voteRes = await client.callTool(
      'vote_pull_request',
      buildVoteApproveArgs(toolMap, 42),
    );
    unwrapToolResultText(voteRes, { expectSpotlighted: true });

    const aliceReviewer = mockAdo.state.pullRequests[42].reviewers.find(
      (rev) => rev.id === ALICE_UUID,
    );
    assert.ok(aliceReviewer, 'Alice reviewer entry must exist on PR 42');
    assert.equal(aliceReviewer.vote, 10, 'Alice vote must be updated to 10');
    assert.equal(
      aliceReviewer.isRequired,
      true,
      'vote_pull_request MUST preserve Alice isRequired === true on PUT',
    );

    // 3. list_branches pagination with top: 2 + continuationToken
    mockAdo.clearRequests();
    const page1Res = await client.callTool(
      'list_branches',
      buildSchemaArgs(toolMap, 'list_branches', [
        [['projectId', 'project'], 'DemoProject'],
        [['repositoryId', 'repository'], 'DemoRepo'],
        [['top', '$top'], 2],
      ]),
    );
    const page1Json = unwrapToolResultJson(page1Res, {
      expectSpotlighted: true,
    });
    const page1Branches = extractRows(page1Json);
    assert.equal(
      page1Branches.length,
      2,
      `Expected exactly 2 branches on page 1 with top: 2, got ${page1Branches.length}`,
    );
    const token =
      page1Json.continuationToken ??
      page1Json.nextContinuationToken ??
      page1Json.pagination?.continuationToken;
    assert.ok(
      typeof token === 'string' && token.length > 0,
      'Page 1 of list_branches with top: 2 must surface continuationToken',
    );

    const page2Res = await client.callTool(
      'list_branches',
      buildSchemaArgs(toolMap, 'list_branches', [
        [['projectId', 'project'], 'DemoProject'],
        [['repositoryId', 'repository'], 'DemoRepo'],
        [['top', '$top'], 2],
        [['continuationToken'], token],
      ]),
    );
    const page2Json = unwrapToolResultJson(page2Res, {
      expectSpotlighted: true,
    });
    const page2Branches = extractRows(page2Json);
    assert.ok(
      page2Branches.length >= 1,
      'Page 2 of list_branches must return remaining branches',
    );

    const getBranchKey = (b) =>
      typeof b === 'string'
        ? b
        : (b?.name ?? b?.refName ?? b?.branchName ?? JSON.stringify(b));
    const page1Names = new Set(page1Branches.map(getBranchKey));
    assert.equal(
      page1Names.size,
      page1Branches.length,
      `Expected distinct branch identifiers on Page 1, got: ${JSON.stringify(page1Branches)}`,
    );
    assert.ok(
      page2Branches.some((b) => !page1Names.has(getBranchKey(b))),
      'Page 2 must return distinct branches not already returned on Page 1',
    );

    const refsReqs = mockAdo.requests.filter((r) =>
      /\/git\/repositories\/[^/]+\/refs$/i.test(r.pathname),
    );
    assert.ok(
      refsReqs.some((r) => getQueryParamCI(r.query, '$top') === '2'),
      'Expected $top=2 query parameter on page 1 git/refs request',
    );
    assert.ok(
      refsReqs.some(
        (r) => getQueryParamCI(r.query, 'continuationToken') === token,
      ),
      'Expected continuationToken query parameter on page 2 git/refs request',
    );

    client.assertCleanStdout();
  });

  it('pair 4: services (7.1) supports Markdown add_work_item_comment (>=7.1-preview.4), vote_pull_request isRequired preservation, and OData v4.0-preview', async (t) => {
    const addCleanup = createLifoCleanup(t);

    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      args: ['--toolsets', 'work-items,pull-requests,analytics'],
      env: buildAdoEnv(mockAdo, '7.1'),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const toolMap = indexTools(await client.listTools());

    // 1. Markdown add_work_item_comment -> POST wit/workItems/101/comments with 7.[12]-preview.4 & format=markdown|0
    mockAdo.clearRequests();
    const mdRes = await client.callTool(
      'add_work_item_comment',
      buildSchemaArgs(toolMap, 'add_work_item_comment', [
        [['workItemId', 'id'], 101],
        [['projectId', 'project'], 'DemoProject'],
        [['text', 'comment', 'content'], '**Verified** on Services'],
        [['format', 'commentFormat'], 'markdown'],
      ]),
    );
    unwrapToolResultText(mdRes, { expectSpotlighted: true });

    const mdReq = mockAdo.requests.find(
      (r) =>
        r.method === 'POST' &&
        /\/wit\/workitems\/101\/comments$/i.test(r.pathname),
    );
    assert.ok(
      mdReq,
      'Expected POST .../wit/workItems/101/comments on Services',
    );
    assert.match(
      String(mdReq.apiVersion || ''),
      /^7\.[12]-preview\.4$/i,
      `Expected 7.1-preview.4 or 7.2-preview.4 for Markdown comments, got ${String(mdReq.apiVersion)}`,
    );
    const fmt = String(
      getQueryParamCI(mdReq.query, 'format') ?? '',
    ).toLowerCase();
    assert.ok(
      fmt === 'markdown' || fmt === '0',
      `Expected query ?format=markdown (or 0), got: ${JSON.stringify(mdReq.query)}`,
    );

    // 2. vote_pull_request preserves Alice isRequired === true
    const voteRes = await client.callTool(
      'vote_pull_request',
      buildVoteApproveArgs(toolMap, 42),
    );
    unwrapToolResultText(voteRes, { expectSpotlighted: true });
    const alice = mockAdo.state.pullRequests[42].reviewers.find(
      (rev) => rev.id === ALICE_UUID,
    );
    assert.equal(alice?.vote, 10);
    assert.equal(alice?.isRequired, true);

    // 3. OData v4.0-preview schema + query
    mockAdo.clearRequests();
    const schemaRes = await client.callTool(
      'get_analytics_schema',
      buildSchemaArgs(toolMap, 'get_analytics_schema', [
        [['projectId', 'project'], 'DemoProject'],
        [['version', 'odataVersion', 'apiVersion'], 'v4.0-preview'],
      ]),
    );
    const schemaText = unwrapToolResultText(schemaRes, {
      expectSpotlighted: true,
    }).text;
    assert.ok(
      schemaText.includes('ParallelPipelineJobsSnapshot'),
      'v4.0-preview $metadata must expose ParallelPipelineJobsSnapshot',
    );

    const odataV4Res = await client.callTool(
      'query_analytics',
      buildSchemaArgs(toolMap, 'query_analytics', [
        [['projectId', 'project'], 'DemoProject'],
        [['entitySet', 'entity', 'table'], 'WorkItems'],
        [['version', 'odataVersion', 'apiVersion'], 'v4.0-preview'],
        [
          ['select', '$select'],
          ['WorkItemId', 'Title'],
        ],
      ]),
    );
    const odataV4Json = unwrapToolResultJson(odataV4Res, {
      expectSpotlighted: true,
    });
    assert.ok(extractRows(odataV4Json).some((r) => r.WorkItemId === 101));

    assert.ok(
      mockAdo.requests.some((r) =>
        /\/_odata\/v4\.0-preview\/\$metadata$/i.test(r.pathname),
      ),
      'Expected GET /_odata/v4.0-preview/$metadata on mockAdo',
    );
    assert.ok(
      mockAdo.requests.some((r) =>
        /\/_odata\/v4\.0-preview\/WorkItems\b/i.test(r.pathname),
      ),
      'Expected GET /_odata/v4.0-preview/WorkItems on mockAdo',
    );

    client.assertCleanStdout();
  });

  it('pair 5: On-Prem Server URL resolves reviewer email via local /_apis/identities with zero vssps.dev.azure.com leakage', async (t) => {
    const addCleanup = createLifoCleanup(t);

    const mockAdo = await createMockAdoServer({
      profile: 'server-2022',
      expectedPat: TEST_PAT,
    });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      args: ['--toolsets', 'pull-requests'],
      env: buildAdoEnv(mockAdo, '7.0'),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const toolMap = indexTools(await client.listTools());

    mockAdo.clearRequests();
    const addRes = await client.callTool(
      'manage_pull_request_reviewers',
      buildAddReviewerArgs(toolMap, 42, 'charlie@example.com', true),
    );
    unwrapToolResultText(addRes, { expectSpotlighted: true });

    const identityReq = mockAdo.requests.find(
      (r) =>
        r.method === 'GET' &&
        /\/tfs\/DefaultCollection\/_apis\/identities$/i.test(r.pathname) &&
        String(getQueryParamCI(r.query, 'filterValue') ?? '')
          .toLowerCase()
          .includes('charlie@example.com'),
    );
    assert.ok(
      identityReq,
      `Expected on-prem GET /tfs/DefaultCollection/_apis/identities for charlie@example.com, saw: ${JSON.stringify(
        mockAdo.requests.map((r) => `${r.method} ${r.url}`),
      )}`,
    );

    const writeReq = mockAdo.requests.find(
      (r) =>
        (r.method === 'PUT' || r.method === 'POST') &&
        /\/pullrequests\/42\/reviewers/i.test(r.pathname),
    );
    assert.ok(
      writeReq,
      'Expected PUT or POST .../pullRequests/42/reviewers after identity resolution',
    );

    const charlie = mockAdo.state.pullRequests[42].reviewers.find(
      (rev) => rev.id === CHARLIE_UUID,
    );
    assert.ok(charlie, 'Charlie GUID must be added to PR 42 reviewers');
    assert.equal(
      charlie.isRequired,
      true,
      'Charlie must be added as isRequired === true',
    );

    // Verify compiled dist/shared/azure-devops-url.js identityBaseUrl routing contract.
    const urlMod = loadUrlHelperModule();
    assert.equal(
      typeof urlMod.resolveAzureDevOpsBaseUrls,
      'function',
      'dist/shared/azure-devops-url.js must export resolveAzureDevOpsBaseUrls',
    );

    const onPremResolved = urlMod.resolveAzureDevOpsBaseUrls(mockAdo.url);
    assert.equal(
      onPremResolved.type ?? onPremResolved.deploymentType,
      'server',
    );
    assert.equal(
      onPremResolved.identityBaseUrl,
      onPremResolved.coreBaseUrl,
      'On-prem identityBaseUrl must equal coreBaseUrl (zero vssps.dev.azure.com leakage)',
    );
    assert.equal(
      String(onPremResolved.identityBaseUrl).includes('vssps.dev.azure.com'),
      false,
    );

    const cloudResolved = urlMod.resolveAzureDevOpsBaseUrls(
      'https://dev.azure.com/my-org',
    );
    assert.equal(
      cloudResolved.type ?? cloudResolved.deploymentType,
      'services',
    );
    assert.equal(
      cloudResolved.identityBaseUrl,
      'https://vssps.dev.azure.com/my-org',
    );

    const legacyCloudResolved = urlMod.resolveAzureDevOpsBaseUrls(
      'https://legacyorg.visualstudio.com/DefaultCollection',
    );
    assert.equal(
      legacyCloudResolved.type ?? legacyCloudResolved.deploymentType,
      'services',
    );
    assert.equal(
      legacyCloudResolved.identityBaseUrl,
      'https://vssps.dev.azure.com/legacyorg',
    );

    client.assertCleanStdout();
  });

  it('pair 6: On-Prem Server URL routes analytics OData locally (zero analytics.dev.azure.com leakage) and guards cross-origin @odata.nextLink', async (t) => {
    const addCleanup = createLifoCleanup(t);

    const mockAdo = await createMockAdoServer({
      profile: 'server-2022',
      expectedPat: TEST_PAT,
    });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      args: ['--toolsets', 'analytics'],
      env: buildAdoEnv(mockAdo, '7.0'),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const toolMap = indexTools(await client.listTools());

    mockAdo.clearRequests();
    const schemaRes = await client.callTool(
      'get_analytics_schema',
      buildSchemaArgs(toolMap, 'get_analytics_schema', [
        [['projectId', 'project'], 'DemoProject'],
      ]),
    );
    const schemaText = unwrapToolResultText(schemaRes, {
      expectSpotlighted: true,
    }).text;
    assert.ok(schemaText.includes('WorkItems'));

    const queryRes = await client.callTool(
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
    const queryJson = unwrapToolResultJson(queryRes, {
      expectSpotlighted: true,
    });
    assert.ok(extractRows(queryJson).some((r) => r.WorkItemId === 101));

    assert.ok(
      mockAdo.requests.some((r) =>
        /\/tfs\/DefaultCollection\/DemoProject\/_odata\/.*\/\$metadata$/i.test(
          r.pathname,
        ),
      ),
      'On-prem get_analytics_schema must hit local /tfs/DefaultCollection/DemoProject/_odata/.../$metadata',
    );
    assert.ok(
      mockAdo.requests.some((r) =>
        /\/tfs\/DefaultCollection\/DemoProject\/_odata\/.*\/WorkItems\b/i.test(
          r.pathname,
        ),
      ),
      'On-prem query_analytics must hit local /tfs/DefaultCollection/DemoProject/_odata/.../WorkItems',
    );

    // Start an isolated cross-origin loopback decoy server (distinct port -> distinct RFC 6454 origin)
    // to prove zero SSRF / zero PAT exfiltration when @odata.nextLink points cross-origin.
    const evilRequests = [];
    const evilServer = http.createServer((req, res) => {
      evilRequests.push({
        method: req.method,
        url: req.url,
        hasAuth: Boolean(req.headers.authorization),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ value: [] }));
    });
    await new Promise((resolve, reject) => {
      evilServer.once('error', reject);
      evilServer.listen(0, '127.0.0.1', () => {
        evilServer.off('error', reject);
        resolve();
      });
    });
    addCleanup(async () => {
      const closePromise = new Promise((resolve) => {
        evilServer.close(() => resolve());
      });
      evilServer.closeAllConnections?.();
      await closePromise;
    });

    const evilAddr = evilServer.address();
    assert.ok(
      evilAddr && typeof evilAddr === 'object',
      'Expected decoy cross-origin server to bind to an ephemeral TCP port',
    );
    const evilPort = evilAddr.port;
    assert.notEqual(
      evilPort,
      mockAdo.port,
      'Decoy cross-origin server port must differ from mockAdo.port',
    );
    const evilOrigin = `http://127.0.0.1:${evilPort}`;
    const evilLink = `${evilOrigin}/exfil`;

    // Inject hostile cross-origin @odata.nextLink and verify same-origin guard.
    mockAdo.injectNextLink(evilLink);
    const nextLinkRes = await client.callTool(
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

    // Unconditional SSRF / PAT-exfiltration guard (must hold regardless of error vs sanitized response).
    assert.equal(
      evilRequests.length,
      0,
      `query_analytics MUST NEVER follow cross-origin @odata.nextLink (SSRF/PAT exfiltration detected: ${JSON.stringify(evilRequests)})`,
    );

    if (nextLinkRes.isError === true) {
      const errText = unwrapToolResultText(nextLinkRes, {
        allowError: true,
        expectSpotlighted: 'auto',
      }).text;
      assert.match(
        errText,
        /same-origin|cross-origin|origin|untrusted|blocked|rejected|disallowed|forbidden/i,
        `Cross-origin @odata.nextLink error must explain same-origin rejection, got: ${errText}`,
      );
    } else {
      const safeJson = unwrapToolResultJson(nextLinkRes, {
        expectSpotlighted: true,
      });
      const exposedNext =
        safeJson?.nextLink ??
        safeJson?.['@odata.nextLink'] ??
        safeJson?.pagination?.nextLink;
      assert.notEqual(
        exposedNext,
        evilLink,
        'query_analytics MUST NOT blindly expose or follow cross-origin @odata.nextLink',
      );
      const serializedSafeJson = JSON.stringify(safeJson);
      assert.equal(
        serializedSafeJson.includes(evilLink),
        false,
        `query_analytics response must not leak cross-origin nextLink anywhere in JSON: ${serializedSafeJson}`,
      );
      assert.equal(
        serializedSafeJson.includes(evilOrigin),
        false,
        `query_analytics response must not leak cross-origin origin "${evilOrigin}" anywhere in JSON: ${serializedSafeJson}`,
      );
    }

    // Clear sticky nextLink and confirm server stays healthy.
    mockAdo.injectNextLink(null);
    const followUp = await client.callTool(
      'query_analytics',
      buildSchemaArgs(toolMap, 'query_analytics', [
        [['projectId', 'project'], 'DemoProject'],
        [['entitySet', 'entity', 'table'], 'WorkItems'],
        [['select', '$select'], ['WorkItemId']],
      ]),
    );
    assert.ok(
      extractRows(
        unwrapToolResultJson(followUp, { expectSpotlighted: true }),
      ).some((r) => r.WorkItemId === 101),
    );

    // Verify compiled dist/shared/azure-devops-url.js analyticsBaseUrl routing contract.
    const urlMod = loadUrlHelperModule();
    const onPremResolved = urlMod.resolveAzureDevOpsBaseUrls(mockAdo.url);
    assert.equal(
      onPremResolved.analyticsBaseUrl,
      onPremResolved.coreBaseUrl,
      'On-prem analyticsBaseUrl must equal coreBaseUrl (zero analytics.dev.azure.com leakage)',
    );
    assert.equal(
      String(onPremResolved.analyticsBaseUrl).includes(
        'analytics.dev.azure.com',
      ),
      false,
    );

    const corpResolved = urlMod.resolveAzureDevOpsBaseUrls(
      'https://ado.corp.local:8080/MyCollection',
    );
    assert.equal(corpResolved.analyticsBaseUrl, corpResolved.coreBaseUrl);

    const cloudResolved = urlMod.resolveAzureDevOpsBaseUrls(
      'https://dev.azure.com/my-org',
    );
    assert.equal(
      cloudResolved.analyticsBaseUrl,
      'https://analytics.dev.azure.com/my-org',
    );

    const legacyCloudResolved = urlMod.resolveAzureDevOpsBaseUrls(
      'https://legacyorg.visualstudio.com/DefaultCollection',
    );
    assert.equal(
      legacyCloudResolved.analyticsBaseUrl,
      'https://analytics.dev.azure.com/legacyorg',
    );

    client.assertCleanStdout();
  });
});
