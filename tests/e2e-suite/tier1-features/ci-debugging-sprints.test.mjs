import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { unwrapToolResultJson } from '../harness/assertions.mjs';
import { createStdioMcpClient } from '../harness/mcp-stdio-client.mjs';
import { createMockAdoServer } from '../harness/mock-ado-server.mjs';

const SPRINT_1_UUID = '10000000-0000-4000-8000-000000000001';
const SPRINT_2_UUID = '10000000-0000-4000-8000-000000000002';
const SPRINT_3_UUID = '10000000-0000-4000-8000-000000000003';
const ROOT_ITER_UUID = '10000000-0000-4000-8000-000000000000';

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

function collectObjectsRecursive(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectObjectsRecursive(item, out);
    }
    return out;
  }
  if (value && typeof value === 'object') {
    out.push(value);
    for (const child of Object.values(value)) {
      collectObjectsRecursive(child, out);
    }
  }
  return out;
}

function resolveOutcomesPassedValue(tool, outcomesKey) {
  const outcomesSchema = tool.inputSchema?.properties?.[outcomesKey];
  assert.ok(
    outcomesSchema,
    `Tool "${tool.name}" missing schema for "${outcomesKey}"`,
  );
  const arrayBranches = flattenSchemaBranches(outcomesSchema).filter(
    (b) => branchHasType(b, ['array']) || b.items !== undefined,
  );
  if (arrayBranches.length > 0) {
    let lastError = null;
    for (const arrBranch of arrayBranches) {
      try {
        const itemSchema = arrBranch.items ?? { type: 'string' };
        const passedItem = resolveSchemaValueFromSchema(
          tool.name,
          `${outcomesKey}[]`,
          itemSchema,
          ['Passed', 'passed', 2],
        );
        return [passedItem];
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }
  return resolveSchemaValueFromSchema(tool.name, outcomesKey, outcomesSchema, [
    'Passed',
    'passed',
    2,
  ]);
}

function assertStageActionPayload(data, expectedBuildId, expectedStage) {
  const objs = collectObjectsRecursive(data);
  const serialized = JSON.stringify(data);
  assert.ok(
    objs.some(
      (o) =>
        Number(o.buildId) === expectedBuildId ||
        Number(o.runId) === expectedBuildId ||
        Number(o.id) === expectedBuildId,
    ),
    `Expected response to include buildId/runId ${expectedBuildId}, got: ${serialized.slice(0, 400)}`,
  );
  assert.ok(
    objs.some((o) =>
      Object.values(o).some(
        (v) =>
          typeof v === 'string' &&
          v.toLowerCase() === expectedStage.toLowerCase(),
      ),
    ),
    `Expected response to include stage "${expectedStage}", got: ${serialized.slice(0, 400)}`,
  );
}

function extractWorkItemIds(payload) {
  const ids = new Set();
  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (typeof item === 'number' && Number.isInteger(item)) {
        ids.add(item);
      }
    }
  }
  for (const obj of collectObjectsRecursive(payload)) {
    if (typeof obj.id === 'number' && Number.isInteger(obj.id)) {
      ids.add(obj.id);
    }
    if (
      typeof obj.workItemId === 'number' &&
      Number.isInteger(obj.workItemId)
    ) {
      ids.add(obj.workItemId);
    }
    if (Array.isArray(obj.workItemIds)) {
      for (const id of obj.workItemIds) {
        if (typeof id === 'number' && Number.isInteger(id)) {
          ids.add(id);
        }
      }
    }
  }
  return ids;
}

