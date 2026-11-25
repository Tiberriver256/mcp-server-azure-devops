import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { unwrapToolResultText } from '../harness/assertions.mjs';
import { createStdioMcpClient } from '../harness/mcp-stdio-client.mjs';
import { buildVssVersionOutOfRangeError } from '../harness/mock-ado-profiles.mjs';
import { createMockAdoServer } from '../harness/mock-ado-server.mjs';

const TEST_PAT = 'e2e-tier2-pat-secret-0123456789';
const CLOUD_HOSTS = [
  'almsearch.dev.azure.com',
  'analytics.dev.azure.com',
  'vssps.dev.azure.com',
  'dev.azure.com',
];

function makePatEnv(orgUrl, extra = {}) {
  return {
    AZURE_DEVOPS_ORG_URL: orgUrl,
    AZURE_DEVOPS_AUTH_METHOD: 'pat',
    AZURE_DEVOPS_PAT: TEST_PAT,
    AZURE_DEVOPS_DEFAULT_PROJECT: 'DemoProject',
    ...extra,
  };
}

describe('Tier 2 Boundaries — On-Prem api-version Compatibility & Direct-HTTP Resilience (Area 11, F26)', () => {
  test('Area 11 (F26): HTTP 400 VssVersionOutOfRangeException maps to clean non-crashing MCP error and server stays healthy', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'server-2019-rtm',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    let injectVersionError = true;
    mockAdo.setNextError(
      (r) =>
        injectVersionError &&
        r.method !== 'OPTIONS' &&
        r.relPath.includes('/_apis/wiki/'),
      {
        status: 400,
        once: false,
        body: buildVssVersionOutOfRangeError('7.1', '5.0'),
      },
    );

    const client = createStdioMcpClient({
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await client.close();
    });

    await client.initialize();
    const errRes = await client.callTool('get_wiki_page', {
      projectId: 'DemoProject',
      wikiId: 'DemoProject.wiki',
      pagePath: '/Home',
    });
    assert.equal(
      errRes.isError,
      true,
      'Expected HTTP 400 VssVersionOutOfRangeException to return isError: true',
    );
    const { text: errText } = unwrapToolResultText(errRes, {
      allowError: true,
    });
    assert.match(
      errText,
      /out of range|api version|7\.1|5\.0/i,
      `Expected version out-of-range guidance, got: ${errText}`,
    );

    // Disable persistent error rule and verify server stays healthy for subsequent valid requests
    injectVersionError = false;
    const okRes = await client.callTool('get_wiki_page', {
      projectId: 'DemoProject',
      wikiId: 'DemoProject.wiki',
      pagePath: '/Home',
    });
    assert.notEqual(
      okRes.isError,
      true,
      `Expected subsequent get_wiki_page to succeed cleanly, got: ${JSON.stringify(okRes)}`,
    );
    client.assertCleanStdout();
  });

  test('Area 11 (F26): HTTP 203 HTML sign-in redirect maps to Authentication Failed (never raw HTML as success)', async (t) => {
    // Part A: Non-OPTIONS, non-Location HTTP 203 HTML sign-in redirect on direct-HTTP wiki calls
    const mock203 = await createMockAdoServer({
      profile: 'server-2022',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mock203.close();
    });

    mock203.setNextError(
      (r) => r.method !== 'OPTIONS' && r.relPath.includes('/_apis/wiki/'),
      {
        status: 203,
        once: false,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: '<!DOCTYPE html><html><head><title>Sign In</title></head><body>Sign in to Azure DevOps</body></html>',
      },
    );

    const wiki203Client = createStdioMcpClient({
      env: makePatEnv(mock203.collectionUrl),
    });
    t.after(async () => {
      await wiki203Client.close();
    });

    await wiki203Client.initialize();

    const wikiPageRes = await wiki203Client.callTool('get_wiki_page', {
      projectId: 'DemoProject',
      wikiId: 'DemoProject.wiki',
      pagePath: '/Home',
    });
    assert.equal(
      wikiPageRes.isError,
      true,
      'Expected HTTP 203 HTML sign-in redirect on get_wiki_page to return isError: true',
    );
    const { text: wikiPageErr } = unwrapToolResultText(wikiPageRes, {
      allowError: true,
    });
    assert.match(
      wikiPageErr,
      /Authentication Failed/i,
      `Expected Authentication Failed mapping on HTTP 203, got: ${wikiPageErr}`,
    );
    assert.doesNotMatch(
      wikiPageErr,
      /<!doctype\s+html|<html\b/i,
      'Must never echo raw HTML sign-in page inside get_wiki_page error output',
    );

    const wikiListRes = await wiki203Client.callTool('list_wiki_pages', {
      projectId: 'DemoProject',
      wikiId: 'DemoProject.wiki',
    });
    assert.equal(
      wikiListRes.isError,
      true,
      'Expected HTTP 203 HTML sign-in redirect on list_wiki_pages to return isError: true',
    );
    const { text: wikiListErr } = unwrapToolResultText(wikiListRes, {
      allowError: true,
    });
    assert.match(wikiListErr, /Authentication Failed/i);
    assert.doesNotMatch(
      wikiListErr,
      /<!doctype\s+html|<html\b/i,
      'Must never echo raw HTML sign-in page inside list_wiki_pages error output',
    );
    wiki203Client.assertCleanStdout();

    // Part B: Non-OPTIONS injected HTTP 203 HTML redirect on direct-HTTP search_code
    const mockSearch = await createMockAdoServer({
      profile: 'server-2022',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockSearch.close();
    });

    mockSearch.setNextError(
      (r) => r.method !== 'OPTIONS' && r.relPath.includes('/_apis/search/'),
      { status: 203 },
    );

    const searchClient = createStdioMcpClient({
      env: makePatEnv(mockSearch.collectionUrl),
    });
    t.after(async () => {
      await searchClient.close();
    });

    await searchClient.initialize();
    const searchRes = await searchClient.callTool('search_code', {
      projectId: 'DemoProject',
      searchText: 'greet',
    });
    assert.equal(
      searchRes.isError,
      true,
      'Expected HTTP 203 HTML sign-in redirect on search_code to return isError: true',
    );
    const { text: searchErr } = unwrapToolResultText(searchRes, {
      allowError: true,
    });
    assert.match(
      searchErr,
      /Authentication Failed/i,
      `Expected Authentication Failed mapping on search_code HTTP 203, got: ${searchErr}`,
    );
    assert.doesNotMatch(
      searchErr,
      /<!doctype\s+html|<html\b/i,
      'Must never echo raw HTML sign-in page inside search_code error output',
    );
    searchClient.assertCleanStdout();
  });

  test('Area 11 (F26): HTTP 429 with Retry-After: 15 maps to Rate Limit Exceeded including reset timestamp', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'server-2022',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    mockAdo.setNextError(
      (r) => r.method !== 'OPTIONS' && r.relPath.includes('/_apis/search/'),
      {
        status: 429,
        headers: { 'Retry-After': '15' },
        body: { message: 'TF400733: Rate limit exceeded.' },
      },
    );

    const client = createStdioMcpClient({
      env: makePatEnv(mockAdo.collectionUrl),
    });
    t.after(async () => {
      await client.close();
    });

    await client.initialize();
    const beforeMs = Date.now();
    const rateRes = await client.callTool('search_code', {
      projectId: 'DemoProject',
      searchText: 'greet',
    });
    assert.equal(
      rateRes.isError,
      true,
      'Expected HTTP 429 to return isError: true',
    );
    const { text: rateText } = unwrapToolResultText(rateRes, {
      allowError: true,
    });
    assert.match(
      rateText,
      /Rate Limit Exceeded/i,
      `Expected Rate Limit Exceeded error prefix, got: ${rateText}`,
    );
    const resetMatch =
      /resets at (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))/i.exec(
        rateText,
      );
    assert.ok(
      resetMatch,
      `Expected ISO-8601 reset timestamp in 429 error text, got: ${rateText}`,
    );
    const resetMs = Date.parse(resetMatch[1]);
    assert.ok(
      Number.isFinite(resetMs) &&
        resetMs >= beforeMs + 5_000 &&
        resetMs <= beforeMs + 35_000,
      `Expected Retry-After: 15 timestamp within [+5s..+35s] of request start (beforeMs=${beforeMs}), got ${resetMatch[1]} (delta=${resetMs - beforeMs}ms)`,
    );

    const recoveredRes = await client.callTool('search_code', {
      projectId: 'DemoProject',
      searchText: 'greet',
    });
    assert.notEqual(
      recoveredRes.isError,
      true,
      'Expected server to remain healthy after HTTP 429 error',
    );
    client.assertCleanStdout();
  });

  test('Area 11 (F26): server-2019-rtm (5.0) missing _apis/pipelines and wiki/pagesbatch return graceful errors without crashing', async (t) => {
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

    const pipeRes = await client.callTool('list_pipeline_runs', {
      projectId: 'DemoProject',
      pipelineId: 10,
    });
    assert.equal(
      pipeRes.isError,
      true,
      'Expected list_pipeline_runs on server-2019-rtm (missing _apis/pipelines) to return isError: true',
    );
    const { text: pipeErr } = unwrapToolResultText(pipeRes, {
      allowError: true,
    });
    assert.ok(pipeErr.trim().length > 0);
    assert.doesNotMatch(
      pipeErr,
      /TypeError|ReferenceError|SyntaxError|VssVersionOutOfRangeException/i,
      `Expected clean handled error on server-2019-rtm list_pipeline_runs, got: ${pipeErr}`,
    );
    assert.match(
      pipeErr,
      /not found|not available|not supported|unsupported|404|2019|2020/i,
      `Expected actionable missing-endpoint guidance for list_pipeline_runs on server-2019-rtm, got: ${pipeErr}`,
    );

    const wikiBatchRes = await client.callTool('list_wiki_pages', {
      projectId: 'DemoProject',
      wikiId: 'DemoProject.wiki',
    });
    assert.equal(
      wikiBatchRes.isError,
      true,
      'Expected list_wiki_pages on server-2019-rtm (missing wiki/pagesbatch) to return isError: true',
    );
    const { text: wikiErr } = unwrapToolResultText(wikiBatchRes, {
      allowError: true,
    });
    assert.ok(wikiErr.trim().length > 0);
    assert.doesNotMatch(
      wikiErr,
      /TypeError|ReferenceError|SyntaxError|VssVersionOutOfRangeException/i,
      `Expected clean handled error on server-2019-rtm list_wiki_pages, got: ${wikiErr}`,
    );
    assert.match(
      wikiErr,
      /not found|not available|not supported|unsupported|404|2019|2020/i,
      `Expected actionable missing-endpoint guidance for list_wiki_pages on server-2019-rtm, got: ${wikiErr}`,
    );

    // Server must remain completely healthy for supported 5.0 calls
    const projectsRes = await client.callTool('list_projects', {});
    assert.notEqual(
      projectsRes.isError,
      true,
      `Expected list_projects to succeed after 2019 missing-endpoint errors, got: ${JSON.stringify(projectsRes)}`,
    );
    const { text: projText } = unwrapToolResultText(projectsRes);
    assert.match(projText, /DemoProject/);
    client.assertCleanStdout();
  });

  test('Area 11 (F26): zero Cloud host requests or URLs on on-prem loopback URL and get_me fails locally', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'server-2022',
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
    mockAdo.clearRequests();

    const calls = [
      ['list_projects', {}],
      ['get_work_item', { workItemId: 101 }],
      ['search_code', { projectId: 'DemoProject', searchText: 'greet' }],
      [
        'get_wiki_page',
        {
          projectId: 'DemoProject',
          wikiId: 'DemoProject.wiki',
          pagePath: '/Home',
        },
      ],
    ];

    const outputs = [];
    for (const [toolName, args] of calls) {
      const res = await client.callTool(toolName, args);
      assert.notEqual(
        res.isError,
        true,
        `Expected on-prem ${toolName} to succeed on server-2022, got: ${JSON.stringify(res)}`,
      );
      outputs.push(unwrapToolResultText(res).text);
    }

    assert.ok(
      mockAdo.requests.length >= 4,
      'Expected all on-prem tool calls to hit loopback mock ADO server',
    );
    for (const req of mockAdo.requests) {
      assert.ok(
        req.pathname.startsWith('/tfs/DefaultCollection/'),
        `Expected request to stay on loopback collection path, saw ${req.pathname}`,
      );
      const hostHeader = String(req.headers.host ?? '');
      assert.ok(
        hostHeader.startsWith('127.0.0.1:'),
        `Expected loopback Host header, saw ${hostHeader}`,
      );
    }

    const combinedText = [...outputs, client.getStderr()]
      .join('\n')
      .toLowerCase();
    for (const cloudHost of CLOUD_HOSTS) {
      assert.equal(
        combinedText.includes(cloudHost),
        false,
        `Unexpected Cloud host "${cloudHost}" appeared in on-prem outputs/stderr`,
      );
    }

    // Cloud-only get_me MUST fail locally without contacting Cloud or mock ADO
    mockAdo.clearRequests();
    const meRes = await client.callTool('get_me', {});
    assert.equal(
      meRes.isError,
      true,
      'Expected Cloud-only get_me to fail cleanly on on-prem Server URL',
    );
    const { text: meErr } = unwrapToolResultText(meRes, { allowError: true });
    assert.match(meErr, /Azure DevOps Services|only available/i);
    assert.equal(
      mockAdo.requests.length,
      0,
      'Expected get_me on on-prem URL to fail before making any HTTP requests',
    );
    client.assertCleanStdout();
  });

  test('Area 11 (F26): Entra auth (azure-identity) is rejected fail-closed on on-prem loopback URL with zero mock ADO requests', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'server-2022',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const client = createStdioMcpClient({
      env: {
        AZURE_DEVOPS_ORG_URL: mockAdo.collectionUrl,
        AZURE_DEVOPS_AUTH_METHOD: 'azure-identity',
        AZURE_DEVOPS_DEFAULT_PROJECT: 'DemoProject',
      },
    });
    t.after(async () => {
      await client.close();
    });

    await client.initialize();
    const res = await client.callTool('list_projects', {});
    assert.equal(
      res.isError,
      true,
      'Expected Entra auth (azure-identity) on on-prem URL to return isError: true',
    );
    const { text } = unwrapToolResultText(res, { allowError: true });
    assert.match(text, /Authentication Failed/i);
    assert.match(text, /Personal Access Token/i);
    assert.equal(
      mockAdo.requests.length,
      0,
      `Expected zero requests to mock ADO when Entra auth is rejected on-prem, got ${mockAdo.requests.length}`,
    );
    client.assertCleanStdout();
  });

  test('Area 11 (F26): secret PAT and Base64 encodings NEVER leak into tool output, stderr, or stdout across error surfaces', async (t) => {
    const canaryPat = 'canary-e2e-pat-secret-9876543210';
    const b64ColonPat = Buffer.from(`:${canaryPat}`).toString('base64');
    const b64UserPat = Buffer.from(`PAT:${canaryPat}`).toString('base64');

    const mockAdo = await createMockAdoServer({
      profile: 'server-2022',
      expectedPat: canaryPat,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    mockAdo.setNextError(
      (r) => r.method !== 'OPTIONS' && r.relPath.includes('/_apis/wiki/'),
      {
        status: 500,
        body: {
          message: `Upstream failure calling https://pat-user:${canaryPat}@ado.local/tfs/DefaultCollection with Authorization: Basic ${b64ColonPat} and Basic ${b64UserPat}`,
        },
      },
    );

    mockAdo.setNextError(
      (r) => r.method !== 'OPTIONS' && r.relPath.includes('/_apis/search/'),
      {
        status: 401,
        body: {
          message: `Rejected header Authorization: Basic ${b64ColonPat} for https://svc:${canaryPat}@ado.local/tfs/DefaultCollection`,
        },
      },
    );

    const client = createStdioMcpClient({
      env: makePatEnv(mockAdo.collectionUrl, {
        AZURE_DEVOPS_PAT: canaryPat,
      }),
    });
    t.after(async () => {
      await client.close();
    });

    await client.initialize();

    const wikiErrRes = await client.callTool('get_wiki_page', {
      projectId: 'DemoProject',
      wikiId: 'DemoProject.wiki',
      pagePath: '/Home',
    });
    assert.equal(wikiErrRes.isError, true);
    const { text: wikiErrText } = unwrapToolResultText(wikiErrRes, {
      allowError: true,
    });
    assert.match(
      wikiErrText,
      /\[REDACTED\]/,
      'Expected redactSecrets() to substitute [REDACTED] in error output',
    );

    const searchErrRes = await client.callTool('search_code', {
      projectId: 'DemoProject',
      searchText: 'greet',
    });
    assert.equal(searchErrRes.isError, true);
    const { text: searchErrText } = unwrapToolResultText(searchErrRes, {
      allowError: true,
    });
    assert.match(searchErrText, /\[REDACTED\]/);

    const leakSurface = [
      wikiErrText,
      searchErrText,
      client.getStderr(),
      client.getStdoutNoise().join('\n'),
    ].join('\n');

    assert.equal(
      leakSurface.includes(canaryPat),
      false,
      'Raw canary PAT leaked into error output / stderr / stdout!',
    );
    assert.equal(
      leakSurface.includes(b64ColonPat),
      false,
      'Base64 ":<pat>" encoding leaked into error output / stderr / stdout!',
    );
    assert.equal(
      leakSurface.includes(b64UserPat),
      false,
      'Base64 "PAT:<pat>" encoding leaked into error output / stderr / stdout!',
    );
    client.assertCleanStdout();
  });

  test('Area 11 (F26): server-2020 direct-HTTP preview auto-resolution negotiates 6.0-preview.1 for search_code and list_wiki_pages', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'server-2020',
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
    mockAdo.clearRequests();

    const searchRes = await client.callTool('search_code', {
      projectId: 'DemoProject',
      searchText: 'greet',
    });
    assert.notEqual(
      searchRes.isError,
      true,
      `Expected search_code to succeed on server-2020 via 6.0-preview negotiation, got: ${JSON.stringify(searchRes)}`,
    );

    const wikiListRes = await client.callTool('list_wiki_pages', {
      projectId: 'DemoProject',
      wikiId: 'DemoProject.wiki',
    });
    assert.notEqual(
      wikiListRes.isError,
      true,
      `Expected list_wiki_pages to succeed on server-2020 via 6.0-preview negotiation, got: ${JSON.stringify(wikiListRes)}`,
    );

    const searchPost = mockAdo.requests.findLast(
      (r) =>
        r.method === 'POST' &&
        /\/_apis\/search\/codesearchresults/i.test(r.relPath),
    );
    assert.ok(searchPost, 'Expected POST .../search/codesearchresults on 2020');
    assert.match(
      String(searchPost.apiVersion ?? ''),
      /^6\.0-preview/i,
      `Expected 6.0-preview api-version for search_code on server-2020, got ${searchPost.apiVersion}`,
    );

    const wikiBatchPost = mockAdo.requests.findLast(
      (r) =>
        r.method === 'POST' &&
        /\/_apis\/wiki\/wikis\/.+\/pagesbatch/i.test(r.relPath),
    );
    assert.ok(wikiBatchPost, 'Expected POST .../wiki/.../pagesbatch on 2020');
    assert.match(
      String(wikiBatchPost.apiVersion ?? ''),
      /^6\.0-preview/i,
      `Expected 6.0-preview api-version for list_wiki_pages on server-2020, got ${wikiBatchPost.apiVersion}`,
    );
    client.assertCleanStdout();
  });
});
