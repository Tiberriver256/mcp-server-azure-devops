import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { unwrapToolResultText } from '../harness/assertions.mjs';
import { createStdioMcpClient } from '../harness/mcp-stdio-client.mjs';
import { createMockAdoServer } from '../harness/mock-ado-server.mjs';

const TEST_PAT = 'e2e-tier2-pat-secret-0123456789';
const ALICE_ID = '11111111-1111-4111-8111-111111111111';
const BOB_ID = '22222222-2222-4222-8222-222222222222';
const CHARLIE_ID = '33333333-3333-4333-8333-333333333333';

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

function resolveApproveVoteValue(voteToolDef) {
  const voteSchema = voteToolDef?.inputSchema?.properties?.vote;
  if (voteSchema && Array.isArray(voteSchema.enum)) {
    if (voteSchema.enum.includes(10)) {
      return 10;
    }
    const strMatch = voteSchema.enum.find(
      (v) => typeof v === 'string' && v.toLowerCase().includes('approve'),
    );
    if (strMatch !== undefined) {
      return strMatch;
    }
  }
  if (voteSchema?.type === 'string') {
    return 'approved';
  }
  return 10;
}

function resolveApproveWithSuggestionsVoteValue(voteToolDef) {
  const voteSchema = voteToolDef?.inputSchema?.properties?.vote;
  if (voteSchema && Array.isArray(voteSchema.enum)) {
    if (voteSchema.enum.includes(5)) {
      return 5;
    }
    const strMatch = voteSchema.enum.find(
      (v) => typeof v === 'string' && v.toLowerCase().includes('suggestion'),
    );
    if (strMatch !== undefined) {
      return strMatch;
    }
  }
  if (voteSchema?.type === 'string') {
    return 'approved_with_suggestions';
  }
  return 5;
}

function findArraySchema(prop) {
  if (!prop || typeof prop !== 'object') {
    return null;
  }
  if (prop.type === 'array') {
    return prop;
  }
  for (const unionKey of ['anyOf', 'oneOf']) {
    if (Array.isArray(prop[unionKey])) {
      const branch = prop[unionKey].find((b) => b?.type === 'array');
      if (branch) {
        return branch;
      }
    }
  }
  return null;
}

function buildManageReviewersArgs(
  toolDef,
  { pullRequestId, action, identifiers },
) {
  const props = toolDef?.inputSchema?.properties ?? {};
  const actionKey = resolveProp(toolDef, ['action', 'operation']);
  const args = {
    projectId: 'DemoProject',
    repositoryId: 'DemoRepo',
    pullRequestId,
    [actionKey]: action,
  };

  const arrayKey = ['reviewers', 'reviewerIds', 'identities', 'ids'].find(
    (key) => Object.hasOwn(props, key) && findArraySchema(props[key]) !== null,
  );
  if (arrayKey) {
    const itemsSchema = findArraySchema(props[arrayKey])?.items;
    if (itemsSchema?.type === 'object') {
      const itemProps = itemsSchema.properties ?? {};
      const idField =
        [
          'id',
          'reviewerId',
          'identity',
          'uniqueName',
          'email',
          'reviewer',
        ].find((k) => Object.hasOwn(itemProps, k)) ?? 'id';
      args[arrayKey] = identifiers.map((val) => ({ [idField]: val }));
    } else {
      args[arrayKey] = identifiers;
    }
    return { args, isBatch: true };
  }

  const singleKey = resolveProp(toolDef, [
    'reviewerId',
    'reviewer',
    'identity',
    'reviewers',
  ]);
  args[singleKey] = identifiers[0];
  return { args, isBatch: false };
}

