import assert from 'node:assert/strict';
import http from 'node:http';
import { describe, test } from 'node:test';
import { unwrapToolResultText } from '../harness/assertions.mjs';
import { createStdioMcpClient } from '../harness/mcp-stdio-client.mjs';
import { buildODataError } from '../harness/mock-ado-profiles.mjs';
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

function findTool(listResult, name) {
  const tool = (listResult?.tools ?? []).find((item) => item.name === name);
  assert.ok(tool, `Expected tool "${name}" to be registered in tools/list`);
  return tool;
}

function resolveProp(toolDef, candidates) {
  const props = toolDef?.inputSchema?.properties ?? {};
  return candidates.find((key) => Object.hasOwn(props, key)) ?? candidates[0];
}

function formatSelectArg(toolDef, selectKey, columns) {
  const propSchema = toolDef?.inputSchema?.properties?.[selectKey];
  if (propSchema?.type === 'array') {
    return columns;
  }
  return columns.join(',');
}

function getODataEntityRequests(mockAdo) {
  return mockAdo.requests.filter(
    (r) => r.relPath.includes('/_odata/') && !/\/\$metadata$/i.test(r.relPath),
  );
}

const NEXT_LINK_KEYS = new Set([
  'nextLink',
  '@odata.nextLink',
  'odataNextLink',
  'continuationUrl',
  'nextPageUrl',
]);

function assertNoCanaryNextLink(value, canaryUrl, depth = 0, seen = new Set()) {
  if (!value || typeof value !== 'object' || depth > 8 || seen.has(value)) {
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoCanaryNextLink(item, canaryUrl, depth + 1, seen);
    }
    return;
  }
  for (const [key, entryVal] of Object.entries(value)) {
    if (NEXT_LINK_KEYS.has(key)) {
      assert.notEqual(
        entryVal,
        canaryUrl,
        `Cross-origin @odata.nextLink MUST NOT be blindly echoed as trusted ${key}`,
      );
    }
    if (entryVal && typeof entryVal === 'object') {
      assertNoCanaryNextLink(entryVal, canaryUrl, depth + 1, seen);
    }
  }
}

function startLoopbackCanaryServer() {
  return new Promise((resolve, reject) => {
    let hitCount = 0;
    const server = http.createServer((req, res) => {
      hitCount += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ value: [{ leaked: true }] }));
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to bind canary loopback server'));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}/steal?token=secret`,
        getHits: () => hitCount,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
            server.closeAllConnections?.();
          }),
      });
    });
  });
}

