import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

import { repoPath, unwrapToolResultJson } from '../harness/assertions.mjs';
import { createStdioMcpClient } from '../harness/mcp-stdio-client.mjs';
import { createMockAdoServer } from '../harness/mock-ado-server.mjs';

const requireFromHere = createRequire(import.meta.url);

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

const METRIC_ARRAY_KEYS = [
  'value',
  'rows',
  'metrics',
  'results',
  'items',
  'data',
  'pipelines',
  'tests',
  'series',
];

function extractMetricEntries(payload, extraArrayKeys = []) {
  assert.ok(
    payload && typeof payload === 'object',
    `Expected structured analytics metric payload, got: ${JSON.stringify(payload)}`,
  );
  if (Array.isArray(payload)) {
    assert.ok(
      payload.length >= 1,
      'Expected non-empty analytics metric array, got []',
    );
    return payload;
  }
  for (const key of [...extraArrayKeys, ...METRIC_ARRAY_KEYS]) {
    if (Object.hasOwn(payload, key) && Array.isArray(payload[key])) {
      assert.ok(
        payload[key].length >= 1,
        `Expected non-empty "${key}" array in analytics metrics response, got [] in ${JSON.stringify(payload).slice(0, 300)}`,
      );
      return payload[key];
    }
  }
  const target =
    payload.summary &&
    typeof payload.summary === 'object' &&
    !Array.isArray(payload.summary)
      ? payload.summary
      : payload;
  assert.ok(
    Object.keys(target).length > 0,
    `Expected non-empty analytics metric summary object, got: ${JSON.stringify(payload)}`,
  );
  return [target];
}

const NON_METRIC_NUMBER_KEYS = new Set([
  'datesk',
  'completeddatesk',
  'reviseddatesk',
  'year',
  'monthofyear',
  'workitemid',
  'pipelineid',
  'pipelinesk',
  'pipelinerunid',
  'pipelinerunsk',
  'days',
  'lookbackdays',
  'windowdays',
  'top',
  'skip',
  'status',
  'statuscode',
]);

function collectMetricNumbers(value, results = [], parentKey = '') {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (!NON_METRIC_NUMBER_KEYS.has(parentKey.toLowerCase())) {
      results.push(value);
    }
    return results;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectMetricNumbers(item, results, parentKey);
    }
    return results;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      collectMetricNumbers(v, results, k);
    }
  }
  return results;
}

function hasSeededPipelineIdentity(entry) {
  if (!entry || typeof entry !== 'object') {
    return false;
  }
  const nameCandidates = [
    entry.PipelineName,
    entry.pipelineName,
    entry.Pipeline?.PipelineName,
    entry.pipeline?.pipelineName,
    entry.pipeline?.name,
  ];
  if (nameCandidates.some((v) => v === 'CI-Main')) {
    return true;
  }
  const idCandidates = [
    entry.PipelineId,
    entry.pipelineId,
    entry.Pipeline?.PipelineId,
    entry.pipeline?.pipelineId,
    entry.pipeline?.id,
  ];
  return idCandidates.some((v) => v === 10 || v === '10');
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

function extractRows(payload, preferredKeys = []) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === 'object') {
    for (const key of [...preferredKeys, 'value', 'rows', 'items', 'data']) {
      if (Array.isArray(payload[key])) {
        return payload[key];
      }
    }
  }
  assert.fail(
    `Expected array or wrapped row list payload, got: ${JSON.stringify(payload).slice(0, 300)}`,
  );
}