describe('Tier 2 Boundaries — Work Items, Comments, Revisions, Teams & PR Review Actions (Areas 4–5, F10–F16)', () => {
  // =========================================================================
  // Area 4: Work Items, Comments, Revisions & Teams (F10–F12) — 6 tests
  // =========================================================================

  test('Area 4 (F10): add_work_item_comment falls back to PATCH System.History on server-2019-rtm (5.0)', async (t) => {
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
    const commentTool = findTool(listRes, 'add_work_item_comment');
    const textKey = resolveProp(commentTool, ['text', 'comment', 'content']);

    mockAdo.clearRequests();
    const commentBody = 'Server 2019 RTM System.History fallback note';
    const res = await client.callTool('add_work_item_comment', {
      projectId: 'DemoProject',
      workItemId: 101,
      [textKey]: commentBody,
    });

    assert.notEqual(
      res.isError,
      true,
      `Expected add_work_item_comment to succeed via System.History fallback on 2019, got: ${JSON.stringify(res)}`,
    );

    const patchReqs = mockAdo.requests.filter(
      (r) =>
        r.method === 'PATCH' &&
        /\/_apis\/wit\/workitems\/101$/i.test(r.relPath),
    );
    assert.ok(
      patchReqs.length >= 1,
      'Expected PATCH /_apis/wit/workitems/101 request on server-2019-rtm',
    );
    const hasHistoryOp = patchReqs.some(
      (r) =>
        Array.isArray(r.parsedBody) &&
        r.parsedBody.some(
          (op) =>
            op?.path === '/fields/System.History' &&
            String(op?.value ?? '').includes(commentBody),
        ),
    );
    assert.equal(
      hasHistoryOp,
      true,
      'Expected PATCH body to set /fields/System.History with the comment text',
    );

    const commentsMirrored = (mockAdo.state.workItemComments[101] ?? []).some(
      (c) => String(c.text ?? '').includes(commentBody),
    );
    assert.equal(
      commentsMirrored,
      true,
      'Expected mock ADO state to record the fallback history entry on work item 101',
    );
    client.assertCleanStdout();
  });

  test('Area 4 (F10): add_work_item_comment rejects empty and whitespace-only text with zero mutations', async (t) => {
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
    const commentTool = findTool(listRes, 'add_work_item_comment');
    const textKey = resolveProp(commentTool, ['text', 'comment', 'content']);

    mockAdo.clearRequests();
    for (const invalidText of ['', '   \n\t  ']) {
      const res = await client.callTool('add_work_item_comment', {
        projectId: 'DemoProject',
        workItemId: 101,
        [textKey]: invalidText,
      });
      assert.equal(
        res.isError,
        true,
        `Expected empty/whitespace comment (${JSON.stringify(invalidText)}) to return isError: true`,
      );
      const { text: errText } = unwrapToolResultText(res, { allowError: true });
      assert.match(
        errText,
        /empty|blank|whitespace|required|min|text|comment|invalid/i,
        `Expected validation error for empty/whitespace comment (${JSON.stringify(invalidText)}), got: ${errText}`,
      );
    }

    const mutationReqs = mockAdo.requests.filter(
      (r) => r.method === 'POST' || r.method === 'PATCH',
    );
    assert.equal(
      mutationReqs.length,
      0,
      `Expected zero POST/PATCH mutations on empty comment rejection, got ${mutationReqs.length}`,
    );
    client.assertCleanStdout();
  });

  test('Area 4 (F10): add_work_item_comment on nonexistent work item 999999 returns clean 404 error without crashing', async (t) => {
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
    const commentTool = findTool(listRes, 'add_work_item_comment');
    const textKey = resolveProp(commentTool, ['text', 'comment', 'content']);

    const errRes = await client.callTool('add_work_item_comment', {
      projectId: 'DemoProject',
      workItemId: 999999,
      [textKey]: 'Comment on missing item',
    });
    assert.equal(errRes.isError, true);
    const { text } = unwrapToolResultText(errRes, { allowError: true });
    assert.match(text, /999999|not found|does not exist|404/i);

    const healthyRes = await client.callTool('get_work_item', {
      workItemId: 101,
    });
    assert.notEqual(
      healthyRes.isError,
      true,
      'Server must stay healthy after 404 on add_work_item_comment',
    );
    client.assertCleanStdout();
  });

  test('Area 4 (F11): get_work_item_revisions enforces $top <= 200 cap/rejection and rejects negative $skip with zero GETs', async (t) => {
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
    const revTool = findTool(listRes, 'get_work_item_revisions');
    const topKey = resolveProp(revTool, ['top', 'maxResults', 'limit']);
    const skipKey = resolveProp(revTool, ['skip', 'offset']);

    // Case 1: top = 250 must either reject or cap wire $top <= 200
    mockAdo.clearRequests();
    const overTopRes = await client.callTool('get_work_item_revisions', {
      projectId: 'DemoProject',
      workItemId: 101,
      [topKey]: 250,
    });
    if (overTopRes.isError !== true) {
      const revGets = mockAdo.requests.filter(
        (r) => r.method === 'GET' && /\/revisions/i.test(r.relPath),
      );
      assert.ok(revGets.length >= 1, 'Expected GET /revisions wire call');
      for (const req of revGets) {
        assert.ok(
          Object.hasOwn(req.query, '$top') &&
            Number(req.query.$top) >= 1 &&
            Number(req.query.$top) <= 200,
          `Expected wire $top in [1..200] when clamping, got $top=${req.query.$top}`,
        );
      }
    } else {
      const { text: overTopText } = unwrapToolResultText(overTopRes, {
        allowError: true,
      });
      assert.match(
        overTopText,
        /200|top|max|limit|range|invalid/i,
        `Expected validation error for get_work_item_revisions top=250, got: ${overTopText}`,
      );
      const unclampedReqs = mockAdo.requests.filter(
        (r) => Object.hasOwn(r.query, '$top') && Number(r.query.$top) > 200,
      );
      assert.equal(
        unclampedReqs.length,
        0,
        `Expected zero wire requests with $top > 200 when rejecting, got ${unclampedReqs.length}`,
      );
    }

    // Case 2: negative skip must fail client-side with zero HTTP GETs
    mockAdo.clearRequests();
    const negSkipRes = await client.callTool('get_work_item_revisions', {
      projectId: 'DemoProject',
      workItemId: 101,
      [skipKey]: -1,
    });
    assert.equal(
      negSkipRes.isError,
      true,
      'Expected negative skip (-1) to return isError: true',
    );
    const { text: negSkipText } = unwrapToolResultText(negSkipRes, {
      allowError: true,
    });
    assert.match(
      negSkipText,
      /skip|negative|non-negative|>=|min|invalid/i,
      `Expected validation error for negative skip (-1), got: ${negSkipText}`,
    );
    const revGetsAfterNeg = mockAdo.requests.filter(
      (r) => r.method === 'GET' && /\/revisions/i.test(r.relPath),
    );
    assert.equal(
      revGetsAfterNeg.length,
      0,
      'Expected zero GET /revisions requests when skip is negative',
    );
    client.assertCleanStdout();
  });

  test('Area 4 (F11): get_work_item_revisions for missing revisionNumber 999 returns clean 404 error', async (t) => {
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
    const revTool = findTool(listRes, 'get_work_item_revisions');
    const revNumKey = resolveProp(revTool, ['revisionNumber', 'revision']);

    const errRes = await client.callTool('get_work_item_revisions', {
      projectId: 'DemoProject',
      workItemId: 101,
      [revNumKey]: 999,
    });
    assert.equal(errRes.isError, true);
    const { text } = unwrapToolResultText(errRes, { allowError: true });
    assert.match(text, /999|not found|404/i);
    client.assertCleanStdout();
  });

  test('Area 4 (F12): list_teams omits $expandIdentity on server-2019-rtm (5.0)', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'server-2019-rtm',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    const client = createStdioMcpClient({
      env: makePatEnv(mockAdo.collectionUrl, {
        AZURE_DEVOPS_DEFAULT_PROJECT: undefined,
      }),
    });
    t.after(async () => {
      await client.close();
    });

    await client.initialize();
    const listRes = await client.listTools();
    findTool(listRes, 'list_teams');

    mockAdo.clearRequests();
    const projectTeamsRes = await client.callTool('list_teams', {
      projectId: 'DemoProject',
    });
    assert.notEqual(
      projectTeamsRes.isError,
      true,
      `Expected list_teams(projectId) to succeed on server-2019-rtm: ${JSON.stringify(projectTeamsRes)}`,
    );

    const allTeamsRes = await client.callTool('list_teams', {});
    assert.notEqual(
      allTeamsRes.isError,
      true,
      `Expected collection-wide list_teams({}) to succeed on server-2019-rtm: ${JSON.stringify(allTeamsRes)}`,
    );

    const teamGets = mockAdo.requests.filter(
      (r) =>
        r.method === 'GET' &&
        /\/_apis\/(?:projects\/[^/]+\/)?teams$/i.test(r.relPath),
    );
    assert.ok(
      teamGets.length >= 2,
      `Expected >= 2 GET teams requests on server-2019-rtm, got ${teamGets.length}`,
    );
    for (const req of teamGets) {
      assert.equal(
        Object.hasOwn(req.query, '$expandIdentity'),
        false,
        `list_teams MUST omit $expandIdentity on server-2019-rtm, saw query=${JSON.stringify(req.query)} on ${req.url}`,
      );
    }
    client.assertCleanStdout();
  });

  // =========================================================================
  // Area 5: PR Review Actions, Identities & Branches (F13–F16) — 8 tests
  // =========================================================================

  test('Area 5 (F14): vote_pull_request preserves existing isRequired: true when voting without passing isRequired', async (t) => {
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
    const voteTool = findTool(listRes, 'vote_pull_request');
    const approveVote = resolveApproveVoteValue(voteTool);

    mockAdo.clearRequests();
    const res = await client.callTool('vote_pull_request', {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 42,
      vote: approveVote,
    });
    assert.notEqual(
      res.isError,
      true,
      `Expected vote_pull_request to succeed, got: ${JSON.stringify(res)}`,
    );

    const getIdx = mockAdo.requests.findIndex(
      (r) =>
        r.method === 'GET' &&
        /\/pullrequests\/42(?:\/reviewers(?:\/[^/]+)?)?$/i.test(r.relPath),
    );
    const putIdx = mockAdo.requests.findIndex(
      (r) =>
        r.method === 'PUT' &&
        new RegExp(`/pullrequests/42/reviewers/${ALICE_ID}$`, 'i').test(
          r.relPath,
        ),
    );
    assert.ok(
      putIdx !== -1,
      'Expected PUT .../pullrequests/42/reviewers/<aliceId> request',
    );
    assert.ok(
      getIdx !== -1 && getIdx < putIdx,
      `Expected GET PR/reviewer lookup before PUT to preserve isRequired (getIdx=${getIdx}, putIdx=${putIdx})`,
    );

    const putReq = mockAdo.requests[putIdx];
    assert.equal(
      putReq.parsedBody?.isRequired,
      true,
      `Expected PUT body to preserve isRequired: true, got: ${JSON.stringify(putReq.parsedBody)}`,
    );
    assert.equal(putReq.parsedBody?.vote, 10);

    const aliceState = mockAdo.state.pullRequests[42].reviewers.find(
      (r) => r.id === ALICE_ID,
    );
    assert.equal(
      aliceState?.isRequired,
      true,
      'Expected mock ADO PR 42 state to retain Alice isRequired: true after vote',
    );

    // Sub-check 2: Mutate Alice to isRequired: false -> voting without passing isRequired must NOT hardcode true
    mockAdo.mutateState((st) => {
      const alice = st.pullRequests[42].reviewers.find(
        (r) => r.id === ALICE_ID,
      );
      if (alice) {
        alice.isRequired = false;
      }
    });
    mockAdo.clearRequests();
    const suggestVote = resolveApproveWithSuggestionsVoteValue(voteTool);
    const optRes = await client.callTool('vote_pull_request', {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 42,
      vote: suggestVote,
    });
    assert.notEqual(
      optRes.isError,
      true,
      `Expected vote_pull_request (optional reviewer) to succeed, got: ${JSON.stringify(optRes)}`,
    );

    const optPutReq = mockAdo.requests.find(
      (r) =>
        r.method === 'PUT' &&
        new RegExp(`/pullrequests/42/reviewers/${ALICE_ID}$`, 'i').test(
          r.relPath,
        ),
    );
    assert.ok(
      optPutReq,
      'Expected PUT .../pullrequests/42/reviewers/<aliceId> for optional-reviewer sub-check',
    );
    assert.notEqual(
      optPutReq.parsedBody?.isRequired,
      true,
      `PUT body MUST NOT hardcode isRequired: true when reviewer is optional, got: ${JSON.stringify(optPutReq.parsedBody)}`,
    );
    assert.equal(optPutReq.parsedBody?.vote, 5);

    const aliceAfterOpt = mockAdo.state.pullRequests[42].reviewers.find(
      (r) => r.id === ALICE_ID,
    );
    assert.equal(
      aliceAfterOpt?.isRequired,
      false,
      'Expected mock ADO PR 42 state to retain Alice isRequired: false after optional-reviewer vote',
    );
    client.assertCleanStdout();
  });

  test('Area 5 (F14): vote_pull_request rejects invalid vote values (7, 99) with zero PUT requests', async (t) => {
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
    findTool(listRes, 'vote_pull_request');

    mockAdo.clearRequests();
    for (const invalidVote of [7, 99]) {
      const res = await client.callTool('vote_pull_request', {
        projectId: 'DemoProject',
        repositoryId: 'DemoRepo',
        pullRequestId: 42,
        vote: invalidVote,
      });
      assert.equal(
        res.isError,
        true,
        `Expected invalid vote ${invalidVote} to return isError: true`,
      );
      const { text: voteErrText } = unwrapToolResultText(res, {
        allowError: true,
      });
      assert.match(
        voteErrText,
        /vote|invalid|enum|allowed|expected|-10|-5/i,
        `Expected validation error for invalid vote ${invalidVote}, got: ${voteErrText}`,
      );
    }

    const putReqs = mockAdo.requests.filter((r) => r.method === 'PUT');
    assert.equal(
      putReqs.length,
      0,
      `Expected zero PUT requests for invalid vote values, got ${putReqs.length}`,
    );
    client.assertCleanStdout();
  });

  test('Area 5 (F14): vote_pull_request rejects voting on completed PR 43 and abandoned PR 44', async (t) => {
    const mockAdo = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mockAdo.close();
    });

    mockAdo.mutateState((st) => {
      st.pullRequests[44] = {
        ...structuredClone(st.pullRequests[43]),
        pullRequestId: 44,
        codeReviewId: 44,
        status: 'abandoned',
        title: 'Abandoned pull request for negative vote test',
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
    const voteTool = findTool(listRes, 'vote_pull_request');
    const approveVote = resolveApproveVoteValue(voteTool);

    const completedRes = await client.callTool('vote_pull_request', {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 43,
      vote: approveVote,
    });
    assert.equal(
      completedRes.isError,
      true,
      'Expected voting on completed PR 43 to return isError: true',
    );
    const { text: completedText } = unwrapToolResultText(completedRes, {
      allowError: true,
    });
    assert.match(completedText, /completed|not active|cannot/i);

    const abandonedRes = await client.callTool('vote_pull_request', {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 44,
      vote: approveVote,
    });
    assert.equal(
      abandonedRes.isError,
      true,
      'Expected voting on abandoned PR 44 to return isError: true',
    );
    const { text: abandonedText } = unwrapToolResultText(abandonedRes, {
      allowError: true,
    });
    assert.match(abandonedText, /abandoned|not active|cannot/i);
    client.assertCleanStdout();
  });

  test('Area 5 (F13/F15): manage_pull_request_reviewers rejects ambiguous identity (ambiguous@example.com) with zero mutations', async (t) => {
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
    const manageTool = findTool(listRes, 'manage_pull_request_reviewers');
    const { args } = buildManageReviewersArgs(manageTool, {
      pullRequestId: 42,
      action: 'add',
      identifiers: ['ambiguous@example.com'],
    });

    mockAdo.clearRequests();
    const res = await client.callTool('manage_pull_request_reviewers', args);
    const { text } = unwrapToolResultText(res, { allowError: true });

    const mutReqs = mockAdo.requests.filter(
      (r) =>
        (r.method === 'PUT' || r.method === 'POST') &&
        /\/reviewers/i.test(r.relPath),
    );
    assert.equal(
      mutReqs.length,
      0,
      'Expected zero PUT/POST reviewer mutations on ambiguous identity match',
    );
    assert.equal(
      mockAdo.state.pullRequests[42].reviewers.length,
      2,
      'Expected PR 42 reviewers list to remain untouched',
    );
    assert.equal(
      res.isError,
      true,
      `Expected ambiguous identity lookup (ambiguous@example.com) to return isError: true, got text=${text}`,
    );
    assert.match(
      text,
      /ambiguous|multiple|more than one/i,
      `Expected error text to explain ambiguous identity match, got: ${text}`,
    );
    client.assertCleanStdout();
  });

  test('Area 5 (F13/F15): manage_pull_request_reviewers rejects unknown email (nobody@example.com) with zero mutations', async (t) => {
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
    const manageTool = findTool(listRes, 'manage_pull_request_reviewers');
    const { args } = buildManageReviewersArgs(manageTool, {
      pullRequestId: 42,
      action: 'add',
      identifiers: ['nobody@example.com'],
    });

    mockAdo.clearRequests();
    const res = await client.callTool('manage_pull_request_reviewers', args);
    const { text } = unwrapToolResultText(res, { allowError: true });

    const mutReqs = mockAdo.requests.filter(
      (r) =>
        (r.method === 'PUT' || r.method === 'POST') &&
        /\/reviewers/i.test(r.relPath),
    );
    assert.equal(
      mutReqs.length,
      0,
      'Expected zero PUT/POST reviewer mutations for unknown identity',
    );
    assert.equal(
      res.isError,
      true,
      `Expected unknown identity (nobody@example.com) to return isError: true, got text=${text}`,
    );
    assert.match(
      text,
      /not found|no .*match|unknown|could not|unable|nobody@example\.com/i,
    );
    client.assertCleanStdout();
  });

  test('Area 5 (F15): manage_pull_request_reviewers surfaces explicit per-reviewer partial failure instead of silently swallowing', async (t) => {
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
    const manageTool = findTool(listRes, 'manage_pull_request_reviewers');

    // Bob (2222...) is on PR 42 (-> 204 DELETE); Charlie (3333...) is NOT on PR 42 (-> 404 DELETE)
    const { args, isBatch } = buildManageReviewersArgs(manageTool, {
      pullRequestId: 42,
      action: 'remove',
      identifiers: [BOB_ID, CHARLIE_ID],
    });

    if (!isBatch) {
      // Single-reviewer schema: directly remove missing Charlie and assert explicit error
      const singleArgs = buildManageReviewersArgs(manageTool, {
        pullRequestId: 42,
        action: 'remove',
        identifiers: [CHARLIE_ID],
      }).args;
      const singleRes = await client.callTool(
        'manage_pull_request_reviewers',
        singleArgs,
      );
      assert.equal(
        singleRes.isError,
        true,
        'Expected removing non-existent reviewer Charlie to return isError: true',
      );
      const { text } = unwrapToolResultText(singleRes, { allowError: true });
      assert.match(text, /33333333|not found|404/i);
      client.assertCleanStdout();
      return;
    }

    mockAdo.clearRequests();
    const res = await client.callTool('manage_pull_request_reviewers', args);
    const { text } = unwrapToolResultText(res, { allowError: true });

    const deleteReqs = mockAdo.requests.filter(
      (r) => r.method === 'DELETE' && /\/reviewers\//i.test(r.relPath),
    );
    assert.ok(
      deleteReqs.some((r) => r.relPath.toLowerCase().includes(CHARLIE_ID)),
      'Expected DELETE attempt against Charlie UUID',
    );
    assert.ok(
      res.isError === true ||
        (/33333333-3333-4333-8333-333333333333/i.test(text) &&
          /fail|error|not found|404/i.test(text)),
      `Expected partial failure for Charlie to be explicitly surfaced (not silently swallowed), got isError=${res.isError} text=${text}`,
    );
    client.assertCleanStdout();
  });

  test('Area 5 (F16): list_branches rejects combining filter and includeMyBranches: true', async (t) => {
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
    findTool(listRes, 'list_branches');

    mockAdo.clearRequests();
    const res = await client.callTool('list_branches', {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      filter: 'heads/feature',
      includeMyBranches: true,
    });
    assert.equal(
      res.isError,
      true,
      'Expected combining filter + includeMyBranches: true to return isError: true',
    );
    const { text } = unwrapToolResultText(res, { allowError: true });
    assert.match(text, /includeMyBranches|filter|combin|exclusive|cannot/i);
    const refGets = mockAdo.requests.filter(
      (r) =>
        r.method === 'GET' &&
        /\/_apis\/git\/repositories\/[^/]+\/refs/i.test(r.relPath),
    );
    assert.equal(
      refGets.length,
      0,
      `Expected client-side mutual-exclusion guard with 0 GET .../refs requests when combining filter + includeMyBranches, got ${refGets.length}`,
    );
    client.assertCleanStdout();
  });

  test('Area 5 (F16): list_branches caps/rejects $top > 1000 and negotiates 5.0 gracefully on server-2019-rtm', async (t) => {
    // Part A: top > 1000 rejected OR clamped to <= 1000 on services
    const servicesMock = await createMockAdoServer({
      profile: 'services',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await servicesMock.close();
    });

    const servicesClient = createStdioMcpClient({
      env: makePatEnv(servicesMock.collectionUrl),
    });
    t.after(async () => {
      await servicesClient.close();
    });

    await servicesClient.initialize();
    const servicesTools = await servicesClient.listTools();
    const branchesTool = findTool(servicesTools, 'list_branches');
    const topKey = resolveProp(branchesTool, ['top', 'maxResults', 'limit']);

    servicesMock.clearRequests();
    const overTopRes = await servicesClient.callTool('list_branches', {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      [topKey]: 1001,
    });
    if (overTopRes.isError !== true) {
      const refGets = servicesMock.requests.filter(
        (r) =>
          r.method === 'GET' &&
          /\/_apis\/git\/repositories\/.+\/refs$/i.test(r.relPath),
      );
      assert.ok(
        refGets.length >= 1,
        'Expected GET .../git/.../refs wire call when clamping top=1001',
      );
      for (const req of refGets) {
        assert.ok(
          Object.hasOwn(req.query, '$top') &&
            Number(req.query.$top) >= 1 &&
            Number(req.query.$top) <= 1000,
          `Expected wire $top clamped to [1..1000], got $top=${req.query.$top}`,
        );
      }
    } else {
      const { text: overTopText } = unwrapToolResultText(overTopRes, {
        allowError: true,
      });
      assert.match(
        overTopText,
        /top|1000|max|limit|range|invalid/i,
        `Expected validation error for list_branches top=1001, got: ${overTopText}`,
      );
      const unclampedReqs = servicesMock.requests.filter(
        (r) => Object.hasOwn(r.query, '$top') && Number(r.query.$top) > 1000,
      );
      assert.equal(
        unclampedReqs.length,
        0,
        `Expected zero wire requests with $top > 1000 when rejecting, got ${unclampedReqs.length}`,
      );
    }
    servicesClient.assertCleanStdout();

    // Part B: server-2019-rtm negotiates api-version 5.0, omits continuationToken, and returns branches cleanly
    const mock2019 = await createMockAdoServer({
      profile: 'server-2019-rtm',
      expectedPat: TEST_PAT,
    });
    t.after(async () => {
      await mock2019.close();
    });

    const client2019 = createStdioMcpClient({
      env: makePatEnv(mock2019.collectionUrl),
    });
    t.after(async () => {
      await client2019.close();
    });

    await client2019.initialize();
    mock2019.clearRequests();

    const res2019 = await client2019.callTool('list_branches', {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
    });
    assert.notEqual(
      res2019.isError,
      true,
      `Expected list_branches to succeed on server-2019-rtm, got: ${JSON.stringify(res2019)}`,
    );
    const { text: branchesText } = unwrapToolResultText(res2019);
    assert.match(branchesText, /main/i);
    assert.match(branchesText, /feature\/analytics/i);

    const refGets = mock2019.requests.filter(
      (r) =>
        r.method === 'GET' &&
        /\/_apis\/git\/repositories\/.+\/refs$/i.test(r.relPath),
    );
    assert.ok(refGets.length >= 1, 'Expected GET .../git/.../refs on 2019');
    for (const req of refGets) {
      assert.equal(
        req.apiVersion,
        '5.0',
        `Expected api-version 5.0 negotiated on server-2019-rtm, got ${req.apiVersion}`,
      );
      assert.equal(
        Object.hasOwn(req.query, 'continuationToken'),
        false,
        `Expected server-2019-rtm list_branches to omit continuationToken, saw query=${JSON.stringify(req.query)}`,
      );
      if (Object.hasOwn(req.query, '$top')) {
        assert.ok(
          Number(req.query.$top) >= 1 && Number(req.query.$top) <= 1000,
          `Expected bounded $top in [1..1000] if sent on server-2019-rtm, saw $top=${req.query.$top}`,
        );
      }
    }
    client2019.assertCleanStdout();
  });
});
