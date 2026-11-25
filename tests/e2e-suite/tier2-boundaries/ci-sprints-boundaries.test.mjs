import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { unwrapToolResultText } from '../harness/assertions.mjs';
import { createStdioMcpClient } from '../harness/mcp-stdio-client.mjs';
import { createMockAdoServer } from '../harness/mock-ado-server.mjs';

const TEST_PAT = 'e2e-tier2-pat-secret-0123456789';
const SPRINT_2_UUID = '10000000-0000-4000-8000-000000000002';

function makePatEnv(orgUrl, extra = {}) {
  return {
    AZURE_DEVOPS_ORG_URL: orgUrl,
    AZURE_DEVOPS_AUTH_METHOD: 'pat',
    AZURE_DEVOPS_PAT: TEST_PAT,
    AZURE_DEVOPS_DEFAULT_PROJECT: 'DemoProject',
    ...extra,
  };
}

function findTool(listResult, name) {
  const tool = (listResult?.tools ?? []).find((item) => item.name === name);
  assert.ok(tool, `Expected tool "${name}" to be registered in tools/list`);
  return tool;
}

function resolveProp(toolDef, candidates) {
  const props = toolDef?.inputSchema?.properties ?? {};
  return candidates.find((key) => Object.hasOwn(props, key)) ?? candidates[0];
}

function resolveEnumValue(toolDef, propName, targetLower) {
  const schema = toolDef?.inputSchema?.properties?.[propName];
  if (schema && Array.isArray(schema.enum)) {
    const match = schema.enum.find(
      (v) => typeof v === 'string' && v.toLowerCase() === targetLower,
    );
    if (match !== undefined) {
      return match;
    }
  }
  return targetLower;
}