describe('Tier 1 — Area 8: Azure DevOps OData Analytics (F20, F21)', () => {
  it('T6.1 [F20] resolveAzureDevOpsBaseUrls routes analyticsBaseUrl cleanly (Cloud vs On-Prem) and shared isSameOrigin validates scheme+host+port', () => {
    const urlMod = requireFromHere(repoPath('dist/shared/azure-devops-url.js'));
    const httpMod = requireFromHere(
      repoPath('dist/shared/http/http-client.js'),
    );

    assert.equal(
      typeof urlMod.resolveAzureDevOpsBaseUrls,
      'function',
      'Expected resolveAzureDevOpsBaseUrls export',
    );

    const cloudModern = urlMod.resolveAzureDevOpsBaseUrls(
      'https://dev.azure.com/myorg',
    );
    assert.equal(cloudModern.type ?? cloudModern.deploymentType, 'services');
    assert.equal(
      cloudModern.analyticsBaseUrl,
      'https://analytics.dev.azure.com/myorg',
    );

    const cloudLegacy = urlMod.resolveAzureDevOpsBaseUrls(
      'https://myorg.visualstudio.com',
    );
    assert.equal(cloudLegacy.type ?? cloudLegacy.deploymentType, 'services');
    assert.equal(
      cloudLegacy.analyticsBaseUrl,
      'https://analytics.dev.azure.com/myorg',
    );

    const onPrem = urlMod.resolveAzureDevOpsBaseUrls(
      'https://ado.corp:8080/tfs/DefaultCollection',
    );
    assert.equal(onPrem.type ?? onPrem.deploymentType, 'server');
    assert.equal(
      onPrem.analyticsBaseUrl,
      'https://ado.corp:8080/tfs/DefaultCollection',
    );
    assert.equal(onPrem.analyticsBaseUrl, onPrem.coreBaseUrl);

    const isSameOrigin = httpMod.isSameOrigin ?? urlMod.isSameOrigin;
    assert.equal(
      typeof isSameOrigin,
      'function',
      'Expected shared isSameOrigin lifted into dist/shared/http/http-client.js or dist/shared/azure-devops-url.js',
    );

    assert.equal(
      isSameOrigin(
        'https://analytics.dev.azure.com/myorg/_odata/v4.0-preview/WorkItems?$skip=100',
        'https://analytics.dev.azure.com/myorg',
      ),
      true,
    );
    assert.equal(
      isSameOrigin(
        'https://evil.example.com/myorg/_odata/v4.0-preview/WorkItems',
        'https://analytics.dev.azure.com/myorg',
      ),
      false,
    );
    assert.equal(
      isSameOrigin(
        'http://analytics.dev.azure.com/myorg/_odata/v4.0-preview/WorkItems',
        'https://analytics.dev.azure.com/myorg',
      ),
      false,
    );
    assert.equal(
      isSameOrigin(
        'https://ado.corp:9443/tfs/DefaultCollection/_odata/v3.0-preview/WorkItems',
        'https://ado.corp:8080/tfs/DefaultCollection',
      ),
      false,
    );
    assert.equal(
      isSameOrigin(
        'https://analytics.dev.azure.com.evil.example/myorg',
        'https://analytics.dev.azure.com/myorg',
      ),
      false,
    );
    assert.equal(
      isSameOrigin('not-a-valid-url', 'https://analytics.dev.azure.com/myorg'),
      false,
    );
  });

  it('T6.2 [F21] analytics toolset (--toolsets analytics) registers all 3 read-only OData tools with full ToolAnnotations', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      args: ['--toolsets', 'analytics'],
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();

    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      'get_analytics_metrics',
      'get_analytics_schema',
      'query_analytics',
    ]);
    for (const tool of tools) {
      assert.equal(
        tool.annotations?.readOnlyHint,
        true,
        `${tool.name}.readOnlyHint`,
      );
      assert.equal(
        tool.annotations?.destructiveHint,
        false,
        `${tool.name}.destructiveHint`,
      );
      assert.equal(
        tool.annotations?.idempotentHint,
        true,
        `${tool.name}.idempotentHint`,
      );
      assert.equal(
        tool.annotations?.openWorldHint,
        true,
        `${tool.name}.openWorldHint`,
      );
    }
  });

  it('T6.3 [F21] get_analytics_schema lists available entity sets from $metadata EDMX XML', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    requireTool(tools, 'get_analytics_schema');

    const res = await client.callTool('get_analytics_schema', {
      projectId: 'DemoProject',
    });
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    const serialized = JSON.stringify(data);

    for (const entitySet of [
      'WorkItems',
      'WorkItemSnapshot',
      'PipelineRuns',
      'TestResultsDaily',
    ]) {
      assert.ok(
        serialized.includes(entitySet),
        `Expected entity set "${entitySet}" in get_analytics_schema output`,
      );
    }

    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'GET' &&
          /^\/DemoProject\/_odata\/[^/]+\/\$metadata$/i.test(req.relPath),
      ),
      'Expected GET /DemoProject/_odata/{version}/$metadata',
    );
  });

  it('T6.4 [F21] get_analytics_schema inspects properties of WorkItems including Custom_* fields and navigation properties', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'get_analytics_schema');
    const entityKey = resolvePropKey(tool, ['entitySet', 'entity']);

    const res = await client.callTool('get_analytics_schema', {
      projectId: 'DemoProject',
      [entityKey]: 'WorkItems',
    });
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    const serialized = JSON.stringify(data);

    for (const field of [
      'WorkItemId',
      'CycleTimeDays',
      'Custom_Team',
      'Custom_RiskScore',
      'Area',
      'Iteration',
      'AssignedTo',
    ]) {
      assert.ok(
        serialized.includes(field),
        `Expected property/navigation property "${field}" in WorkItems schema`,
      );
    }

    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'GET' &&
          /^\/DemoProject\/_odata\/[^/]+\/\$metadata$/i.test(req.relPath),
      ),
      'Expected GET /DemoProject/_odata/{version}/$metadata for WorkItems inspection',
    );
  });

  it('T6.5 [F21] query_analytics executes project-scoped $select + $filter + $orderby + $top + $count query on WorkItems', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'query_analytics');
    const selectKey = resolvePropKey(tool, ['select']);
    const orderKey = resolvePropKey(tool, ['orderby', 'orderBy']);
    const countKey = resolvePropKey(tool, ['count', 'includeCount']);

    const res = await client.callTool('query_analytics', {
      projectId: 'DemoProject',
      entitySet: 'WorkItems',
      [selectKey]: resolveSelectArg(tool, selectKey, [
        'WorkItemId',
        'Title',
        'State',
        'StoryPoints',
      ]),
      filter: "State eq 'Active'",
      [orderKey]: 'StoryPoints desc',
      top: 10,
      [countKey]: true,
    });
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    assert.ok(
      data && typeof data === 'object' && !Array.isArray(data),
      'Expected structured object response from query_analytics when count: true is requested',
    );
    const rows = extractRows(data);

    assert.deepEqual(
      rows.map((r) => r.WorkItemId),
      [101, 103],
      `Expected Active WorkItems ordered by StoryPoints desc [101, 103], got ${JSON.stringify(rows)}`,
    );

    const explicitCount =
      data['@odata.count'] ?? data.totalCount ?? data.odataCount ?? data.count;
    assert.equal(
      explicitCount,
      2,
      `Expected explicit OData $count field (@odata.count / totalCount / odataCount / count) === 2, got: ${JSON.stringify(data).slice(0, 300)}`,
    );

    const queryReq = mockAdo.requests.find(
      (req) =>
        req.method === 'GET' &&
        /^\/DemoProject\/_odata\/[^/]+\/WorkItems$/i.test(req.relPath),
    );
    assert.ok(queryReq, 'Expected GET /DemoProject/_odata/{version}/WorkItems');
    assert.ok(
      getQueryParamCI(queryReq.query, '$select'),
      'Expected $select on wire',
    );
    assert.ok(
      getQueryParamCI(queryReq.query, '$filter'),
      'Expected $filter on wire',
    );
    assert.ok(
      getQueryParamCI(queryReq.query, '$orderby'),
      'Expected $orderby on wire',
    );
    assert.equal(getQueryParamCI(queryReq.query, '$top'), '10');
    assert.equal(
      String(getQueryParamCI(queryReq.query, '$count') ?? '').toLowerCase(),
      'true',
    );

    // Call 2: prove explicit OData $count reports total matching rows (2) even when $top=1 slices to 1 row
    mockAdo.clearRequests();
    const pagedRes = await client.callTool('query_analytics', {
      projectId: 'DemoProject',
      entitySet: 'WorkItems',
      [selectKey]: resolveSelectArg(tool, selectKey, [
        'WorkItemId',
        'Title',
        'State',
        'StoryPoints',
      ]),
      filter: "State eq 'Active'",
      [orderKey]: 'StoryPoints desc',
      top: 1,
      [countKey]: true,
    });
    const pagedData = unwrapToolResultJson(pagedRes, {
      expectSpotlighted: true,
    });
    assert.ok(
      pagedData && typeof pagedData === 'object' && !Array.isArray(pagedData),
      'Expected structured object response from query_analytics when count: true is requested',
    );
    const pagedRows = extractRows(pagedData);
    assert.deepEqual(
      pagedRows.map((r) => r.WorkItemId),
      [101],
      `Expected top: 1 to return only highest StoryPoints Active item [101], got ${JSON.stringify(pagedRows)}`,
    );
    const pagedExplicitCount =
      pagedData['@odata.count'] ??
      pagedData.totalCount ??
      pagedData.odataCount ??
      pagedData.count;
    assert.equal(
      pagedExplicitCount,
      2,
      `Expected explicit OData $count === 2 even when $top=1 returns 1 row, got: ${JSON.stringify(pagedData).slice(0, 300)}`,
    );
    const pagedReq = mockAdo.requests.find(
      (req) =>
        req.method === 'GET' &&
        /^\/DemoProject\/_odata\/[^/]+\/WorkItems$/i.test(req.relPath),
    );
    assert.ok(
      pagedReq,
      'Expected second GET /DemoProject/_odata/{version}/WorkItems',
    );
    assert.equal(getQueryParamCI(pagedReq.query, '$top'), '1');
    assert.equal(
      String(getQueryParamCI(pagedReq.query, '$count') ?? '').toLowerCase(),
      'true',
    );
  });

  it('T6.6 [F21] query_analytics executes server-side $apply aggregation on composite WorkItemSnapshot', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    requireTool(tools, 'query_analytics');

    const applyExpr =
      'groupby((DateSK,State),aggregate($count as ItemCount, StoryPoints with sum as TotalPoints))';
    const res = await client.callTool('query_analytics', {
      projectId: 'DemoProject',
      entitySet: 'WorkItemSnapshot',
      apply: applyExpr,
    });
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    const rows = extractRows(data);

    assert.equal(rows.length, 3, 'Expected 3 aggregated snapshot groups');
    const nov20Active = rows.find(
      (r) => r.DateSK === 20261120 && r.State === 'Active',
    );
    const nov20Closed = rows.find(
      (r) => r.DateSK === 20261120 && r.State === 'Closed',
    );
    const nov21Active = rows.find(
      (r) => r.DateSK === 20261121 && r.State === 'Active',
    );
    assert.ok(nov20Active && nov20Active.TotalPoints === 5);
    assert.ok(nov20Closed && nov20Closed.TotalPoints === 3);
    assert.ok(nov21Active && nov21Active.TotalPoints === 5);

    const applyReq = mockAdo.requests.find(
      (req) =>
        req.method === 'GET' &&
        /^\/DemoProject\/_odata\/[^/]+\/WorkItemSnapshot$/i.test(req.relPath) &&
        Boolean(getQueryParamCI(req.query, '$apply')),
    );
    assert.ok(
      applyReq,
      'Expected GET /DemoProject/_odata/{version}/WorkItemSnapshot with $apply',
    );
  });

  it('T6.7 [F21] query_analytics properly percent-encodes + in DateTimeOffset timezone filter (+08:00 -> %2B) and supports scope: organization', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'query_analytics');
    const selectKey = resolvePropKey(tool, ['select']);
    const scopeKey = resolvePropKey(tool, ['scope']);

    const args = {
      entitySet: 'WorkItems',
      [selectKey]: resolveSelectArg(tool, selectKey, [
        'WorkItemId',
        'ChangedDate',
      ]),
      filter: 'ChangedDate ge 2026-11-22T00:00:00+08:00',
      [scopeKey]: 'organization',
    };

    const res = await client.callTool('query_analytics', args);
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    const rows = extractRows(data);

    assert.deepEqual(
      rows.map((r) => r.WorkItemId).sort((a, b) => a - b),
      [102, 103],
      `Expected items 102 & 103 matching ChangedDate >= 2026-11-22T00:00:00+08:00, got ${JSON.stringify(rows)}`,
    );

    const queryReq = mockAdo.requests.find(
      (req) =>
        req.method === 'GET' &&
        /\/_odata\/[^/]+\/WorkItems$/i.test(req.relPath),
    );
    assert.ok(queryReq, 'Expected GET .../_odata/{version}/WorkItems');
    assert.match(
      queryReq.url,
      /%2B08/i,
      `Expected "+" in DateTimeOffset "+08:00" to be percent-encoded as %2B in raw URL, got: ${queryReq.url}`,
    );
    assert.match(
      queryReq.relPath,
      /^\/_odata\/[^/]+\/WorkItems$/i,
      `Expected org-scoped path /_odata/{version}/WorkItems without /DemoProject prefix, got: ${queryReq.relPath}`,
    );
  });

  it('T6.8 [F21] get_analytics_metrics runs curated CI & Test $apply presets (pipeline_pass_rate, flaky_tests)', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'get_analytics_metrics');
    const metricKey = resolvePropKey(tool, ['metric', 'preset', 'metricName']);

    // 1. pipeline_pass_rate
    const passRes = await client.callTool('get_analytics_metrics', {
      projectId: 'DemoProject',
      [metricKey]: 'pipeline_pass_rate',
    });
    const passData = unwrapToolResultJson(passRes, { expectSpotlighted: true });
    const passEntries = extractMetricEntries(passData);
    for (const entry of passEntries) {
      assert.ok(
        entry &&
          typeof entry === 'object' &&
          !Array.isArray(entry) &&
          Object.keys(entry).length > 0,
        `Expected non-empty metric row object in pipeline_pass_rate, got: ${JSON.stringify(entry)}`,
      );
    }
    const passReq = mockAdo.requests.find(
      (req) =>
        req.method === 'GET' &&
        /^\/DemoProject\/_odata\/[^/]+\/PipelineRuns$/i.test(req.relPath) &&
        Boolean(getQueryParamCI(req.query, '$apply')),
    );
    assert.ok(
      passReq,
      'Expected GET /DemoProject/_odata/{version}/PipelineRuns with $apply',
    );

    // Seeded PipelineRuns has 2 runs for CI-Main (PipelineId 10): 1 succeeded, 1 failed (50% / 0.5).
    const passNums = collectMetricNumbers(passEntries);
    const expectedPassNums = [0.5, 1, 2, 50];
    assert.ok(
      passNums.some((n) =>
        expectedPassNums.some((expected) => Math.abs(n - expected) <= 0.01),
      ),
      `Expected concrete seeded pass-rate / run-count numeric metrics ({0.5, 1, 2, 50}) in pipeline_pass_rate rows, got numbers=${JSON.stringify(passNums)} from ${JSON.stringify(passEntries).slice(0, 400)}`,
    );
    const passApply = String(getQueryParamCI(passReq.query, '$apply') ?? '');
    if (/\bpipeline(?:name|id)?\b/i.test(passApply)) {
      assert.ok(
        passEntries.some(hasSeededPipelineIdentity),
        `Expected structured CI-Main / PipelineId === 10 identity in grouped pipeline_pass_rate rows, got: ${JSON.stringify(passEntries).slice(0, 400)}`,
      );
    } else {
      assert.ok(
        passNums.some(
          (n) =>
            Math.abs(n - 2) <= 0.01 ||
            Math.abs(n - 0.5) <= 0.01 ||
            Math.abs(n - 50) <= 0.01,
        ),
        `Expected ungrouped pipeline_pass_rate aggregate to reflect 2 seeded runs / 50% pass rate, got: ${JSON.stringify(passEntries).slice(0, 400)}`,
      );
    }

    // 2. flaky_tests
    mockAdo.clearRequests();
    const flakyRes = await client.callTool('get_analytics_metrics', {
      projectId: 'DemoProject',
      [metricKey]: 'flaky_tests',
    });
    const flakyData = unwrapToolResultJson(flakyRes, {
      expectSpotlighted: true,
    });
    const flakyEntries = extractMetricEntries(flakyData);
    const flakyEntriesStr = JSON.stringify(flakyEntries);
    assert.ok(
      flakyEntriesStr.includes('Net.TimeoutSpec.shouldTimeout') ||
        flakyEntriesStr.includes('Auth.TokenSpec.shouldHandleExpiredToken'),
      `Expected seeded flaky test names inside flaky_tests rows, got: ${flakyEntriesStr.slice(0, 400)}`,
    );
    const flakyNums = collectMetricNumbers(flakyEntries);
    assert.ok(
      flakyNums.some((n) => n > 0),
      `Expected positive flaky/result count metrics in flaky_tests rows, got: ${JSON.stringify(flakyEntries).slice(0, 400)}`,
    );
    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'GET' &&
          /^\/DemoProject\/_odata\/[^/]+\/TestResultsDaily$/i.test(
            req.relPath,
          ) &&
          Boolean(getQueryParamCI(req.query, '$apply')),
      ),
      'Expected GET /DemoProject/_odata/{version}/TestResultsDaily with $apply',
    );
  });

  it('T6.9 [F21] get_analytics_metrics runs work_item_cycle_time cleanly on server-2020 (v3.0-preview compatibility)', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'server-2020' });
    addCleanup(() => mockAdo.close());

    // Enrich seeded WorkItems with CompletedDate & CreatedDate so presets filtering on either
    // CompletedDateSK or CompletedDate/CreatedDate match seeded rows cleanly.
    mockAdo.mutateState((state) => {
      const datesById = {
        101: {
          CreatedDate: '2026-11-16T10:00:00Z',
          CompletedDate: '2026-11-20T12:00:00Z',
        },
        102: {
          CreatedDate: '2026-11-18T10:00:00Z',
          CompletedDate: '2026-11-22T14:00:00Z',
        },
        103: {
          CreatedDate: '2026-11-18T10:00:00Z',
          CompletedDate: '2026-11-24T09:00:00Z',
        },
      };
      for (const row of state.analytics.WorkItems) {
        const extra = datesById[row.WorkItemId];
        if (extra) {
          row.CreatedDate = extra.CreatedDate;
          row.CompletedDate = extra.CompletedDate;
        }
      }
    });

    const client = createStdioMcpClient({
      env: makeStandardEnv(mockAdo, { AZURE_DEVOPS_API_VERSION: '6.0' }),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'get_analytics_metrics');
    const metricKey = resolvePropKey(tool, ['metric', 'preset', 'metricName']);

    const res = await client.callTool('get_analytics_metrics', {
      projectId: 'DemoProject',
      [metricKey]: 'work_item_cycle_time',
    });
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    const entries = extractMetricEntries(data);
    for (const entry of entries) {
      assert.ok(
        entry &&
          typeof entry === 'object' &&
          !Array.isArray(entry) &&
          Object.keys(entry).length > 0,
        `Expected non-empty cycle time aggregation row object, got: ${JSON.stringify(entry)}`,
      );
    }
    const metricNums = collectMetricNumbers(entries);
    // All mathematically valid aggregates (avg/min/max/sum) over seeded
    // CycleTimeDays [4.5, 2.0, 6.0] and LeadTimeDays [8.0, 3.5, 9.0]
    // for either StateCategory eq 'Completed' (WI 102) or all 3 seeded items.
    const expectedCycleOrLeadNums = [
      2, 3.5, 4.1667, 4.5, 6, 6.8333, 8, 9, 12.5, 20.5,
    ];
    assert.ok(
      metricNums.some((n) =>
        expectedCycleOrLeadNums.some(
          (expected) => Math.abs(n - expected) <= 0.05,
        ),
      ),
      `Expected concrete cycle-time / lead-time numeric metric derived from seeded WorkItems (${JSON.stringify(expectedCycleOrLeadNums)}), got numbers=${JSON.stringify(metricNums)} from ${JSON.stringify(entries).slice(0, 400)}`,
    );

    const odataReq = mockAdo.requests.find(
      (req) =>
        req.method === 'GET' &&
        /^\/DemoProject\/_odata\/(v2\.0|v3\.0-preview)\/WorkItems$/i.test(
          req.relPath,
        ) &&
        Boolean(getQueryParamCI(req.query, '$apply')),
    );
    assert.ok(
      odataReq,
      `Expected Server 2020 compatible OData GET /DemoProject/_odata/(v2.0|v3.0-preview)/WorkItems with $apply, saw: ${JSON.stringify(mockAdo.requests.map((r) => r.relPath))}`,
    );
  });
});
