import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertSpotlighted,
  extractTextContent,
  parseSpotlightedText,
  unwrapToolResultJson,
  unwrapToolResultText,
} from '../harness/assertions.mjs';
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
  return tool;
}

describe('Tier 1 — Area 2: Full MCP ToolAnnotations & Workflow Presets (F6, F8)', () => {
  it('T2.1 [F6] Full default catalog emits all 5 MCP ToolAnnotations hints on every tool with read-only invariants and zero advsec_* non-goal tools', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();

    assert.ok(
      Array.isArray(tools) && tools.length >= 75,
      `Expected >= 75 tools in default catalog, got ${tools?.length}`,
    );

    for (const tool of tools) {
      assert.equal(
        /^advsec_/i.test(tool.name),
        false,
        `Non-goal Advanced Security tool "${tool.name}" must not be registered`,
      );

      const ann = tool.annotations;
      assert.ok(
        ann && typeof ann === 'object',
        `Expected tool "${tool.name}" to emit annotations object`,
      );
      assert.ok(
        typeof ann.title === 'string' && ann.title.trim().length > 0,
        `Expected tool "${tool.name}" annotations.title to be a non-empty string, got ${JSON.stringify(ann.title)}`,
      );
      assert.equal(
        typeof ann.readOnlyHint,
        'boolean',
        `Expected tool "${tool.name}" annotations.readOnlyHint to be boolean`,
      );
      assert.equal(
        typeof ann.destructiveHint,
        'boolean',
        `Expected tool "${tool.name}" annotations.destructiveHint to be boolean`,
      );
      assert.equal(
        typeof ann.idempotentHint,
        'boolean',
        `Expected tool "${tool.name}" annotations.idempotentHint to be boolean`,
      );
      assert.equal(
        typeof ann.openWorldHint,
        'boolean',
        `Expected tool "${tool.name}" annotations.openWorldHint to be boolean`,
      );

      if (ann.readOnlyHint === true) {
        assert.equal(
          ann.destructiveHint,
          false,
          `Read-only tool "${tool.name}" must have destructiveHint === false`,
        );
        assert.equal(
          ann.idempotentHint,
          true,
          `Read-only tool "${tool.name}" must have idempotentHint === true`,
        );
      }
    }

    client.assertCleanStdout();
  });

  it('T2.2 [F6] Exact ToolAnnotations behavioral classification across read-only, additive, idempotent-write, and destructive tools', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();

    const readOnlyTools = [
      'list_projects',
      'get_work_item',
      'get_work_item_revisions',
      'list_teams',
      'list_branches',
      'get_build_test_results',
      'list_iterations',
      'query_analytics',
      'get_analytics_schema',
      'get_analytics_metrics',
    ];
    for (const name of readOnlyTools) {
      const { annotations } = requireTool(tools, name);
      assert.equal(annotations.readOnlyHint, true, `${name}.readOnlyHint`);
      assert.equal(
        annotations.destructiveHint,
        false,
        `${name}.destructiveHint`,
      );
      assert.equal(annotations.idempotentHint, true, `${name}.idempotentHint`);
      assert.equal(annotations.openWorldHint, true, `${name}.openWorldHint`);
    }

    const additiveWriteTools = [
      'create_work_item',
      'add_work_item_comment',
      'create_pull_request',
      'add_pull_request_comment',
      'create_branch',
    ];
    for (const name of additiveWriteTools) {
      const { annotations } = requireTool(tools, name);
      assert.equal(annotations.readOnlyHint, false, `${name}.readOnlyHint`);
      assert.equal(
        annotations.destructiveHint,
        false,
        `${name}.destructiveHint`,
      );
      assert.equal(annotations.idempotentHint, false, `${name}.idempotentHint`);
      assert.equal(annotations.openWorldHint, true, `${name}.openWorldHint`);
    }

    const idempotentWriteTools = [
      'vote_pull_request',
      'update_pull_request_thread_status',
      'add_test_cases_to_suite',
    ];
    for (const name of idempotentWriteTools) {
      const { annotations } = requireTool(tools, name);
      assert.equal(annotations.readOnlyHint, false, `${name}.readOnlyHint`);
      assert.equal(
        annotations.destructiveHint,
        false,
        `${name}.destructiveHint`,
      );
      assert.equal(annotations.idempotentHint, true, `${name}.idempotentHint`);
      assert.equal(annotations.openWorldHint, true, `${name}.openWorldHint`);
    }

    const destructiveWriteTools = [
      'create_commit',
      'update_work_item',
      'delete_work_item_attachment',
      'merge_pull_request',
      'trigger_pipeline',
      'update_wiki_page',
      'remove_test_cases_from_suite',
    ];
    for (const name of destructiveWriteTools) {
      const { annotations } = requireTool(tools, name);
      assert.equal(annotations.readOnlyHint, false, `${name}.readOnlyHint`);
      assert.equal(
        annotations.destructiveHint,
        true,
        `${name}.destructiveHint`,
      );
      assert.equal(annotations.openWorldHint, true, `${name}.openWorldHint`);
    }
  });

  it('T2.3 [F6] get_work_item_attachment local-disk-write classification is safely resolved', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const defaultClient = createStdioMcpClient({
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => defaultClient.close());
    await defaultClient.initialize();
    const { tools: defaultTools } = await defaultClient.listTools();

    const roClient = createStdioMcpClient({
      args: ['--read-only'],
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => roClient.close());
    await roClient.initialize();
    const { tools: roTools } = await roClient.listTools();
    const roNames = new Set(roTools.map((tool) => tool.name));

    const attachmentTool = requireTool(
      defaultTools,
      'get_work_item_attachment',
    );
    const requiredFields = Array.isArray(attachmentTool.inputSchema?.required)
      ? attachmentTool.inputSchema.required
      : [];

    const classifiedAsDestructiveWrite =
      attachmentTool.annotations?.readOnlyHint === false &&
      attachmentTool.annotations?.destructiveHint === true &&
      !roNames.has('get_work_item_attachment');
    const safeInMemoryMode = !requiredFields.includes('outputPath');

    assert.ok(
      classifiedAsDestructiveWrite || safeInMemoryMode,
      `Expected get_work_item_attachment to either be classified as destructive write (readOnlyHint: false, destructiveHint: true, excluded under --read-only) or not mandate outputPath disk write; got annotations=${JSON.stringify(attachmentTool.annotations)} required=${JSON.stringify(requiredFields)}`,
    );
  });

  it('T2.4 [F6] --read-only keeps ALL readOnlyHint: true tools from the default catalog and omits ALL readOnlyHint: false write tools', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const fullClient = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => fullClient.close());
    await fullClient.initialize();
    const { tools: fullTools } = await fullClient.listTools();

    const roClient = createStdioMcpClient({
      args: ['--read-only'],
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => roClient.close());
    await roClient.initialize();
    const { tools: roTools } = await roClient.listTools();

    const expectedReadOnly = fullTools
      .filter((tool) => tool.annotations?.readOnlyHint === true)
      .map((tool) => tool.name)
      .sort();
    const expectedWrite = fullTools
      .filter((tool) => tool.annotations?.readOnlyHint === false)
      .map((tool) => tool.name)
      .sort();
    const actualReadOnly = roTools.map((tool) => tool.name).sort();

    assert.ok(
      expectedReadOnly.length >= 40,
      `Expected >= 40 readOnlyHint: true tools in full catalog, got ${expectedReadOnly.length}`,
    );
    assert.ok(
      expectedWrite.length >= 20,
      `Expected >= 20 readOnlyHint: false write tools in full catalog, got ${expectedWrite.length}`,
    );
    assert.deepEqual(
      actualReadOnly,
      expectedReadOnly,
      'Expected --read-only tool list to match exact set of readOnlyHint: true tools',
    );
    for (const writeName of expectedWrite) {
      assert.equal(
        actualReadOnly.includes(writeName),
        false,
        `Expected write tool "${writeName}" to be omitted under --read-only`,
      );
    }
    for (const tool of roTools) {
      assert.equal(
        tool.annotations?.readOnlyHint,
        true,
        `Every tool exposed under --read-only must have readOnlyHint: true (${tool.name})`,
      );
    }
  });

  it('T2.5 [F8] Curated --toolsets pr-review and --toolsets ci-debug presets expose focused workflow subsets', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const prClient = createStdioMcpClient({
      args: ['--toolsets', 'pr-review'],
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => prClient.close());
    await prClient.initialize();
    const { tools: prTools } = await prClient.listTools();
    const prNames = new Set(prTools.map((tool) => tool.name));

    for (const expected of [
      'get_me',
      'list_projects',
      'list_branches',
      'get_pull_request',
      'vote_pull_request',
      'manage_pull_request_reviewers',
      'merge_pull_request',
    ]) {
      assert.ok(
        prNames.has(expected),
        `Expected pr-review preset to include "${expected}"`,
      );
    }
    for (const excluded of [
      'get_wikis',
      'list_test_plans',
      'list_work_items',
    ]) {
      assert.equal(
        prNames.has(excluded),
        false,
        `Expected pr-review preset to exclude "${excluded}"`,
      );
    }

    const ciClient = createStdioMcpClient({
      args: ['--toolsets', 'ci-debug'],
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => ciClient.close());
    await ciClient.initialize();
    const { tools: ciTools } = await ciClient.listTools();
    const ciNames = new Set(ciTools.map((tool) => tool.name));

    for (const expected of [
      'list_projects',
      'pipeline_timeline',
      'get_pipeline_log',
      'get_build_test_results',
      'retry_pipeline_stage',
      'get_pull_request_checks',
    ]) {
      assert.ok(
        ciNames.has(expected),
        `Expected ci-debug preset to include "${expected}"`,
      );
    }
    for (const excluded of ['get_wikis', 'list_test_plans']) {
      assert.equal(
        ciNames.has(excluded),
        false,
        `Expected ci-debug preset to exclude "${excluded}"`,
      );
    }
  });

  it('T2.6 [F8] Curated --toolsets boards and --toolsets core presets expose focused workflow subsets', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const boardsClient = createStdioMcpClient({
      args: ['--toolsets', 'boards'],
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => boardsClient.close());
    await boardsClient.initialize();
    const { tools: boardsTools } = await boardsClient.listTools();
    const boardsNames = new Set(boardsTools.map((tool) => tool.name));

    for (const expected of [
      'get_me',
      'list_projects',
      'list_work_items',
      'add_work_item_comment',
      'get_work_item_revisions',
      'search_work_items',
    ]) {
      assert.ok(
        boardsNames.has(expected),
        `Expected boards preset to include "${expected}"`,
      );
    }
    for (const excluded of [
      'trigger_pipeline',
      'create_commit',
      'create_wiki',
    ]) {
      assert.equal(
        boardsNames.has(excluded),
        false,
        `Expected boards preset to exclude "${excluded}"`,
      );
    }

    const coreClient = createStdioMcpClient({
      args: ['--toolsets', 'core'],
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => coreClient.close());
    await coreClient.initialize();
    const { tools: coreTools } = await coreClient.listTools();
    const coreNames = new Set(coreTools.map((tool) => tool.name));

    for (const expected of [
      'get_me',
      'list_organizations',
      'list_projects',
      'list_repositories',
      'get_work_item',
      'get_pull_request',
    ]) {
      assert.ok(
        coreNames.has(expected),
        `Expected core preset to include "${expected}"`,
      );
    }
    for (const excluded of ['get_wikis', 'list_test_plans', 'list_pipelines']) {
      assert.equal(
        coreNames.has(excluded),
        false,
        `Expected core preset to exclude "${excluded}"`,
      );
    }
  });

  it('T2.7 [F8] New toolset aliases (work/sprints/iterations, analytics/odata, events) resolve cleanly via --toolsets while retaining atomic tools', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const expectedWorkTools = [
      'get_iteration_work_items',
      'get_team_settings',
      'list_iterations',
      'list_team_iterations',
    ];
    const expectedAnalyticsTools = [
      'get_analytics_metrics',
      'get_analytics_schema',
      'query_analytics',
    ];
    const expectedEventTools = ['list_event_types', 'poll_events'];

    const aliasClient1 = createStdioMcpClient({
      args: ['--toolsets', 'sprints,odata'],
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => aliasClient1.close());
    await aliasClient1.initialize();
    const { tools: tools1 } = await aliasClient1.listTools();
    assert.deepEqual(
      tools1.map((tool) => tool.name).sort(),
      [...expectedWorkTools, ...expectedAnalyticsTools].sort(),
      'Expected --toolsets sprints,odata to resolve exact work + analytics atomic tools',
    );

    const aliasClient2 = createStdioMcpClient({
      args: ['--toolsets', 'iterations,analytics,events'],
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => aliasClient2.close());
    await aliasClient2.initialize();
    const { tools: tools2 } = await aliasClient2.listTools();
    assert.deepEqual(
      tools2.map((tool) => tool.name).sort(),
      [
        ...expectedWorkTools,
        ...expectedAnalyticsTools,
        ...expectedEventTools,
      ].sort(),
      'Expected --toolsets iterations,analytics,events to resolve exact work + analytics + events tools',
    );

    const workClient = createStdioMcpClient({
      args: ['--toolsets', 'work'],
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => workClient.close());
    await workClient.initialize();
    const { tools: workTools } = await workClient.listTools();
    assert.deepEqual(
      workTools.map((tool) => tool.name).sort(),
      expectedWorkTools,
      'Expected --toolsets work to resolve exact 4 work tools',
    );
  });

  it('T2.8 [F8] create_commit description bloat and duplicated schema tutorial are trimmed', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      args: ['--toolsets', 'repositories'],
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'create_commit');

    const descBytes = Buffer.byteLength(String(tool.description ?? ''), 'utf8');
    const schemaDesc = String(tool.inputSchema?.description ?? '');
    const schemaDescBytes = Buffer.byteLength(schemaDesc, 'utf8');
    const totalBytes = Buffer.byteLength(JSON.stringify(tool), 'utf8');

    assert.ok(
      descBytes < 1200,
      `Expected create_commit description < 1200 bytes (was 1615 B), got ${descBytes} bytes`,
    );
    assert.ok(
      descBytes + schemaDescBytes < 1500,
      `Expected combined create_commit description + inputSchema.description < 1500 bytes, got ${descBytes + schemaDescBytes} bytes`,
    );
    assert.ok(
      totalBytes < 4200,
      `Expected total serialized create_commit tool < 4200 bytes (strictly below 5045 B baseline), got ${totalBytes} bytes`,
    );
    assert.notEqual(
      tool.inputSchema?.description,
      tool.description,
      'Expected create_commit inputSchema.description not to duplicate tool.description',
    );
    const repeatedOption1 =
      String(tool.description ?? '').includes('Option 1') &&
      schemaDesc.includes('Option 1');
    assert.equal(
      repeatedOption1,
      false,
      'Expected create_commit NOT to repeat the "Option 1" tutorial in both description and inputSchema.description',
    );
  });
});