describe('Tier 2 Boundaries — CI Debugging Superpowers & Sprints/Iterations (Areas 6–7, F17–F19)', () => {
  // =========================================================================
  // Area 6: CI Debugging Superpowers (F17–F18) — 6 tests
  // =========================================================================

  test('Area 6 (F17): get_build_test_results enforces $top <= 200 for detailsToInclude != None and rejects top > 1000 for None', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const client = createStdioMcpClient({
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await client.close();
    });

    await client.initialize();
    const listRes = await client.listTools();
    const testTool = findTool(listRes, 'get_build_test_results');
    const runKey = resolveProp(testTool, ['runId', 'buildId']);
    const topKey = resolveProp(testTool, ['top', 'maxResults', 'limit']);
    const detailsKey = resolveProp(testTool, ['detailsToInclude', 'details']);
    const subResultsVal = resolveEnumValue(testTool, detailsKey, 'subresults');
    const noneVal = resolveEnumValue(testTool, detailsKey, 'none');

    // Part A: detailsToInclude != None with top=250 must either reject OR cap wire $top <= 200
    mockAdo.clearRequests();
    const detailsRes = await client.callTool('get_build_test_results', {
      projectId: 'DemoProject',
      [runKey]: 500,
      [detailsKey]: subResultsVal,
      [topKey]: 250,
    });
    if (detailsRes.isError !== true) {
      const resultGets = mockAdo.requests.filter(
        (r) =>
          r.method === 'GET' &&
          /\/_apis\/test\/runs\/\d+\/results/i.test(r.relPath),
      );
      assert.ok(
        resultGets.length >= 1,
        'Expected GET .../test/runs/{id}/results request when capped',
      );
      for (const req of resultGets) {
        assert.ok(
          Object.hasOwn(req.query, '$top') &&
            Number(req.query.$top) >= 1 &&
            Number(req.query.$top) <= 200,
          `Expected wire $top in [1..200] when detailsToInclude != None, got $top=${req.query.$top}`,
        );
      }
    } else {
      const { text: detailsErrText } = unwrapToolResultText(detailsRes, {
        allowError: true,
      });
      assert.match(
        detailsErrText,
        /200|top|max|limit|range|invalid/i,
        `Expected validation error for detailsToInclude != None with top=250, got: ${detailsErrText}`,
      );
      const unclampedReqs = mockAdo.requests.filter(
        (r) =>
          r.method === 'GET' &&
          /\/_apis\/test\/runs\/\d+\/results/i.test(r.relPath) &&
          Object.hasOwn(r.query, '$top') &&
          Number(r.query.$top) > 200,
      );
      assert.equal(
        unclampedReqs.length,
        0,
        `Expected zero wire requests with $top > 200 when rejecting, got ${unclampedReqs.length}`,
      );
    }

    // Part B: detailsToInclude = None with top=1001 must reject OR cap wire $top <= 1000
    mockAdo.clearRequests();
    const overMaxRes = await client.callTool('get_build_test_results', {
      projectId: 'DemoProject',
      [runKey]: 500,
      [detailsKey]: noneVal,
      [topKey]: 1001,
    });
    if (overMaxRes.isError !== true) {
      const resultGets = mockAdo.requests.filter(
        (r) =>
          r.method === 'GET' &&
          /\/_apis\/test\/runs\/\d+\/results/i.test(r.relPath),
      );
      assert.ok(
        resultGets.length >= 1,
        'Expected GET .../test/runs/{id}/results request when clamping top=1001',
      );
      for (const req of resultGets) {
        assert.ok(
          Object.hasOwn(req.query, '$top') &&
            Number(req.query.$top) >= 1 &&
            Number(req.query.$top) <= 1000,
          `Expected wire $top in [1..1000] when clamping top=1001, got $top=${req.query.$top}`,
        );
      }
    } else {
      const { text: overMaxText } = unwrapToolResultText(overMaxRes, {
        allowError: true,
      });
      assert.match(
        overMaxText,
        /1000|top|max|limit|range|invalid/i,
        `Expected validation error for top=1001, got: ${overMaxText}`,
      );
      const unclampedReqs = mockAdo.requests.filter(
        (r) =>
          r.method === 'GET' &&
          /\/_apis\/test\/runs\/\d+\/results/i.test(r.relPath) &&
          Object.hasOwn(r.query, '$top') &&
          Number(r.query.$top) > 1000,
      );
      assert.equal(
        unclampedReqs.length,
        0,
        `Expected zero wire requests with $top > 1000 when rejecting, got ${unclampedReqs.length}`,
      );
    }
    client.assertCleanStdout();
  });

  test('Area 6 (F17): get_build_test_results returns clean empty summary for build 501 with zero test runs', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    mockAdo.mutateState((st) => {
      st.builds[501] = {
        ...structuredClone(st.builds[500]),
        id: 501,
        buildNumber: '20261125.2',
        name: '20261125.2',
        result: 'succeeded',
        url: `${mockAdo.collectionUrl}/DemoProject/_apis/build/builds/501`,
      };
    });

    const client = createStdioMcpClient({
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await client.close();
    });

    await client.initialize();
    const listRes = await client.listTools();
    const testTool = findTool(listRes, 'get_build_test_results');
    const runKey = resolveProp(testTool, ['runId', 'buildId']);

    mockAdo.clearRequests();
    const res = await client.callTool('get_build_test_results', {
      projectId: 'DemoProject',
      [runKey]: 501,
    });
    assert.notEqual(
      res.isError,
      true,
      `Expected clean empty summary for 0-test-run build 501, got: ${JSON.stringify(res)}`,
    );
    assert.equal(
      mockAdo.requests.some(
        (r) =>
          r.method === 'GET' &&
          r.relPath.toLowerCase().includes('/_apis/test/runs') &&
          String(r.query.buildUri ?? r.url).includes('501'),
      ),
      true,
      'Expected GET /_apis/test/runs query referencing build 501',
    );

    const { text } = unwrapToolResultText(res);
    assert.ok(text.length > 0, 'Expected non-empty summary payload');
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Tool may return structured text summary instead of JSON; verify below
    }
    const recognizedKeys = [
      'results',
      'testResults',
      'failures',
      'runs',
      'testRuns',
      'totalTests',
      'totalRuns',
      'failedTests',
      'count',
      'summary',
    ];
    const numericCountKeys = new Set([
      'totalTests',
      'totalRuns',
      'failedTests',
      'count',
    ]);
    if (Array.isArray(parsed)) {
      assert.equal(
        parsed.length,
        0,
        `Expected zero test runs/results for build 501, got ${parsed.length}`,
      );
    } else if (parsed && typeof parsed === 'object') {
      assert.equal(
        recognizedKeys.some((k) => Object.hasOwn(parsed, k)),
        true,
        `Expected recognized test-results summary keys in JSON response, got keys: ${Object.keys(parsed).join(', ')}`,
      );
      const assertEmptySummaryObject = (obj, prefix) => {
        for (const [k, v] of Object.entries(obj)) {
          if (Array.isArray(v)) {
            assert.equal(
              v.length,
              0,
              `Expected empty array for ${prefix}${k} on build 501, got length ${v.length}`,
            );
          } else if (numericCountKeys.has(k) && typeof v === 'number') {
            assert.equal(
              v,
              0,
              `Expected ${prefix}${k} === 0 on build 501, got ${v}`,
            );
          }
        }
      };
      assertEmptySummaryObject(parsed, '');
      if (
        parsed.summary &&
        typeof parsed.summary === 'object' &&
        !Array.isArray(parsed.summary)
      ) {
        assertEmptySummaryObject(parsed.summary, 'summary.');
      }
    } else {
      assert.match(text, /\b0\b|no test|empty|none/i);
    }
    client.assertCleanStdout();
  });

  test('Area 6 (F17): get_build_test_results rejects invalid outcome value (BogusOutcome)', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const client = createStdioMcpClient({
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await client.close();
    });

    await client.initialize();
    const listRes = await client.listTools();
    const testTool = findTool(listRes, 'get_build_test_results');
    const runKey = resolveProp(testTool, ['runId', 'buildId']);
    const outcomesKey = resolveProp(testTool, ['outcomes', 'outcome']);

    const res = await client.callTool('get_build_test_results', {
      projectId: 'DemoProject',
      [runKey]: 500,
      [outcomesKey]: ['BogusOutcome'],
    });
    assert.equal(
      res.isError,
      true,
      'Expected invalid outcome BogusOutcome to return isError: true',
    );
    const { text } = unwrapToolResultText(res, { allowError: true });
    assert.match(text, /outcome|BogusOutcome|invalid/i);
    client.assertCleanStdout();
  });

  test('Area 6 (F17): get_build_test_results handles missing build 999999 (404) cleanly and stays healthy', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const client = createStdioMcpClient({
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await client.close();
    });

    await client.initialize();
    const listRes = await client.listTools();
    const testTool = findTool(listRes, 'get_build_test_results');
    const runKey = resolveProp(testTool, ['runId', 'buildId']);

    mockAdo.setNextError(
      (r) =>
        r.method === 'GET' &&
        r.url.includes('999999') &&
        (r.relPath.toLowerCase().includes('/_apis/test/runs') ||
          r.relPath.toLowerCase().includes('/_apis/build/builds/')),
      {
        status: 404,
        body: {
          message: 'Build 999999 not found.',
          typeKey: 'BuildNotFoundException',
        },
      },
    );

    const errRes = await client.callTool('get_build_test_results', {
      projectId: 'DemoProject',
      [runKey]: 999999,
    });
    assert.equal(errRes.isError, true);
    const { text } = unwrapToolResultText(errRes, { allowError: true });
    assert.match(text, /999999|not found|404/i);

    const okRes = await client.callTool('get_build_test_results', {
      projectId: 'DemoProject',
      [runKey]: 500,
    });
    assert.notEqual(
      okRes.isError,
      true,
      'Expected server to remain healthy for build 500 after 404 on 999999',
    );
    client.assertCleanStdout();
  });

  test('Area 6 (F18): retry_pipeline_stage on server-2019-rtm (5.0) returns actionable Server 2020+/Services guidance', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'server-2019-rtm',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const client = createStdioMcpClient({
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await client.close();
    });

    await client.initialize();
    const listRes = await client.listTools();
    const retryTool = findTool(listRes, 'retry_pipeline_stage');
    const runKey = resolveProp(retryTool, ['runId', 'buildId']);
    const stageKey = resolveProp(retryTool, [
      'stageRefName',
      'stageName',
      'stage',
    ]);

    const res = await client.callTool('retry_pipeline_stage', {
      projectId: 'DemoProject',
      [runKey]: 500,
      [stageKey]: 'Test',
    });
    assert.equal(
      res.isError,
      true,
      'Expected retry_pipeline_stage to fail cleanly on server-2019-rtm',
    );
    const { text } = unwrapToolResultText(res, { allowError: true });
    assert.match(
      text,
      /2019|2020|services|not supported|unsupported|not available|6\.0/i,
      `Expected actionable Server 2020+/Services error message, got: ${text}`,
    );
    client.assertCleanStdout();
  });

  test('Area 6 (F18): retry_pipeline_stage rejects inProgress Deploy, succeeded Build without forceRetryAllJobs, and NonExistentStage', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const client = createStdioMcpClient({
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await client.close();
    });

    await client.initialize();
    const listRes = await client.listTools();
    const retryTool = findTool(listRes, 'retry_pipeline_stage');
    const runKey = resolveProp(retryTool, ['runId', 'buildId']);
    const stageKey = resolveProp(retryTool, [
      'stageRefName',
      'stageName',
      'stage',
    ]);

    // 1. Deploy (inProgress) -> 400
    const deployRes = await client.callTool('retry_pipeline_stage', {
      projectId: 'DemoProject',
      [runKey]: 500,
      [stageKey]: 'Deploy',
    });
    assert.equal(
      deployRes.isError,
      true,
      'Expected retrying inProgress Deploy stage to return isError: true',
    );
    const { text: deployText } = unwrapToolResultText(deployRes, {
      allowError: true,
    });
    assert.match(deployText, /Deploy|inProgress|cannot|retry/i);

    // 2. Build (succeeded) without forceRetryAllJobs -> 400
    const buildRes = await client.callTool('retry_pipeline_stage', {
      projectId: 'DemoProject',
      [runKey]: 500,
      [stageKey]: 'Build',
    });
    assert.equal(
      buildRes.isError,
      true,
      'Expected retrying succeeded Build stage without forceRetryAllJobs to return isError: true',
    );
    const { text: buildText } = unwrapToolResultText(buildRes, {
      allowError: true,
    });
    assert.match(buildText, /Build|succeeded|forceRetryAllJobs/i);

    // 3. NonExistentStage -> 400/404
    const missingRes = await client.callTool('retry_pipeline_stage', {
      projectId: 'DemoProject',
      [runKey]: 500,
      [stageKey]: 'NonExistentStage',
    });
    assert.equal(
      missingRes.isError,
      true,
      'Expected retrying NonExistentStage to return isError: true',
    );
    const { text: missingText } = unwrapToolResultText(missingRes, {
      allowError: true,
    });
    assert.match(missingText, /NonExistentStage|does not exist|not found/i);

    // 4. Confirm server stays healthy and handles empty 204 body on valid failed stage Test
    mockAdo.clearRequests();
    const okRes = await client.callTool('retry_pipeline_stage', {
      projectId: 'DemoProject',
      [runKey]: 500,
      [stageKey]: 'Test',
    });
    assert.notEqual(
      okRes.isError,
      true,
      `Expected valid retry of failed Test stage (204 No Content) to succeed, got: ${JSON.stringify(okRes)}`,
    );
    assert.equal(
      mockAdo.requests.some(
        (r) =>
          r.method === 'PATCH' &&
          /\/builds\/500\/stages\/Test$/i.test(r.relPath),
      ),
      true,
      'Expected PATCH .../builds/500/stages/Test wire request for 204 No Content stage retry',
    );
    client.assertCleanStdout();
  });

  // =========================================================================
  // Area 7: Sprints / Iterations (`work` Toolset) (F19) — 6 tests
  // =========================================================================

  test("Area 7 (F19): list_team_iterations with timeframe='past' filters client-side to Sprint 1 and NEVER sends $timeframe=past", async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const client = createStdioMcpClient({
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await client.close();
    });

    await client.initialize();
    const listRes = await client.listTools();
    const iterTool = findTool(listRes, 'list_team_iterations');
    const teamKey = resolveProp(iterTool, ['teamId', 'team']);
    const timeframeKey = resolveProp(iterTool, ['timeframe', 'timeFrame']);

    mockAdo.clearRequests();
    const res = await client.callTool('list_team_iterations', {
      projectId: 'DemoProject',
      [teamKey]: 'DemoProject Team',
      [timeframeKey]: resolveEnumValue(iterTool, timeframeKey, 'past'),
    });
    assert.notEqual(
      res.isError,
      true,
      `Expected list_team_iterations(timeframe='past') to succeed via client-side filtering, got: ${JSON.stringify(res)}`,
    );

    const iterGets = mockAdo.requests.filter(
      (r) =>
        r.method === 'GET' &&
        /\/_apis\/work\/teamsettings\/iterations$/i.test(r.relPath),
    );
    assert.ok(
      iterGets.length >= 1,
      'Expected GET .../work/teamsettings/iterations wire call',
    );
    for (const req of iterGets) {
      assert.equal(
        Object.hasOwn(req.query, '$timeframe'),
        false,
        `list_team_iterations MUST NEVER send $timeframe=past on wire, saw query=${JSON.stringify(req.query)}`,
      );
    }

    const { text } = unwrapToolResultText(res);
    assert.match(text, /Sprint 1/);
    assert.doesNotMatch(
      text,
      /Sprint 2/,
      'Expected current Sprint 2 to be filtered out for timeframe=past',
    );
    assert.doesNotMatch(
      text,
      /Sprint 3/,
      'Expected future Sprint 3 to be filtered out for timeframe=past',
    );
    client.assertCleanStdout();
  });

  test("Area 7 (F19): list_team_iterations with timeframe='future' filters client-side to Sprint 3 and NEVER sends $timeframe=future", async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const client = createStdioMcpClient({
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await client.close();
    });

    await client.initialize();
    const listRes = await client.listTools();
    const iterTool = findTool(listRes, 'list_team_iterations');
    const teamKey = resolveProp(iterTool, ['teamId', 'team']);
    const timeframeKey = resolveProp(iterTool, ['timeframe', 'timeFrame']);

    mockAdo.clearRequests();
    const res = await client.callTool('list_team_iterations', {
      projectId: 'DemoProject',
      [teamKey]: 'DemoProject Team',
      [timeframeKey]: resolveEnumValue(iterTool, timeframeKey, 'future'),
    });
    assert.notEqual(
      res.isError,
      true,
      `Expected list_team_iterations(timeframe='future') to succeed via client-side filtering, got: ${JSON.stringify(res)}`,
    );

    const iterGets = mockAdo.requests.filter(
      (r) =>
        r.method === 'GET' &&
        /\/_apis\/work\/teamsettings\/iterations$/i.test(r.relPath),
    );
    assert.ok(
      iterGets.length >= 1,
      'Expected GET .../work/teamsettings/iterations wire call',
    );
    for (const req of iterGets) {
      assert.equal(
        Object.hasOwn(req.query, '$timeframe'),
        false,
        `list_team_iterations MUST NEVER send $timeframe=future on wire, saw query=${JSON.stringify(req.query)}`,
      );
    }

    const { text } = unwrapToolResultText(res);
    assert.match(text, /Sprint 3/);
    assert.doesNotMatch(
      text,
      /Sprint 1/,
      'Expected past Sprint 1 to be filtered out for timeframe=future',
    );
    assert.doesNotMatch(
      text,
      /Sprint 2/,
      'Expected current Sprint 2 to be filtered out for timeframe=future',
    );
    client.assertCleanStdout();
  });

  test('Area 7 (F19): get_iteration_work_items rejects non-UUID integer iterationId ("102", "42")', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const client = createStdioMcpClient({
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await client.close();
    });

    await client.initialize();
    const listRes = await client.listTools();
    const iterWiTool = findTool(listRes, 'get_iteration_work_items');
    const teamKey = resolveProp(iterWiTool, ['teamId', 'team']);

    mockAdo.clearRequests();
    for (const badId of ['102', '42']) {
      const res = await client.callTool('get_iteration_work_items', {
        projectId: 'DemoProject',
        [teamKey]: 'DemoProject Team',
        iterationId: badId,
      });
      assert.equal(
        res.isError,
        true,
        `Expected non-UUID iterationId "${badId}" to return isError: true`,
      );
      const { text } = unwrapToolResultText(res, { allowError: true });
      assert.match(text, /uuid|guid|iterationId|invalid/i);
    }
    const badIterationGets = mockAdo.requests.filter(
      (r) =>
        r.method === 'GET' &&
        /\/iterations\/(?:102|42)\/workitems/i.test(r.relPath),
    );
    assert.equal(
      badIterationGets.length,
      0,
      `Expected client-side UUID check with 0 wire GETs for non-UUID iterationIds, got ${badIterationGets.length}`,
    );
    client.assertCleanStdout();
  });

  test('Area 7 (F19): get_iteration_work_items negotiates 5.0-preview.1 on server-2019-rtm and 6.0-preview.1 on server-2020', async (t) => {
    const matrix = [
      { profile: 'server-2019-rtm', expectedVersion: '5.0-preview.1' },
      { profile: 'server-2020', expectedVersion: '6.0-preview.1' },
    ];

    for (const { profile, expectedVersion } of matrix) {
      const mockAdo = await createMockAdoServer({
        profile,
        expectedPat: TEST_PAT,
      });
      t.after(async () => {
        await mockAdo.close();
      });

      const client = createStdioMcpClient({
        env: makePatEnv(mockAdo.collectionUrl),
      });
      t.after(async () => {
        await client.close();
      });

      await client.initialize();
      const listRes = await client.listTools();
      const iterWiTool = findTool(listRes, 'get_iteration_work_items');
      const teamKey = resolveProp(iterWiTool, ['teamId', 'team']);

      mockAdo.clearRequests();
      const res = await client.callTool('get_iteration_work_items', {
        projectId: 'DemoProject',
        [teamKey]: 'DemoProject Team',
        iterationId: SPRINT_2_UUID,
      });
      assert.notEqual(
        res.isError,
        true,
        `Expected get_iteration_work_items to succeed on ${profile}, got: ${JSON.stringify(res)}`,
      );

      const wiReqs = mockAdo.requests.filter(
        (r) =>
          r.method === 'GET' &&
          new RegExp(
            `/_apis/work/teamsettings/iterations/${SPRINT_2_UUID}/workitems$`,
            'i',
          ).test(r.relPath),
      );
      assert.ok(
        wiReqs.length >= 1,
        `Expected GET .../iterations/${SPRINT_2_UUID}/workitems on ${profile}`,
      );
      assert.equal(
        wiReqs[0].apiVersion,
        expectedVersion,
        `Expected api-version ${expectedVersion} on ${profile}, got ${wiReqs[0].apiVersion}`,
      );

      const { text } = unwrapToolResultText(res);
      assert.match(text, /101/);
      assert.match(text, /102/);
      client.assertCleanStdout();
    }
  });

  test('Area 7 (F19): list_iterations rejects negative depth (-1)', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const client = createStdioMcpClient({
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await client.close();
    });

    await client.initialize();
    const listRes = await client.listTools();
    findTool(listRes, 'list_iterations');

    const res = await client.callTool('list_iterations', {
      projectId: 'DemoProject',
      depth: -1,
    });
    assert.equal(
      res.isError,
      true,
      'Expected negative depth (-1) on list_iterations to return isError: true',
    );
    const { text } = unwrapToolResultText(res, { allowError: true });
    assert.match(text, /depth|negative|non-negative|>=|min|invalid/i);
    client.assertCleanStdout();
  });

  test('Area 7 (F19): get_team_settings handles nonexistent team 404 gracefully', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    mockAdo.setNextError(
      (r) =>
        r.method === 'GET' &&
        r.relPath.toLowerCase().includes('/_apis/work/teamsettings') &&
        r.relPath.toLowerCase().includes('missingteam'),
      {
        status: 404,
        once: false,
        body: {
          message: "Team 'MissingTeam' not found.",
          typeKey: 'TeamNotFoundException',
        },
      },
    );

    const client = createStdioMcpClient({
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await client.close();
    });

    await client.initialize();
    const listRes = await client.listTools();
    const settingsTool = findTool(listRes, 'get_team_settings');
    const teamKey = resolveProp(settingsTool, ['teamId', 'team']);

    const res = await client.callTool('get_team_settings', {
      projectId: 'DemoProject',
      [teamKey]: 'MissingTeam',
    });
    assert.equal(
      res.isError,
      true,
      'Expected nonexistent team 404 on get_team_settings to return isError: true',
    );
    const { text } = unwrapToolResultText(res, { allowError: true });
    assert.match(text, /not found|MissingTeam|404/i);
    client.assertCleanStdout();
  });
});