describe('Tier 1 — Area 6: CI Debugging Superpowers (F17, F18)', () => {
  it('T5.1 [F17] get_build_test_results fetches failed/aborted tests with errorMessage, stackTrace, and run summary via cross-platform TestApi', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'get_build_test_results');
    const runKey = resolvePropKey(tool, ['runId', 'buildId']);

    const res = await client.callTool('get_build_test_results', {
      projectId: 'DemoProject',
      [runKey]: 500,
    });
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    const serialized = JSON.stringify(data);

    assert.ok(
      serialized.includes('Auth.TokenSpec.shouldHandleExpiredToken'),
      'Expected failed test Auth.TokenSpec.shouldHandleExpiredToken',
    );
    assert.ok(
      serialized.includes('Expected 401 but received 500'),
      'Expected failed test errorMessage',
    );
    assert.ok(
      serialized.includes('src/auth.spec.ts:42:11'),
      'Expected failed test stackTrace',
    );
    assert.ok(
      serialized.includes('Net.TimeoutSpec.shouldTimeout'),
      'Expected aborted test Net.TimeoutSpec.shouldTimeout',
    );
    assert.ok(
      serialized.includes('Test host aborted after 5000ms'),
      'Expected aborted test errorMessage',
    );
    assert.equal(
      serialized.includes('Auth.TokenSpec.shouldAcceptValidPat'),
      false,
      'Default failure-focused outcomes should exclude Passed tests',
    );

    const allObjs = collectObjectsRecursive(data);
    assert.ok(
      allObjs.some((obj) => obj.totalTests === 3 && obj.passedTests === 1),
      `Expected test run summary (totalTests: 3, passedTests: 1), got: ${serialized.slice(0, 400)}`,
    );

    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'GET' &&
          /^\/DemoProject\/_apis\/test\/runs$/i.test(req.relPath) &&
          String(getQueryParamCI(req.query, 'buildUri') ?? '').toLowerCase() ===
            'vstfs:///build/build/500',
      ),
      'Expected GET /DemoProject/_apis/test/runs?buildUri=vstfs:///Build/Build/500',
    );
    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'GET' &&
          /^\/DemoProject\/_apis\/test\/runs\/700\/results$/i.test(req.relPath),
      ),
      'Expected GET /DemoProject/_apis/test/Runs/700/results',
    );
    assert.equal(
      mockAdo.requests.some((req) =>
        /\/_apis\/testresults\b/i.test(req.relPath),
      ),
      false,
      'Must use cross-platform TestApi, never Cloud-only /_apis/testresults',
    );
  });

  it('T5.2 [F17] get_build_test_results resolves run via pipelineName + buildNumber (withResolvedRun) and filters explicit outcomes', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'get_build_test_results');
    const outcomesKey = resolvePropKey(tool, ['outcomes']);
    const passedValue = resolveOutcomesPassedValue(tool, outcomesKey);

    const res = await client.callTool('get_build_test_results', {
      projectId: 'DemoProject',
      pipelineName: 'CI-Main',
      buildNumber: '20261125.1',
      [outcomesKey]: passedValue,
    });
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    const serialized = JSON.stringify(data);
    assert.ok(
      serialized.includes('Auth.TokenSpec.shouldAcceptValidPat'),
      `Expected Passed test Auth.TokenSpec.shouldAcceptValidPat when outcomes=Passed, got: ${serialized.slice(0, 400)}`,
    );
    assert.equal(
      serialized.includes('Auth.TokenSpec.shouldHandleExpiredToken'),
      false,
      'Explicit outcomes=Passed must exclude Failed test Auth.TokenSpec.shouldHandleExpiredToken',
    );
    assert.equal(
      serialized.includes('Net.TimeoutSpec.shouldTimeout'),
      false,
      'Explicit outcomes=Passed must exclude Aborted test Net.TimeoutSpec.shouldTimeout',
    );

    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'GET' &&
          /\/_apis\/build\/definitions/i.test(req.relPath),
      ),
      'Expected pipeline name lookup via build definitions',
    );
    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'GET' &&
          /\/_apis\/build\/builds$/i.test(req.relPath) &&
          getQueryParamCI(req.query, 'buildNumber') === '20261125.1',
      ),
      'Expected build lookup via buildNumber=20261125.1',
    );
    const resultsReq = mockAdo.requests.find(
      (req) =>
        req.method === 'GET' &&
        /^\/DemoProject\/_apis\/test\/runs\/700\/results$/i.test(req.relPath),
    );
    assert.ok(
      resultsReq,
      'Expected GET /DemoProject/_apis/test/Runs/700/results',
    );
    const wireOutcomes = getQueryParamCI(resultsReq.query, 'outcomes');
    assert.ok(
      wireOutcomes !== undefined && wireOutcomes.trim().length > 0,
      `Expected outcomes query param on /Runs/700/results, got query=${JSON.stringify(resultsReq.query)}`,
    );
    const outcomeTokens = wireOutcomes
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean);
    assert.ok(
      outcomeTokens.length === 1 &&
        (outcomeTokens[0] === 'passed' || outcomeTokens[0] === '2'),
      `Expected wire outcomes to filter exclusively for Passed ("passed" or "2"), got ${JSON.stringify(wireOutcomes)}`,
    );
  });

  it('T5.3 [F17] get_build_test_results works on server-2019-rtm (5.0) via classic TestApi', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'server-2019-rtm' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      env: makeStandardEnv(mockAdo, { AZURE_DEVOPS_API_VERSION: '5.0' }),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'get_build_test_results');
    const runKey = resolvePropKey(tool, ['runId', 'buildId']);

    const res = await client.callTool('get_build_test_results', {
      projectId: 'DemoProject',
      [runKey]: 500,
    });
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    const serialized = JSON.stringify(data);
    assert.ok(serialized.includes('Auth.TokenSpec.shouldHandleExpiredToken'));
    assert.ok(serialized.includes('Expected 401 but received 500'));
    assert.ok(serialized.includes('Net.TimeoutSpec.shouldTimeout'));
    assert.equal(
      serialized.includes('Auth.TokenSpec.shouldAcceptValidPat'),
      false,
      'Default failure-focused outcomes on Server 2019 must exclude Passed tests',
    );

    const runsReq = mockAdo.requests.find(
      (req) =>
        req.method === 'GET' &&
        /^\/DemoProject\/_apis\/test\/runs$/i.test(req.relPath),
    );
    const resultsReq = mockAdo.requests.find(
      (req) =>
        req.method === 'GET' &&
        /^\/DemoProject\/_apis\/test\/runs\/700\/results$/i.test(req.relPath),
    );
    assert.ok(runsReq, 'Expected GET /DemoProject/_apis/test/runs on 2019');
    assert.ok(
      resultsReq,
      'Expected GET /DemoProject/_apis/test/Runs/700/results on 2019',
    );
    assert.equal(runsReq.apiVersion, '5.0');
    assert.equal(resultsReq.apiVersion, '5.0');
    assert.equal(
      mockAdo.requests.some((req) =>
        /\/_apis\/testresults\b/i.test(req.relPath),
      ),
      false,
    );
  });

  it('T5.4 [F18] retry_pipeline_stage retries failed stage Test on build 500 handling 204 No Content', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'retry_pipeline_stage');
    const runKey = resolvePropKey(tool, ['runId', 'buildId']);
    const stageKey = resolvePropKey(tool, [
      'stageRefName',
      'stageName',
      'stage',
    ]);

    const res = await client.callTool('retry_pipeline_stage', {
      projectId: 'DemoProject',
      [runKey]: 500,
      [stageKey]: 'Test',
    });
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    assertStageActionPayload(data, 500, 'Test');

    const patchReq = mockAdo.requests.find(
      (req) =>
        req.method === 'PATCH' &&
        /^\/DemoProject\/_apis\/build\/builds\/500\/stages\/Test$/i.test(
          req.relPath,
        ),
    );
    assert.ok(
      patchReq,
      'Expected PATCH /DemoProject/_apis/build/builds/500/stages/Test',
    );
    const wireState = patchReq.parsedBody?.state;
    assert.ok(
      wireState === 1 || String(wireState).toLowerCase() === 'retry',
      `Expected stage PATCH state 1 or "retry", got ${JSON.stringify(patchReq.parsedBody)}`,
    );

    assert.equal(mockAdo.state.builds[500].stages.Test.attempt, 2);
    assert.equal(mockAdo.state.builds[500].stages.Test.state, 'pending');
  });

  it('T5.5 [F18] retry_pipeline_stage resolves via pipelineName + buildNumber, passes forceRetryAllJobs: true on succeeded stage Build, and negotiates 6.0-preview.1 on server-2020', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'server-2020' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      env: makeStandardEnv(mockAdo, { AZURE_DEVOPS_API_VERSION: '6.0' }),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'retry_pipeline_stage');
    const stageKey = resolvePropKey(tool, [
      'stageRefName',
      'stageName',
      'stage',
    ]);

    const res = await client.callTool('retry_pipeline_stage', {
      projectId: 'DemoProject',
      pipelineName: 'CI-Main',
      buildNumber: '20261125.1',
      [stageKey]: 'Build',
      forceRetryAllJobs: true,
    });
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    assertStageActionPayload(data, 500, 'Build');

    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'GET' &&
          /\/_apis\/build\/definitions/i.test(req.relPath),
      ),
      'Expected pipeline name lookup via build definitions',
    );
    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'GET' &&
          /\/_apis\/build\/builds$/i.test(req.relPath) &&
          getQueryParamCI(req.query, 'buildNumber') === '20261125.1',
      ),
      'Expected build lookup via buildNumber=20261125.1',
    );

    const patchReq = mockAdo.requests.find(
      (req) =>
        req.method === 'PATCH' &&
        /^\/DemoProject\/_apis\/build\/builds\/500\/stages\/Build$/i.test(
          req.relPath,
        ),
    );
    assert.ok(
      patchReq,
      'Expected PATCH /DemoProject/_apis/build/builds/500/stages/Build on Server 2020',
    );
    assert.equal(
      patchReq.apiVersion,
      '6.0-preview.1',
      `Expected 6.0-preview.1 on Server 2020 build stages PATCH, got ${JSON.stringify(patchReq.apiVersion)}`,
    );
    assert.equal(patchReq.parsedBody?.forceRetryAllJobs, true);
    assert.equal(
      mockAdo.state.builds[500].stages.Build.lastForceRetryAllJobs,
      true,
    );
    assert.equal(mockAdo.state.builds[500].stages.Build.attempt, 2);
  });

  it('T5.6 [F18] retry_pipeline_stage cancels in-progress stage Deploy with state: cancel via withResolvedRun (pipelineName + buildNumber)', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'retry_pipeline_stage');
    const stageKey = resolvePropKey(tool, [
      'stageRefName',
      'stageName',
      'stage',
    ]);
    const stateKey = resolvePropKey(tool, ['state', 'action']);
    const cancelVal = resolveSchemaValue(tool, stateKey, ['cancel', 0]);

    const res = await client.callTool('retry_pipeline_stage', {
      projectId: 'DemoProject',
      pipelineName: 'CI-Main',
      buildNumber: '20261125.1',
      [stageKey]: 'Deploy',
      [stateKey]: cancelVal,
    });
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    assertStageActionPayload(data, 500, 'Deploy');

    const patchReq = mockAdo.requests.find(
      (req) =>
        req.method === 'PATCH' &&
        /^\/DemoProject\/_apis\/build\/builds\/500\/stages\/Deploy$/i.test(
          req.relPath,
        ),
    );
    assert.ok(
      patchReq,
      'Expected PATCH /DemoProject/_apis/build/builds/500/stages/Deploy',
    );
    const wireState = patchReq.parsedBody?.state;
    assert.ok(
      wireState === 0 || String(wireState).toLowerCase() === 'cancel',
      `Expected cancel PATCH state 0 or "cancel", got ${JSON.stringify(patchReq.parsedBody)}`,
    );
    assert.equal(
      mockAdo.state.builds[500].stages.Deploy.state,
      'canceling',
      'Expected mockAdo.state.builds[500].stages.Deploy.state === "canceling"',
    );
  });
});