describe('Tier 1 — Area 3: Prompt-Injection Spotlighting (F7)', () => {
  it('T2.9 [F7] Spotlighting is ON by default on tools/call with 128-bit hex nonce, U+2014 em-dash, sanitized source label, and valid inner JSON', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const res = await client.callTool('get_work_item', { workItemId: 101 });
    const rawText = extractTextContent(res);

    const spotlight = assertSpotlighted(rawText, {
      checkNotDoubleWrapped: true,
    });
    assert.match(spotlight.nonce, /^[0-9a-f]{32}$/);
    assert.match(
      spotlight.source,
      /azure devops|work/i,
      `Expected Spotlighting source label to describe Azure DevOps / work item source, got "${spotlight.source}"`,
    );

    const parsed = unwrapToolResultJson(res, { expectSpotlighted: true });
    assert.equal(parsed.id, 101);
    assert.equal(parsed.fields?.['System.Title'], 'Implement OData Analytics');

    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'GET' &&
          /\/_apis\/wit\/workitems\/101$/i.test(req.relPath),
      ),
      'Expected GET /_apis/wit/workitems/101 on mock ADO server',
    );
  });

  it('T2.10 [F7] Each tools/call invocation generates a distinct 128-bit cryptographic nonce', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const r1 = await client.callTool('get_work_item', { workItemId: 101 });
    const r2 = await client.callTool('get_pull_request', {
      projectId: 'DemoProject',
      pullRequestId: 42,
    });
    const r3 = await client.callTool('get_wiki_page', {
      projectId: 'DemoProject',
      wikiId: 'DemoProject.wiki',
      pagePath: '/Home',
    });

    const s1 = assertSpotlighted(extractTextContent(r1), {
      checkNotDoubleWrapped: true,
    });
    const s2 = assertSpotlighted(extractTextContent(r2), {
      checkNotDoubleWrapped: true,
    });
    const s3 = assertSpotlighted(extractTextContent(r3), {
      checkNotDoubleWrapped: true,
    });

    assert.equal(
      new Set([s1.nonce, s2.nonce, s3.nonce]).size,
      3,
      `Expected 3 distinct nonces across calls, got [${s1.nonce}, ${s2.nonce}, ${s3.nonce}]`,
    );

    assert.ok(
      mockAdo.requests.some((req) =>
        /\/wit\/workitems\/101$/i.test(req.relPath),
      ),
    );
    assert.ok(
      mockAdo.requests.some((req) =>
        /\/git\/pullrequests\/42$/i.test(req.relPath),
      ),
    );
    assert.ok(
      mockAdo.requests.some((req) => /\/wiki\/wikis\//i.test(req.relPath)),
    );
  });

  it('T2.11 [F7] Spotlighting wraps untrusted user-authored payloads across PR comments, wiki pages, pipeline logs, and repo file content tools', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();

    const prCommentsRes = await client.callTool('get_pull_request_comments', {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 42,
    });
    assertSpotlighted(extractTextContent(prCommentsRes), {
      checkNotDoubleWrapped: true,
    });
    const prCommentsText = unwrapToolResultText(prCommentsRes, {
      expectSpotlighted: true,
    }).text;
    assert.ok(
      prCommentsText.includes('Looks great, please preserve isRequired!'),
      'Expected seeded PR comment payload inside spotlighted block',
    );

    const wikiRes = await client.callTool('get_wiki_page', {
      projectId: 'DemoProject',
      wikiId: 'DemoProject.wiki',
      pagePath: '/Home',
    });
    assertSpotlighted(extractTextContent(wikiRes), {
      checkNotDoubleWrapped: true,
    });
    const wikiText = unwrapToolResultText(wikiRes, {
      expectSpotlighted: true,
    }).text;
    assert.ok(
      wikiText.includes('Welcome to DemoProject.'),
      'Expected seeded wiki page content inside spotlighted block',
    );

    const logRes = await client.callTool('get_pipeline_log', {
      projectId: 'DemoProject',
      runId: 500,
      logId: 1,
    });
    assertSpotlighted(extractTextContent(logRes), {
      checkNotDoubleWrapped: true,
    });
    const logText = unwrapToolResultText(logRes, {
      expectSpotlighted: true,
    }).text;
    assert.ok(
      logText.includes('Auth.TokenSpec.shouldHandleExpiredToken'),
      'Expected seeded pipeline log content inside spotlighted block',
    );

    const fileRes = await client.callTool('get_file_content', {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      path: '/src/app.ts',
    });
    assertSpotlighted(extractTextContent(fileRes), {
      checkNotDoubleWrapped: true,
    });
    const fileText = unwrapToolResultText(fileRes, {
      expectSpotlighted: true,
    }).text;
    assert.ok(
      fileText.includes('export function greet'),
      'Expected seeded repository file content inside spotlighted block',
    );

    assert.ok(
      mockAdo.requests.some((req) =>
        /\/pullrequests\/42\/threads/i.test(req.relPath),
      ),
    );
    assert.ok(
      mockAdo.requests.some((req) =>
        /\/wiki\/wikis\/.+\/pages/i.test(req.relPath),
      ),
    );
    assert.ok(
      mockAdo.requests.some((req) =>
        /\/build\/builds\/500\/logs\/1/i.test(req.relPath),
      ),
    );
    assert.ok(
      mockAdo.requests.some((req) =>
        /\/git\/repositories\/DemoRepo\/items/i.test(req.relPath),
      ),
    );
  });

  it('T2.12 [F7] CLI --no-spotlighting opt-out returns raw un-delimited JSON', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      args: ['--no-spotlighting'],
      env: makeStandardEnv(mockAdo),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const wiRes = await client.callTool('get_work_item', { workItemId: 101 });
    const rawWi = extractTextContent(wiRes);
    const wi = unwrapToolResultJson(wiRes, { expectSpotlighted: false });
    assert.equal(JSON.parse(rawWi).id, 101);
    assert.equal(wi.id, 101);

    const projRes = await client.callTool('list_projects', {});
    const rawProj = extractTextContent(projRes);
    const projects = unwrapToolResultJson(projRes, {
      expectSpotlighted: false,
    });
    assert.ok(JSON.parse(rawProj));
    assert.ok(
      JSON.stringify(projects).includes('DemoProject'),
      'Expected DemoProject in un-spotlighted list_projects response',
    );

    assert.ok(
      mockAdo.requests.some((req) =>
        /\/wit\/workitems\/101$/i.test(req.relPath),
      ),
    );
    assert.ok(
      mockAdo.requests.some((req) => /\/_apis\/projects$/i.test(req.relPath)),
    );
  });

  it('T2.13 [F7] Environment variable AZURE_DEVOPS_SPOTLIGHTING=false disables Spotlighting', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      env: makeStandardEnv(mockAdo, { AZURE_DEVOPS_SPOTLIGHTING: 'false' }),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const res = await client.callTool('get_work_item', { workItemId: 101 });
    const wi = unwrapToolResultJson(res, { expectSpotlighted: false });
    assert.equal(wi.id, 101);
    assert.ok(
      mockAdo.requests.some((req) =>
        /\/wit\/workitems\/101$/i.test(req.relPath),
      ),
    );
  });

  it('T2.14 [F7] Raw resources/read code files remain unwrapped even when Spotlighting is ON by default', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const readRes = await client.readResource(
      'ado://DefaultCollection/DemoProject/DemoRepo/contents/src/app.ts',
    );

    assert.ok(
      Array.isArray(readRes.contents) && readRes.contents.length > 0,
      'Expected non-empty contents array from resources/read',
    );
    const text = readRes.contents[0].text;
    assert.equal(
      parseSpotlightedText(text).isSpotlighted,
      false,
      'Raw code files returned by resources/read must NEVER be spotlighted',
    );
    assert.equal(
      text,
      'export function greet(name: string): string {\n  return `Hello, ${name}`;\n}\n',
    );

    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'GET' &&
          /\/DemoProject\/_apis\/git\/repositories\/DemoRepo\/items/i.test(
            req.relPath,
          ),
      ),
      'Expected GET git items request for /src/app.ts',
    );
  });

  it('T2.15 [F7] Spotlighting preserves isError: true and error content cleanly without leaking PAT secrets', async (t) => {
    const addCleanup = registerCleanup(t);
    const secretPat = 'super-secret-e2e-pat-998877';
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: secretPat,
    });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      env: makeStandardEnv(mockAdo, { AZURE_DEVOPS_PAT: secretPat }),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const res = await client.callTool('get_work_item', { workItemId: 999999 });

    assert.equal(
      res.isError,
      true,
      'Expected missing work item 999999 to return CallToolResult with isError === true (not a JSON-RPC protocol error)',
    );
    assert.ok(
      Array.isArray(res.content) && res.content.length > 0,
      'Expected non-empty content array on error CallToolResult',
    );
    const { text, rawText } = unwrapToolResultText(res, {
      allowError: true,
      expectSpotlighted: 'auto',
    });
    if (rawText.startsWith('<<')) {
      assertSpotlighted(rawText, { checkNotDoubleWrapped: true });
    }
    assert.ok(
      text.trim().length > 0,
      'Expected non-empty diagnostic error text',
    );
    assert.match(
      text,
      /not found|999999|does not exist|error/i,
      `Expected readable error diagnostic, got: ${text.slice(0, 200)}`,
    );
    assert.equal(
      rawText.includes(secretPat),
      false,
      'Error tool response must NEVER leak AZURE_DEVOPS_PAT',
    );
    assert.equal(
      client.getStderr().includes(secretPat),
      false,
      'Server stderr must NEVER leak AZURE_DEVOPS_PAT',
    );

    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'GET' &&
          /\/_apis\/wit\/workitems\/999999$/i.test(req.relPath),
      ),
    );
    client.assertCleanStdout();
  });
});