describe('Tier 2 Boundaries — Azure DevOps OData Analytics (Area 8, F20–F21)', () => {
  // =========================================================================
  // All 7 [BLOCKED] OData Rules — 7 Dedicated Tests
  // =========================================================================

  test('Area 8 (F21 [BLOCKED #1]): blocks non-aggregated WorkItemSnapshot query with $apply aggregation guidance', async (t) => {
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
    const queryTool = findTool(listRes, 'query_analytics');
    const entityKey = resolveProp(queryTool, ['entitySet', 'entity']);

    mockAdo.clearRequests();
    const res = await client.callTool('query_analytics', {
      projectId: 'DemoProject',
      [entityKey]: 'WorkItemSnapshot',
    });
    assert.equal(
      res.isError,
      true,
      'Expected unaggregated WorkItemSnapshot query to return isError: true',
    );
    const { text } = unwrapToolResultText(res, { allowError: true });
    assert.match(
      text,
      /apply|aggregat|snapshot|VS403483/i,
      `Expected aggregation/$apply guidance, got: ${text}`,
    );
    assert.equal(
      getODataEntityRequests(mockAdo).length,
      0,
      'Expected client-side Poka-yoke guard to block unaggregated WorkItemSnapshot before hitting mock ADO',
    );
    client.assertCleanStdout();
  });

  test('Area 8 (F21 [BLOCKED #2]): blocks entity key addressing (WorkItems(123), WorkItems(123)/AssignedTo) and path traversal (../Areas)', async (t) => {
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
    const queryTool = findTool(listRes, 'query_analytics');
    const entityKey = resolveProp(queryTool, ['entitySet', 'entity']);

    mockAdo.clearRequests();
    for (const badEntity of [
      'WorkItems(123)',
      'WorkItems(123)/AssignedTo',
      '../Areas',
    ]) {
      const res = await client.callTool('query_analytics', {
        projectId: 'DemoProject',
        [entityKey]: badEntity,
      });
      assert.equal(
        res.isError,
        true,
        `Expected entitySet "${badEntity}" to be rejected with isError: true`,
      );
      const { text } = unwrapToolResultText(res, { allowError: true });
      assert.match(
        text,
        /entity|invalid|blocked|allowed|path|parenthes|traversal|key|addressing|VS403483/i,
        `Expected entitySet validation guidance for "${badEntity}", got: ${text}`,
      );
    }

    const traversalReqs = mockAdo.requests.filter(
      (r) =>
        r.url.includes('..') ||
        r.url.toLowerCase().includes('%2e%2e') ||
        r.pathname.includes('/Areas'),
    );
    assert.equal(
      traversalReqs.length,
      0,
      `Expected zero path-traversal requests to hit mock ADO, saw: ${traversalReqs.map((r) => r.url).join(', ')}`,
    );
    assert.equal(
      getODataEntityRequests(mockAdo).length,
      0,
      'Expected client-side Poka-yoke guard to block entity key addressing & path traversal before hitting mock ADO',
    );
    client.assertCleanStdout();
  });

  test('Area 8 (F21 [BLOCKED #3]): blocks $expand=Revisions on WorkItems with WorkItemRevisions / VS403483 guidance', async (t) => {
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
    const queryTool = findTool(listRes, 'query_analytics');
    const entityKey = resolveProp(queryTool, ['entitySet', 'entity']);
    const expandKey = resolveProp(queryTool, ['expand', '$expand']);

    mockAdo.clearRequests();
    const res = await client.callTool('query_analytics', {
      projectId: 'DemoProject',
      [entityKey]: 'WorkItems',
      [expandKey]: 'Revisions',
    });
    assert.equal(
      res.isError,
      true,
      'Expected $expand=Revisions on WorkItems to return isError: true',
    );
    const { text } = unwrapToolResultText(res, { allowError: true });
    assert.match(
      text,
      /WorkItemRevisions|Revisions|VS403483|expand/i,
      `Expected WorkItemRevisions/VS403483 guidance, got: ${text}`,
    );
    assert.equal(
      getODataEntityRequests(mockAdo).length,
      0,
      'Expected client-side Poka-yoke guard to block $expand=Revisions before hitting mock ADO',
    );
    client.assertCleanStdout();
  });

  test('Area 8 (F21 [BLOCKED #4]): blocks high-cardinality unique-key groupby (WorkItemId) / VS403522 cleanly', async (t) => {
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
    const queryTool = findTool(listRes, 'query_analytics');
    const entityKey = resolveProp(queryTool, ['entitySet', 'entity']);
    const applyKey = resolveProp(queryTool, ['apply', '$apply']);

    mockAdo.clearRequests();
    const res = await client.callTool('query_analytics', {
      projectId: 'DemoProject',
      [entityKey]: 'WorkItems',
      [applyKey]: 'groupby((WorkItemId), aggregate($count as Count))',
    });
    assert.equal(
      res.isError,
      true,
      'Expected high-cardinality groupby((WorkItemId)) to return isError: true',
    );
    const { text } = unwrapToolResultText(res, { allowError: true });
    assert.match(
      text,
      /VS403522|cardinality|WorkItemId|groupby|unique/i,
      `Expected high-cardinality / VS403522 guidance, got: ${text}`,
    );
    assert.equal(
      getODataEntityRequests(mockAdo).length,
      0,
      'Expected client-side Poka-yoke guard to block high-cardinality groupby((WorkItemId)) before hitting mock ADO',
    );
    client.assertCleanStdout();
  });

  test('Area 8 (F21 [BLOCKED #5]): blocks unsupported countdistinct aggregation cleanly', async (t) => {
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
    const queryTool = findTool(listRes, 'query_analytics');
    const entityKey = resolveProp(queryTool, ['entitySet', 'entity']);
    const applyKey = resolveProp(queryTool, ['apply', '$apply']);

    mockAdo.clearRequests();
    const res = await client.callTool('query_analytics', {
      projectId: 'DemoProject',
      [entityKey]: 'WorkItems',
      [applyKey]: 'aggregate(WorkItemId with countdistinct as DistinctCount)',
    });
    assert.equal(
      res.isError,
      true,
      'Expected countdistinct aggregation to return isError: true',
    );
    const { text } = unwrapToolResultText(res, { allowError: true });
    assert.match(
      text,
      /countdistinct|VS403483|not supported|unsupported|blocked/i,
      `Expected countdistinct rejection guidance, got: ${text}`,
    );
    assert.equal(
      getODataEntityRequests(mockAdo).length,
      0,
      'Expected client-side Poka-yoke guard to block countdistinct before hitting mock ADO',
    );
    client.assertCleanStdout();
  });

  test('Area 8 (F21 [BLOCKED #6]): handles >3,000-char query via single-op POST $batch or explicit pre-flight rejection (never raw 404)', async (t) => {
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
    const queryTool = findTool(listRes, 'query_analytics');
    const entityKey = resolveProp(queryTool, ['entitySet', 'entity']);
    const selectKey = resolveProp(queryTool, ['select', '$select']);
    const filterKey = resolveProp(queryTool, ['filter', '$filter']);

    const longFilter = Array.from(
      { length: 180 },
      (_, idx) => `WorkItemId eq ${101 + idx}`,
    ).join(' or ');
    assert.ok(
      longFilter.length > 3000,
      'Sanity check: filter exceeds 3000 chars',
    );

    mockAdo.clearRequests();
    const res = await client.callTool('query_analytics', {
      projectId: 'DemoProject',
      [entityKey]: 'WorkItems',
      [selectKey]: formatSelectArg(queryTool, selectKey, [
        'WorkItemId',
        'Title',
        'State',
      ]),
      [filterKey]: longFilter,
    });

    // Must NEVER silently issue an over-3000-char GET that hits ADO's misleading 404!
    const overlongGets = mockAdo.requests.filter(
      (r) =>
        r.method === 'GET' &&
        r.relPath.includes('/_odata/') &&
        `${mockAdo.baseUrl}${r.url}`.length > 3000,
    );
    assert.equal(
      overlongGets.length,
      0,
      'Must NEVER send a >3,000-character OData GET URL that triggers misleading 404',
    );

    if (res.isError !== true) {
      const batchPosts = mockAdo.requests.filter(
        (r) =>
          r.method === 'POST' && /\/_odata\/[^/]+\/\$batch$/i.test(r.relPath),
      );
      assert.ok(
        batchPosts.length >= 1,
        'Expected auto-upgrade to POST .../_odata/{ver}/$batch for >3,000-char query',
      );
      const innerGetLines = (batchPosts[0].body.match(/^GET\s+/gm) ?? [])
        .length;
      assert.equal(
        innerGetLines,
        1,
        `OData $batch MUST contain exactly 1 inner GET operation (never multi-op), saw ${innerGetLines}`,
      );
      const { text } = unwrapToolResultText(res);
      assert.match(text, /101/);
    } else {
      const { text } = unwrapToolResultText(res, { allowError: true });
      assert.match(
        text,
        /3[,.]?000|length|too long|\$batch|batch/i,
        `Expected actionable >3,000-char length/$batch guidance (not raw 404), got: ${text}`,
      );
    }
    client.assertCleanStdout();
  });

  test('Area 8 (F21 [BLOCKED #7]): guards >800 columns (VS403670) on both explicit >800 select and wide-schema collection', async (t) => {
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
    const queryTool = findTool(listRes, 'query_analytics');
    const entityKey = resolveProp(queryTool, ['entitySet', 'entity']);
    const selectKey = resolveProp(queryTool, ['select', '$select']);

    // Part A: Explicit 805 columns in select MUST be rejected client-side
    const wideColumns = Array.from(
      { length: 805 },
      (_, idx) => `Custom_Col${idx}`,
    );
    mockAdo.clearRequests();
    const explicitWideRes = await client.callTool('query_analytics', {
      projectId: 'DemoProject',
      [entityKey]: 'WorkItems',
      [selectKey]: formatSelectArg(queryTool, selectKey, wideColumns),
    });
    assert.equal(
      explicitWideRes.isError,
      true,
      'Expected explicit >800 columns in select to return isError: true',
    );
    const { text: explicitText } = unwrapToolResultText(explicitWideRes, {
      allowError: true,
    });
    assert.match(explicitText, /800|select|column|VS403670/i);
    assert.equal(
      getODataEntityRequests(mockAdo).length,
      0,
      'Expected client-side Poka-yoke guard to block explicit >800 column select before hitting mock ADO',
    );

    // Part B: Collection with 850 columns queried without select -> either injects safe default $select (200) OR surfaces VS403670/$select guidance
    mockAdo.mutateState((st) => {
      st.analytics.wideSchemaColumns = 850;
    });
    mockAdo.clearRequests();

    const defaultWideRes = await client.callTool('query_analytics', {
      projectId: 'DemoProject',
      [entityKey]: 'WorkItems',
    });

    if (defaultWideRes.isError !== true) {
      const odataGets = mockAdo.requests.filter(
        (r) =>
          r.method === 'GET' && /\/_odata\/[^/]+\/WorkItems/i.test(r.relPath),
      );
      assert.ok(
        odataGets.some(
          (r) =>
            Object.hasOwn(r.query, '$select') &&
            String(r.query.$select).trim().length > 0,
        ),
        'If wide-schema query succeeds without explicit select, tool MUST inject a safe default $select on the wire',
      );
    } else {
      const { text: wideText } = unwrapToolResultText(defaultWideRes, {
        allowError: true,
      });
      assert.match(
        wideText,
        /\$select|select|800|column|VS403670/i,
        `Expected actionable $select/VS403670 guidance on wide schema, got: ${wideText}`,
      );
    }
    client.assertCleanStdout();
  });

  // =========================================================================
  // Additional 5 OData Security, Timezone, Profile & Limit Boundaries
  // =========================================================================

  test('Area 8 (F21): DateTimeOffset missing timezone fails with VS403494/timezone guidance while +05:30 offset is %2B-encoded and succeeds', async (t) => {
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
    const queryTool = findTool(listRes, 'query_analytics');
    const entityKey = resolveProp(queryTool, ['entitySet', 'entity']);
    const selectKey = resolveProp(queryTool, ['select', '$select']);
    const filterKey = resolveProp(queryTool, ['filter', '$filter']);

    // Part A: Missing timezone offset -> rejected client-side with actionable timezone / VS403494 error
    mockAdo.clearRequests();
    const missingTzRes = await client.callTool('query_analytics', {
      projectId: 'DemoProject',
      [entityKey]: 'WorkItems',
      [selectKey]: formatSelectArg(queryTool, selectKey, [
        'WorkItemId',
        'ChangedDate',
      ]),
      [filterKey]: 'ChangedDate ge 2026-11-01T00:00:00',
    });
    assert.equal(
      missingTzRes.isError,
      true,
      'Expected DateTimeOffset without timezone to return isError: true',
    );
    const { text: tzErrText } = unwrapToolResultText(missingTzRes, {
      allowError: true,
    });
    assert.match(tzErrText, /timezone|offset|VS403494|ISO|UTC\b/i);
    assert.equal(
      getODataEntityRequests(mockAdo).length,
      0,
      'Expected client-side Poka-yoke guard to block timezone-less DateTimeOffset before hitting mock ADO',
    );

    // Part B: Positive +05:30 timezone offset MUST be %2B-encoded on the wire and succeed
    mockAdo.clearRequests();
    const validTzRes = await client.callTool('query_analytics', {
      projectId: 'DemoProject',
      [entityKey]: 'WorkItems',
      [selectKey]: formatSelectArg(queryTool, selectKey, [
        'WorkItemId',
        'ChangedDate',
      ]),
      [filterKey]: 'ChangedDate ge 2026-11-01T00:00:00+05:30',
    });
    assert.notEqual(
      validTzRes.isError,
      true,
      `Expected +05:30 DateTimeOffset query to succeed, got: ${JSON.stringify(validTzRes)}`,
    );

    const odataReqs = mockAdo.requests.filter((r) =>
      r.relPath.includes('/_odata/'),
    );
    assert.ok(odataReqs.length >= 1, 'Expected recorded OData request');
    const hasEncodedPlus = odataReqs.some(
      (r) =>
        r.url.toLowerCase().includes('%2b') ||
        r.body.toLowerCase().includes('%2b'),
    );
    assert.equal(
      hasEncodedPlus,
      true,
      `Expected positive '+' timezone offset to be percent-encoded as %2B on wire, saw urls=${odataReqs.map((r) => r.url).join(', ')}`,
    );
    client.assertCleanStdout();
  });

  test('Area 8 (F20/F21): blocks cross-origin @odata.nextLink SSRF redirection and rejects untrusted nextLink input', async (t) => {
    const canary = await startLoopbackCanaryServer();
    t.after(async () => {
      await canary.close();
    });

    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      mockAdo.injectNextLink(null);
      await mockAdo.close();
    });

    // Different loopback port = different HTTP origin (safe SSRF proof with zero external DNS)
    mockAdo.injectNextLink(canary.url);

    const client = createStdioMcpClient({
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await client.close();
    });

    await client.initialize();
    const listRes = await client.listTools();
    const queryTool = findTool(listRes, 'query_analytics');
    const entityKey = resolveProp(queryTool, ['entitySet', 'entity']);
    const selectKey = resolveProp(queryTool, ['select', '$select']);
    const props = queryTool.inputSchema?.properties ?? {};

    // Query returning cross-origin @odata.nextLink must NEVER follow it off-origin or blindly echo it as trusted
    mockAdo.clearRequests();
    const res = await client.callTool('query_analytics', {
      projectId: 'DemoProject',
      [entityKey]: 'WorkItems',
      [selectKey]: formatSelectArg(queryTool, selectKey, [
        'WorkItemId',
        'Title',
      ]),
    });
    assert.equal(
      mockAdo.requests.some((r) => r.relPath.includes('/_odata/')),
      true,
      'Expected query_analytics to fetch page 1 from mock ADO carrying cross-origin @odata.nextLink',
    );
    assert.equal(
      canary.getHits(),
      0,
      `SSRF violation: cross-origin @odata.nextLink hit canary server ${canary.getHits()} time(s)!`,
    );

    if (res.isError === true) {
      const { text: errText } = unwrapToolResultText(res, { allowError: true });
      assert.match(
        errText,
        /origin|same-origin|untrusted|nextLink|redirect|host/i,
        `Expected same-origin / untrusted nextLink error when rejecting cross-origin @odata.nextLink, got: ${errText}`,
      );
    } else {
      const { text: pageText } = unwrapToolResultText(res);
      assert.match(
        pageText,
        /101/,
        `Expected page-1 WorkItemId 101 in response, got: ${pageText}`,
      );
      let parsedPage = null;
      try {
        parsedPage = JSON.parse(pageText);
      } catch {
        // Plain-text response handled below
      }
      if (parsedPage && typeof parsedPage === 'object') {
        assertNoCanaryNextLink(parsedPage, canary.url);
      } else if (pageText.includes(canary.url)) {
        assert.match(
          pageText,
          /strip|block|reject|untrusted|same-origin|different origin/i,
          `Cross-origin @odata.nextLink URL appeared in text without explicit stripped/blocked warning: ${pageText}`,
        );
      }
    }

    // If a pagination-following parameter is exposed, re-test with pagination enabled
    const followKey = [
      'followNextLink',
      'followNextLinks',
      'allPages',
      'maxPages',
    ].find((k) => Object.hasOwn(props, k));
    if (followKey) {
      const followSchema = props[followKey];
      const followVal =
        followSchema?.type === 'number' || followSchema?.type === 'integer'
          ? 3
          : true;
      mockAdo.clearRequests();
      const pagedRes = await client.callTool('query_analytics', {
        projectId: 'DemoProject',
        [entityKey]: 'WorkItems',
        [selectKey]: formatSelectArg(queryTool, selectKey, [
          'WorkItemId',
          'Title',
        ]),
        [followKey]: followVal,
      });
      assert.equal(
        mockAdo.requests.some((r) => r.relPath.includes('/_odata/')),
        true,
        'Expected paginated query_analytics call to fetch page 1 from mock ADO',
      );
      assert.equal(
        canary.getHits(),
        0,
        `SSRF violation: paginated query_analytics (${followKey}=${followVal}) contacted canary ${canary.getHits()} time(s)!`,
      );
      if (pagedRes.isError === true) {
        const { text: pagedErr } = unwrapToolResultText(pagedRes, {
          allowError: true,
        });
        assert.match(
          pagedErr,
          /origin|same-origin|untrusted|nextLink|redirect|host/i,
        );
      }
    }

    // If nextLink parameter is exposed on query_analytics, direct cross-origin URLs MUST be rejected
    const nextLinkKey = [
      'nextLink',
      'odataNextLink',
      'continuationUrl',
      'nextPageUrl',
    ].find((k) => Object.hasOwn(props, k));
    if (nextLinkKey) {
      for (const evilUrl of ['https://evil.example/steal', canary.url]) {
        const nextRes = await client.callTool('query_analytics', {
          projectId: 'DemoProject',
          [entityKey]: 'WorkItems',
          [nextLinkKey]: evilUrl,
        });
        assert.equal(
          nextRes.isError,
          true,
          `Expected cross-origin ${nextLinkKey} (${evilUrl}) to be rejected with isError: true`,
        );
        const { text } = unwrapToolResultText(nextRes, { allowError: true });
        assert.match(
          text,
          /origin|same-origin|untrusted|invalid|host|allowed/i,
        );
      }
      assert.equal(
        canary.getHits(),
        0,
        'SSRF violation: direct cross-origin nextLink parameter contacted canary server!',
      );
    }
    client.assertCleanStdout();
  });

  test('Area 8 (F21): server-2019-rtm with analyticsEnabled=false (404) returns clear Analytics-disabled guidance', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'server-2019-rtm',
      analyticsEnabled: false,
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
    const queryTool = findTool(listRes, 'query_analytics');
    const entityKey = resolveProp(queryTool, ['entitySet', 'entity']);
    const selectKey = resolveProp(queryTool, ['select', '$select']);

    const res = await client.callTool('query_analytics', {
      projectId: 'DemoProject',
      [entityKey]: 'WorkItems',
      [selectKey]: formatSelectArg(queryTool, selectKey, [
        'WorkItemId',
        'Title',
      ]),
    });
    assert.equal(
      res.isError,
      true,
      'Expected Analytics-disabled server-2019-rtm to return isError: true',
    );
    const { text } = unwrapToolResultText(res, { allowError: true });
    assert.match(
      text,
      /analytics|enabled|installed|version|not available|404/i,
      `Expected Analytics-disabled guidance, got: ${text}`,
    );
    client.assertCleanStdout();
  });

  test('Area 8 (F21): HTTP 403 missing View analytics permission returns clear permission guidance', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    mockAdo.setNextError(
      (r) => r.method !== 'OPTIONS' && r.relPath.includes('/_odata/'),
      {
        status: 403,
        body: buildODataError(
          'VS403483',
          'Access denied: View analytics permission is required.',
        ),
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
    const queryTool = findTool(listRes, 'query_analytics');
    const entityKey = resolveProp(queryTool, ['entitySet', 'entity']);
    const selectKey = resolveProp(queryTool, ['select', '$select']);

    const res = await client.callTool('query_analytics', {
      projectId: 'DemoProject',
      [entityKey]: 'WorkItems',
      [selectKey]: formatSelectArg(queryTool, selectKey, [
        'WorkItemId',
        'Title',
      ]),
    });
    assert.equal(
      res.isError,
      true,
      'Expected HTTP 403 on OData endpoint to return isError: true',
    );
    const { text } = unwrapToolResultText(res, { allowError: true });
    assert.match(
      text,
      /permission|View analytics|vso\.analytics|denied|403/i,
      `Expected permission guidance for 403 Analytics error, got: ${text}`,
    );
    client.assertCleanStdout();
  });

  test('Area 8 (F21): excessive $top (50000) is clamped to <= 1000 on wire or rejected cleanly', async (t) => {
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
    const queryTool = findTool(listRes, 'query_analytics');
    const entityKey = resolveProp(queryTool, ['entitySet', 'entity']);
    const selectKey = resolveProp(queryTool, ['select', '$select']);
    const topKey = resolveProp(queryTool, ['top', '$top', 'maxResults']);

    mockAdo.clearRequests();
    const res = await client.callTool('query_analytics', {
      projectId: 'DemoProject',
      [entityKey]: 'WorkItems',
      [selectKey]: formatSelectArg(queryTool, selectKey, [
        'WorkItemId',
        'Title',
      ]),
      [topKey]: 50000,
    });

    if (res.isError !== true) {
      const odataGets = mockAdo.requests.filter(
        (r) => r.method === 'GET' && r.relPath.includes('/_odata/'),
      );
      assert.ok(odataGets.length >= 1, 'Expected recorded OData GET request');
      for (const req of odataGets) {
        assert.ok(
          Object.hasOwn(req.query, '$top') &&
            Number(req.query.$top) >= 1 &&
            Number(req.query.$top) <= 1000,
          `Expected excessive $top=50000 to be clamped to [1..1000] on wire, got $top=${req.query.$top}`,
        );
      }
    } else {
      const { text: errText } = unwrapToolResultText(res, { allowError: true });
      assert.match(
        errText,
        /1000|top|max|limit|range|invalid/i,
        `Expected validation error for $top=50000, got: ${errText}`,
      );
      const unclampedReqs = mockAdo.requests.filter(
        (r) =>
          r.relPath.includes('/_odata/') &&
          Object.hasOwn(r.query, '$top') &&
          Number(r.query.$top) > 1000,
      );
      assert.equal(
        unclampedReqs.length,
        0,
        `Expected zero /_odata/ wire requests with $top > 1000 when rejecting, got ${unclampedReqs.length}`,
      );
    }
    client.assertCleanStdout();
  });
});