describe('Tier 1 — Area 7: Sprints / Iterations (work Toolset) (F19)', () => {
  it('T5.7 [F19] work toolset registers all 4 read-only sprint tools (--toolsets work) with full ToolAnnotations', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      args: ['--toolsets', 'work'],
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();

    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      'get_iteration_work_items',
      'get_team_settings',
      'list_iterations',
      'list_team_iterations',
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

  it('T5.8 [F19] list_iterations fetches project iteration hierarchy tree ($depth >= 1) returning BOTH integer id and UUID identifier', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    requireTool(tools, 'list_iterations');

    const res = await client.callTool('list_iterations', {
      projectId: 'DemoProject',
    });
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    const nodes = collectObjectsRecursive(data);

    const sprint1 = nodes.find((n) => n.name === 'Sprint 1');
    const sprint2 = nodes.find((n) => n.name === 'Sprint 2');
    const sprint3 = nodes.find((n) => n.name === 'Sprint 3');

    assert.ok(sprint1, 'Expected Sprint 1 node in list_iterations response');
    assert.ok(sprint2, 'Expected Sprint 2 node in list_iterations response');
    assert.ok(sprint3, 'Expected Sprint 3 node in list_iterations response');

    assert.equal(
      sprint1.id,
      101,
      `Expected Sprint 1 integer id === 101, got ${JSON.stringify(sprint1)}`,
    );
    assert.equal(
      sprint1.identifier,
      SPRINT_1_UUID,
      `Expected Sprint 1 UUID identifier === ${SPRINT_1_UUID}, got ${JSON.stringify(sprint1)}`,
    );
    assert.equal(
      sprint2.id,
      102,
      `Expected Sprint 2 integer id === 102, got ${JSON.stringify(sprint2)}`,
    );
    assert.equal(
      sprint2.identifier,
      SPRINT_2_UUID,
      `Expected Sprint 2 UUID identifier === ${SPRINT_2_UUID}, got ${JSON.stringify(sprint2)}`,
    );
    assert.equal(
      sprint3.id,
      103,
      `Expected Sprint 3 integer id === 103, got ${JSON.stringify(sprint3)}`,
    );
    assert.equal(
      sprint3.identifier,
      SPRINT_3_UUID,
      `Expected Sprint 3 UUID identifier === ${SPRINT_3_UUID}, got ${JSON.stringify(sprint3)}`,
    );

    const nodeReq = mockAdo.requests.find(
      (req) =>
        req.method === 'GET' &&
        /^\/DemoProject\/_apis\/wit\/classificationnodes(?:\/(iterations|1)(?:\/.*)?)?$/i.test(
          req.relPath,
        ),
    );
    assert.ok(
      nodeReq,
      'Expected GET /DemoProject/_apis/wit/classificationNodes/iterations',
    );
    const depthParam = getQueryParamCI(nodeReq.query, '$depth');
    assert.ok(
      depthParam !== undefined && Number.parseInt(depthParam, 10) >= 1,
      `Expected $depth >= 1 so children are populated, got query=${JSON.stringify(nodeReq.query)}`,
    );
  });

  it('T5.9 [F19] list_team_iterations lists all team iterations and sends $timeframe=current on wire for current sprint', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'list_team_iterations');
    const tfKey = resolvePropKey(tool, ['timeframe', 'timeFrame']);

    // 1. All team iterations
    const allRes = await client.callTool('list_team_iterations', {
      projectId: 'DemoProject',
    });
    const allIters = extractListItems(
      unwrapToolResultJson(allRes, { expectSpotlighted: true }),
      ['iterations'],
    );
    assert.deepEqual(
      allIters
        .map((i) => String(i.name))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
      ['Sprint 1', 'Sprint 2', 'Sprint 3'],
    );

    // 2. Current sprint — must send $timeframe=current on wire
    mockAdo.clearRequests();
    const currentRes = await client.callTool('list_team_iterations', {
      projectId: 'DemoProject',
      [tfKey]: resolveSchemaValue(tool, tfKey, ['current', 'Current']),
    });
    const currentIters = extractListItems(
      unwrapToolResultJson(currentRes, { expectSpotlighted: true }),
      ['iterations'],
    );
    assert.equal(
      currentIters.length,
      1,
      `Expected only Sprint 2 for timeframe=current, got ${JSON.stringify(currentIters)}`,
    );
    assert.equal(currentIters[0].name, 'Sprint 2');
    assert.equal(currentIters[0].id, SPRINT_2_UUID);

    const currentReq = mockAdo.requests.find(
      (req) =>
        req.method === 'GET' &&
        /\/_apis\/work\/teamsettings\/iterations$/i.test(req.relPath),
    );
    assert.ok(currentReq, 'Expected GET .../work/teamsettings/iterations');
    assert.equal(
      String(
        getQueryParamCI(currentReq.query, '$timeframe') ?? '',
      ).toLowerCase(),
      'current',
      `Expected $timeframe=current on wire for timeframe: "current", got query=${JSON.stringify(currentReq.query)}`,
    );
  });

  it('T5.10 [F19] list_team_iterations filters past and future client-side WITHOUT sending invalid $timeframe=past|future to ADO', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'list_team_iterations');
    const tfKey = resolvePropKey(tool, ['timeframe', 'timeFrame']);

    const pastRes = await client.callTool('list_team_iterations', {
      projectId: 'DemoProject',
      [tfKey]: resolveSchemaValue(tool, tfKey, ['past', 'Past']),
    });
    const pastIters = extractListItems(
      unwrapToolResultJson(pastRes, { expectSpotlighted: true }),
      ['iterations'],
    );
    assert.equal(pastIters.length, 1);
    assert.equal(pastIters[0].name, 'Sprint 1');
    assert.equal(pastIters[0].id, SPRINT_1_UUID);

    const futureRes = await client.callTool('list_team_iterations', {
      projectId: 'DemoProject',
      [tfKey]: resolveSchemaValue(tool, tfKey, ['future', 'Future']),
    });
    const futureIters = extractListItems(
      unwrapToolResultJson(futureRes, { expectSpotlighted: true }),
      ['iterations'],
    );
    assert.equal(futureIters.length, 1);
    assert.equal(futureIters[0].name, 'Sprint 3');
    assert.equal(futureIters[0].id, SPRINT_3_UUID);

    const iterReqs = mockAdo.requests.filter(
      (req) =>
        req.method === 'GET' &&
        /\/_apis\/work\/teamsettings\/iterations$/i.test(req.relPath),
    );
    assert.ok(
      iterReqs.length >= 2,
      'Expected GET .../work/teamsettings/iterations calls for past and future',
    );
    for (const req of iterReqs) {
      const tf = getQueryParamCI(req.query, '$timeframe');
      assert.equal(
        tf,
        undefined,
        `Must NEVER send $timeframe=${tf} on wire for past/future (ADO returns 400); query=${JSON.stringify(req.query)}`,
      );
    }
  });

  it('T5.11 [F19] get_team_settings retrieves sprint settings and optional area paths (teamfieldvalues)', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'get_team_settings');
    const teamKey = resolvePropKey(tool, ['teamId', 'team'], {
      required: false,
    });
    const areaKey = resolvePropKey(
      tool,
      ['includeAreaPaths', 'includeTeamFieldValues', 'includeAreas'],
      { required: false },
    );

    const args = {
      projectId: 'DemoProject',
    };
    if (areaKey) {
      args[areaKey] = true;
    }
    if (teamKey) {
      args[teamKey] = 'DemoProject Team';
    }

    const res = await client.callTool('get_team_settings', args);
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    const serialized = JSON.stringify(data);
    const allObjs = collectObjectsRecursive(data);

    assert.ok(
      allObjs.some((o) => o.defaultIterationMacro === '@CurrentIteration'),
      `Expected defaultIterationMacro "@CurrentIteration", got: ${serialized.slice(0, 400)}`,
    );

    const settingsObj = allObjs.find(
      (o) =>
        Object.hasOwn(o, 'bugsBehavior') || Object.hasOwn(o, 'workingDays'),
    );
    assert.ok(
      settingsObj,
      `Expected team settings object with bugsBehavior/workingDays, got: ${serialized.slice(0, 400)}`,
    );
    assert.ok(
      settingsObj.bugsBehavior === 1 ||
        (typeof settingsObj.bugsBehavior === 'string' &&
          settingsObj.bugsBehavior.toLowerCase() === 'asrequirements'),
      `Expected bugsBehavior "asRequirements" (or BugsBehavior.AsRequirements = 1), got ${JSON.stringify(settingsObj.bugsBehavior)}`,
    );
    assert.ok(
      allObjs.some((o) => o.id === ROOT_ITER_UUID),
      `Expected backlogIteration.id ${ROOT_ITER_UUID}, got: ${serialized.slice(0, 400)}`,
    );

    assert.ok(
      Array.isArray(settingsObj.workingDays) &&
        settingsObj.workingDays.length === 5,
      `Expected 5 workingDays (Mon-Fri), got ${JSON.stringify(settingsObj.workingDays)}`,
    );
    const expectedDayNums = [1, 2, 3, 4, 5];
    const expectedDayNames = [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
    ];
    const matchesNumericDays = settingsObj.workingDays.every(
      (d, idx) => d === expectedDayNums[idx],
    );
    const matchesStringDays = settingsObj.workingDays.every(
      (d, idx) =>
        typeof d === 'string' && d.toLowerCase() === expectedDayNames[idx],
    );
    assert.ok(
      matchesNumericDays || matchesStringDays,
      `Expected workingDays Monday..Friday (names or DayOfWeek 1..5), got ${JSON.stringify(settingsObj.workingDays)}`,
    );

    assert.ok(
      allObjs.some((o) =>
        Object.values(o).some((v) => v === 'DemoProject\\Backend'),
      ) || serialized.includes('DemoProject\\\\Backend'),
      `Expected area path DemoProject\\Backend from teamfieldvalues, got: ${serialized.slice(0, 400)}`,
    );
    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'GET' &&
          /\/_apis\/work\/teamsettings\/teamfieldvalues$/i.test(req.relPath),
      ),
      'Expected GET .../work/teamsettings/teamfieldvalues',
    );

    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'GET' &&
          /\/_apis\/work\/teamsettings$/i.test(req.relPath),
      ),
      'Expected GET .../work/teamsettings',
    );
  });

  it('T5.12 [F19] get_iteration_work_items fetches Sprint 2 work item relations by UUID and supports optional hydrated work item details', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'get_iteration_work_items');
    const hydrateKey = resolvePropKey(tool, [
      'includeWorkItemDetails',
      'includeDetails',
      'includeWorkItems',
      'hydrate',
    ]);
    const requiredFields = new Set(tool.inputSchema?.required ?? []);
    const teamKey = resolvePropKey(tool, ['teamId', 'team'], {
      required: false,
    });
    const baseArgs = {
      projectId: 'DemoProject',
      iterationId: SPRINT_2_UUID,
    };
    if (teamKey && requiredFields.has(teamKey)) {
      baseArgs[teamKey] = 'DemoProject Team';
    }

    // 1. Relations by UUID
    const res1 = await client.callTool('get_iteration_work_items', baseArgs);
    const data1 = unwrapToolResultJson(res1, { expectSpotlighted: true });
    const ids1 = extractWorkItemIds(data1);
    assert.equal(
      ids1.has(101),
      true,
      `Expected work item ID 101 in Sprint 2 relations, got IDs [${[...ids1].join(', ')}]`,
    );
    assert.equal(
      ids1.has(102),
      true,
      `Expected work item ID 102 in Sprint 2 relations, got IDs [${[...ids1].join(', ')}]`,
    );
    assert.equal(
      ids1.has(103),
      false,
      'Work item 103 is not in Sprint 2 relations and must be absent',
    );

    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'GET' &&
          new RegExp(
            `/_apis/work/teamsettings/iterations/${SPRINT_2_UUID}/workitems$`,
            'i',
          ).test(req.relPath),
      ),
      `Expected GET .../work/teamsettings/iterations/${SPRINT_2_UUID}/workitems`,
    );

    // 2. Hydrated work item details
    mockAdo.clearRequests();
    const res2 = await client.callTool('get_iteration_work_items', {
      ...baseArgs,
      [hydrateKey]: true,
    });
    const data2 = unwrapToolResultJson(res2, { expectSpotlighted: true });
    const ser2 = JSON.stringify(data2);
    assert.ok(
      ser2.includes('Implement OData Analytics'),
      'Expected hydrated title for WI 101',
    );
    assert.ok(
      ser2.includes('Add stage retry handler'),
      'Expected hydrated title for WI 102',
    );
    assert.equal(
      ser2.includes('Fix flaky login test'),
      false,
      'Hydrated Sprint 2 response must not include WI 103 title',
    );
    assert.ok(
      mockAdo.requests.some((req) =>
        /\/_apis\/wit\/workitems/i.test(req.relPath),
      ),
      'Expected WIT hydration request when includeWorkItemDetails is true',
    );
  });

  it('T5.13 [F19] get_iteration_work_items auto-negotiates 5.0-preview.1 on server-2019-rtm', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'server-2019-rtm' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      env: makeStandardEnv(mockAdo, { AZURE_DEVOPS_API_VERSION: '5.0' }),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'get_iteration_work_items');
    const requiredFields = new Set(tool.inputSchema?.required ?? []);
    const teamKey = resolvePropKey(tool, ['teamId', 'team'], {
      required: false,
    });
    const callArgs = {
      projectId: 'DemoProject',
      iterationId: SPRINT_2_UUID,
    };
    if (teamKey && requiredFields.has(teamKey)) {
      callArgs[teamKey] = 'DemoProject Team';
    }

    const res = await client.callTool('get_iteration_work_items', callArgs);
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    const ids = extractWorkItemIds(data);
    assert.equal(
      ids.has(101),
      true,
      `Expected work item ID 101 on Server 2019 RTM, got IDs [${[...ids].join(', ')}]`,
    );
    assert.equal(
      ids.has(102),
      true,
      `Expected work item ID 102 on Server 2019 RTM, got IDs [${[...ids].join(', ')}]`,
    );
    assert.equal(
      ids.has(103),
      false,
      'Work item 103 is not in Sprint 2 relations and must be absent',
    );

    const iterWiReq = mockAdo.requests.find(
      (req) =>
        req.method === 'GET' &&
        new RegExp(
          `/_apis/work/teamsettings/iterations/${SPRINT_2_UUID}/workitems$`,
          'i',
        ).test(req.relPath),
    );
    assert.ok(
      iterWiReq,
      'Expected GET .../iterations/{uuid}/workitems on Server 2019 RTM',
    );
    assert.equal(
      iterWiReq.apiVersion,
      '5.0-preview.1',
      `Expected auto-negotiated api-version 5.0-preview.1 on Server 2019 RTM, got ${JSON.stringify(iterWiReq.apiVersion)}`,
    );
  });
});
