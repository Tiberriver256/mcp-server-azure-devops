import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

import { repoPath, unwrapToolResultJson } from '../harness/assertions.mjs';
import { createStdioMcpClient } from '../harness/mcp-stdio-client.mjs';
import { createMockAdoServer } from '../harness/mock-ado-server.mjs';

const requireFromHere = createRequire(import.meta.url);

const ALICE_ID = '11111111-1111-4111-8111-111111111111';
const BOB_ID = '22222222-2222-4222-8222-222222222222';
const CHARLIE_ID = '33333333-3333-4333-8333-333333333333';

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

function buildReviewerMutationArgs(
  tool,
  actionCandidates,
  reviewerIdentifier,
  isRequired,
) {
  const props = tool.inputSchema?.properties ?? {};
  const requiredFields = new Set(tool.inputSchema?.required ?? []);
  const actionKey = resolvePropKey(tool, ['action', 'operation']);
  const actionVal = resolveSchemaValue(tool, actionKey, actionCandidates);

  const args = {
    pullRequestId: 42,
    [actionKey]: actionVal,
  };
  const projKey = resolvePropKey(tool, ['projectId', 'project'], {
    required: false,
  });
  if (
    projKey &&
    (requiredFields.has(projKey) || Object.hasOwn(props, projKey))
  ) {
    args[projKey] = 'DemoProject';
  }
  const repoKey = resolvePropKey(tool, ['repositoryId', 'repository'], {
    required: false,
  });
  if (
    repoKey &&
    (requiredFields.has(repoKey) || Object.hasOwn(props, repoKey))
  ) {
    args[repoKey] = 'DemoRepo';
  }

  const reviewersKey = resolvePropKey(tool, ['reviewers'], { required: false });
  const singleKey = resolvePropKey(tool, ['reviewerId', 'reviewer'], {
    required: false,
  });
  const topReqKey = resolvePropKey(tool, ['isRequired', 'required'], {
    required: false,
  });

  if (reviewersKey) {
    const arrayBranches = flattenSchemaBranches(props[reviewersKey]).filter(
      (b) => branchHasType(b, ['array']) || b.items !== undefined,
    );
    const itemBranches = arrayBranches.flatMap((b) =>
      flattenSchemaBranches(b.items),
    );
    const objectBranches = itemBranches.filter(
      (b) =>
        branchHasType(b, ['object']) ||
        (b.properties && typeof b.properties === 'object'),
    );
    const hasStringItemBranch = itemBranches.some((b) =>
      branchHasType(b, ['string']),
    );

    // When isRequired is specified (add/update), prefer an object branch that accepts isRequired/required.
    // When isRequired is undefined (remove), prefer string items if accepted so required-boolean object branches don't fail validation.
    const selectedObjBranch =
      isRequired !== undefined
        ? (objectBranches.find((b) => {
            const p = b.properties ?? {};
            return (
              Object.hasOwn(p, 'isRequired') || Object.hasOwn(p, 'required')
            );
          }) ??
          objectBranches[0] ??
          null)
        : hasStringItemBranch
          ? null
          : (objectBranches[0] ?? null);

    if (selectedObjBranch) {
      const itemProps = selectedObjBranch.properties ?? {};
      const idField =
        ['id', 'reviewerId', 'reviewer', 'identifier', 'email'].find((k) =>
          Object.hasOwn(itemProps, k),
        ) ?? 'id';
      const entry = { [idField]: reviewerIdentifier };
      if (isRequired !== undefined) {
        const itemReqField = Object.hasOwn(itemProps, 'isRequired')
          ? 'isRequired'
          : Object.hasOwn(itemProps, 'required')
            ? 'required'
            : null;
        if (itemReqField) {
          entry[itemReqField] = isRequired;
        } else if (topReqKey) {
          args[topReqKey] = isRequired;
        } else {
          assert.fail(
            `Tool "${tool.name}" reviewer object schema lacks isRequired/required property`,
          );
        }
      }
      args[reviewersKey] = [entry];
    } else {
      args[reviewersKey] = [reviewerIdentifier];
      if (isRequired !== undefined) {
        assert.ok(
          topReqKey,
          `Tool "${tool.name}" string-array "${reviewersKey}" schema lacks top-level isRequired/required property`,
        );
        args[topReqKey] = isRequired;
      }
    }
  } else if (singleKey) {
    args[singleKey] = reviewerIdentifier;
    if (isRequired !== undefined) {
      assert.ok(
        topReqKey,
        `Tool "${tool.name}" lacks top-level isRequired/required property`,
      );
      args[topReqKey] = isRequired;
    }
  } else {
    assert.fail(
      `Tool "${tool.name}" lacks reviewers/reviewerId/reviewer parameter. Found: [${Object.keys(props).join(', ')}]`,
    );
  }

  return args;
}

describe('Tier 1 — Area 5: PR Review Actions, Identities & Branches (F13, F14, F15, F16)', () => {
  it('T4.1 [F13] resolveAzureDevOpsBaseUrls routes identityBaseUrl to vssps.dev.azure.com on Cloud Services and coreBaseUrl on On-Prem Server', () => {
    const urlMod = requireFromHere(repoPath('dist/shared/azure-devops-url.js'));
    assert.equal(
      typeof urlMod.resolveAzureDevOpsBaseUrls,
      'function',
      'Expected resolveAzureDevOpsBaseUrls export in dist/shared/azure-devops-url.js',
    );

    const cloudModern = urlMod.resolveAzureDevOpsBaseUrls(
      'https://dev.azure.com/contoso',
    );
    assert.equal(cloudModern.type ?? cloudModern.deploymentType, 'services');
    assert.equal(cloudModern.coreBaseUrl, 'https://dev.azure.com/contoso');
    assert.equal(
      cloudModern.identityBaseUrl,
      'https://vssps.dev.azure.com/contoso',
    );

    const cloudLegacy = urlMod.resolveAzureDevOpsBaseUrls(
      'https://contoso.visualstudio.com',
    );
    assert.equal(cloudLegacy.type ?? cloudLegacy.deploymentType, 'services');
    assert.equal(
      cloudLegacy.identityBaseUrl,
      'https://vssps.dev.azure.com/contoso',
    );

    const onPremTfs = urlMod.resolveAzureDevOpsBaseUrls(
      'https://ado.corp:8080/tfs/DefaultCollection',
    );
    assert.equal(onPremTfs.type ?? onPremTfs.deploymentType, 'server');
    assert.equal(
      onPremTfs.identityBaseUrl,
      'https://ado.corp:8080/tfs/DefaultCollection',
    );
    assert.equal(onPremTfs.identityBaseUrl, onPremTfs.coreBaseUrl);

    const onPremRoot = urlMod.resolveAzureDevOpsBaseUrls(
      'https://ado.corp/DefaultCollection',
    );
    assert.equal(onPremRoot.type ?? onPremRoot.deploymentType, 'server');
    assert.equal(
      onPremRoot.identityBaseUrl,
      'https://ado.corp/DefaultCollection',
    );
    assert.equal(onPremRoot.identityBaseUrl, onPremRoot.coreBaseUrl);
  });

  it('T4.2 [F13, F14] vote_pull_request casts approval (10), auto-derives repositoryId & self reviewerId, and preserves isRequired: true', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'vote_pull_request');

    const voteKey = resolvePropKey(tool, ['vote']);
    const approveValue = resolveSchemaValue(tool, voteKey, [
      'approve',
      'approved',
      10,
    ]);

    const requiredFields = new Set(tool.inputSchema?.required ?? []);
    const projKey = resolvePropKey(tool, ['projectId', 'project'], {
      required: false,
    });
    const callArgs = {
      pullRequestId: 42,
      [voteKey]: approveValue,
    };
    if (projKey && requiredFields.has(projKey)) {
      callArgs[projKey] = 'DemoProject';
    }
    // Deliberately omit repositoryId and reviewerId to verify auto-derivation
    const res = await client.callTool('vote_pull_request', callArgs);
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    assert.ok(
      data && typeof data === 'object',
      'Expected object response from vote_pull_request',
    );
    assert.equal(
      data.isRequired ?? data.reviewer?.isRequired,
      true,
      `Expected vote_pull_request response to confirm isRequired: true, got ${JSON.stringify(data)}`,
    );
    const returnedVote = data.vote ?? data.reviewer?.vote;
    assert.ok(
      returnedVote === 10 ||
        (typeof returnedVote === 'string' &&
          ['approve', 'approved'].includes(returnedVote.toLowerCase())),
      `Expected vote_pull_request response to confirm approval (10), got ${JSON.stringify(data)}`,
    );

    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'GET' &&
          /^\/_apis\/connectiondata$/i.test(req.relPath),
      ),
      'Expected GET /_apis/connectionData to resolve current caller identity',
    );
    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'GET' &&
          /\/_apis\/git\/pullrequests\/42$/i.test(req.relPath),
      ),
      'Expected GET PR 42 to auto-derive repositoryId',
    );

    const putReq = mockAdo.requests.find(
      (req) =>
        req.method === 'PUT' &&
        new RegExp(`/pullrequests/42/reviewers/${ALICE_ID}$`, 'i').test(
          req.relPath,
        ),
    );
    assert.ok(putReq, `Expected PUT .../pullRequests/42/reviewers/${ALICE_ID}`);
    assert.equal(
      putReq.parsedBody?.vote,
      10,
      `Expected wire vote === 10, got ${JSON.stringify(putReq.parsedBody)}`,
    );
    assert.equal(
      putReq.parsedBody?.isRequired,
      true,
      `Expected wire PUT body to preserve isRequired: true, got ${JSON.stringify(putReq.parsedBody)}`,
    );

    const aliceState = mockAdo.state.pullRequests[42].reviewers.find(
      (r) => r.id.toLowerCase() === ALICE_ID,
    );
    assert.ok(aliceState, 'Expected Alice reviewer entry in PR 42 state');
    assert.equal(aliceState.vote, 10);
    assert.equal(aliceState.isRequired, true);
  });

  it('T4.3 [F14] vote_pull_request casts reject (-10) and resets to noVote (0) while preserving isRequired: true', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'vote_pull_request');

    const voteKey = resolvePropKey(tool, ['vote']);
    const rejectVal = resolveSchemaValue(tool, voteKey, [
      'reject',
      'rejected',
      -10,
    ]);
    const noVoteVal = resolveSchemaValue(tool, voteKey, [
      'noVote',
      'no_vote',
      'reset',
      'none',
      0,
    ]);

    // Step 1: Reject (-10)
    const rejectRes = await client.callTool('vote_pull_request', {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 42,
      [voteKey]: rejectVal,
    });
    const rejectData = unwrapToolResultJson(rejectRes, {
      expectSpotlighted: true,
    });
    assert.equal(
      rejectData.isRequired ?? rejectData.reviewer?.isRequired,
      true,
      `Expected reject response to confirm isRequired: true, got ${JSON.stringify(rejectData)}`,
    );
    const rejectVote = rejectData.vote ?? rejectData.reviewer?.vote;
    assert.ok(
      rejectVote === -10 ||
        (typeof rejectVote === 'string' &&
          ['reject', 'rejected'].includes(rejectVote.toLowerCase())),
      `Expected reject response vote -10, got ${JSON.stringify(rejectData)}`,
    );

    const aliceAfterReject = mockAdo.state.pullRequests[42].reviewers.find(
      (r) => r.id.toLowerCase() === ALICE_ID,
    );
    assert.equal(aliceAfterReject.vote, -10);
    assert.equal(aliceAfterReject.isRequired, true);

    // Step 2: Reset to noVote (0)
    const resetRes = await client.callTool('vote_pull_request', {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 42,
      [voteKey]: noVoteVal,
    });
    const resetData = unwrapToolResultJson(resetRes, {
      expectSpotlighted: true,
    });
    assert.equal(
      resetData.isRequired ?? resetData.reviewer?.isRequired,
      true,
      `Expected reset response to confirm isRequired: true, got ${JSON.stringify(resetData)}`,
    );
    const resetVote = resetData.vote ?? resetData.reviewer?.vote;
    assert.ok(
      resetVote === 0 ||
        (typeof resetVote === 'string' &&
          ['novote', 'no_vote', 'reset', 'none'].includes(
            resetVote.toLowerCase(),
          )),
      `Expected reset response vote 0, got ${JSON.stringify(resetData)}`,
    );

    const putReqs = mockAdo.requests.filter(
      (req) =>
        req.method === 'PUT' &&
        new RegExp(`/pullrequests/42/reviewers/${ALICE_ID}$`, 'i').test(
          req.relPath,
        ),
    );
    assert.equal(putReqs.length, 2, 'Expected 2 PUT reviewer vote requests');
    assert.equal(putReqs[0].parsedBody?.vote, -10);
    assert.equal(putReqs[0].parsedBody?.isRequired, true);
    assert.equal(putReqs[1].parsedBody?.vote, 0);
    assert.equal(putReqs[1].parsedBody?.isRequired, true);

    const aliceAfterReset = mockAdo.state.pullRequests[42].reviewers.find(
      (r) => r.id.toLowerCase() === ALICE_ID,
    );
    assert.equal(aliceAfterReset.vote, 0);
    assert.equal(aliceAfterReset.isRequired, true);
  });

  it('T4.4 [F15] manage_pull_request_reviewers lists reviewers on PR 42', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'manage_pull_request_reviewers');
    const actionKey = resolvePropKey(tool, ['action', 'operation']);
    const listVal = resolveSchemaValue(tool, actionKey, ['list']);

    const res = await client.callTool('manage_pull_request_reviewers', {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 42,
      [actionKey]: listVal,
    });
    const reviewers = extractListItems(
      unwrapToolResultJson(res, { expectSpotlighted: true }),
      ['reviewers'],
    );
    assert.equal(
      reviewers.length,
      2,
      'Expected exactly 2 seeded reviewers on PR 42',
    );
    const alice = reviewers.find(
      (r) => String(r.id ?? '').toLowerCase() === ALICE_ID,
    );
    const bob = reviewers.find(
      (r) => String(r.id ?? '').toLowerCase() === BOB_ID,
    );
    assert.ok(alice, 'Expected Alice in PR 42 reviewers list');
    assert.equal(alice.isRequired, true);
    assert.ok(bob, 'Expected Bob in PR 42 reviewers list');
    assert.equal(bob.isRequired, false);

    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'GET' &&
          /\/pullrequests\/42\/reviewers$/i.test(req.relPath),
      ),
      'Expected GET .../pullRequests/42/reviewers',
    );
  });

  it('T4.5 [F15] manage_pull_request_reviewers adds/updates reviewer by GUID (Charlie) with isRequired: true without needing identity lookup', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'manage_pull_request_reviewers');

    const args = buildReviewerMutationArgs(
      tool,
      ['add', 'upsert', 'update'],
      CHARLIE_ID,
      true,
    );
    const res = await client.callTool('manage_pull_request_reviewers', args);
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    assert.ok(
      JSON.stringify(data).toLowerCase().includes(CHARLIE_ID),
      'Expected Charlie GUID in add reviewer response',
    );

    const identityLookups = mockAdo.requests.filter((req) =>
      /\/_apis\/identities/i.test(req.relPath),
    );
    assert.equal(
      identityLookups.length,
      0,
      'Adding a reviewer by GUID must NOT perform unnecessary /_apis/identities lookup',
    );

    const mutationReq = mockAdo.requests.find(
      (req) =>
        (req.method === 'PUT' &&
          new RegExp(`/pullrequests/42/reviewers/${CHARLIE_ID}$`, 'i').test(
            req.relPath,
          )) ||
        (req.method === 'POST' &&
          /\/pullrequests\/42\/reviewers$/i.test(req.relPath)),
    );
    assert.ok(
      mutationReq,
      'Expected PUT or POST reviewer mutation for Charlie GUID',
    );
    if (mutationReq.method === 'PUT') {
      assert.equal(
        mutationReq.parsedBody?.isRequired,
        true,
        `Expected wire PUT body isRequired: true, got ${JSON.stringify(mutationReq.parsedBody)}`,
      );
    } else {
      assert.ok(
        Array.isArray(mutationReq.parsedBody) &&
          mutationReq.parsedBody.some(
            (r) =>
              String(r?.id ?? '').toLowerCase() === CHARLIE_ID &&
              r?.isRequired === true,
          ),
        `Expected wire POST body entry for Charlie with isRequired: true, got ${JSON.stringify(mutationReq.parsedBody)}`,
      );
    }

    const charlieState = mockAdo.state.pullRequests[42].reviewers.find(
      (r) => r.id.toLowerCase() === CHARLIE_ID,
    );
    assert.ok(
      charlieState,
      'Expected Charlie added to mockAdo.state.pullRequests[42].reviewers',
    );
    assert.equal(charlieState.isRequired, true);
  });

  it('T4.6 [F13, F15] manage_pull_request_reviewers resolves email charlie@example.com via GET /_apis/identities on coreBaseUrl and adds required reviewer', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'manage_pull_request_reviewers');

    const args = buildReviewerMutationArgs(
      tool,
      ['add', 'upsert', 'update'],
      'charlie@example.com',
      true,
    );
    const res = await client.callTool('manage_pull_request_reviewers', args);
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    assert.ok(
      JSON.stringify(data).toLowerCase().includes(CHARLIE_ID),
      'Expected resolved Charlie GUID in response',
    );

    const idLookup = mockAdo.requests.find(
      (req) =>
        req.method === 'GET' &&
        /^\/_apis\/identities$/i.test(req.relPath) &&
        String(getQueryParamCI(req.query, 'filterValue') ?? '')
          .toLowerCase()
          .includes('charlie@example.com'),
    );
    assert.ok(
      idLookup,
      'Expected GET /_apis/identities?filterValue=charlie@example.com on mock ADO server',
    );

    const mutationReq = mockAdo.requests.find(
      (req) =>
        (req.method === 'PUT' &&
          new RegExp(`/pullrequests/42/reviewers/${CHARLIE_ID}$`, 'i').test(
            req.relPath,
          )) ||
        (req.method === 'POST' &&
          /\/pullrequests\/42\/reviewers$/i.test(req.relPath)),
    );
    assert.ok(
      mutationReq,
      'Expected PUT or POST reviewer mutation for resolved Charlie GUID',
    );

    const charlieState = mockAdo.state.pullRequests[42].reviewers.find(
      (r) => r.id.toLowerCase() === CHARLIE_ID,
    );
    assert.ok(
      charlieState,
      'Expected Charlie present in PR 42 reviewers state',
    );
    assert.equal(charlieState.isRequired, true);
  });

  it('T4.7 [F15] manage_pull_request_reviewers removes existing reviewer (Bob) cleanly', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'manage_pull_request_reviewers');

    const args = buildReviewerMutationArgs(
      tool,
      ['remove', 'delete'],
      BOB_ID,
      undefined,
    );
    const res = await client.callTool('manage_pull_request_reviewers', args);
    const data = unwrapToolResultJson(res, { expectSpotlighted: true });
    assert.ok(
      data !== null && typeof data === 'object',
      'Expected structured response from remove reviewer call',
    );
    const ser = JSON.stringify(data).toLowerCase();
    assert.ok(
      ser.includes(BOB_ID) ||
        ser.includes(ALICE_ID) ||
        ser.includes('remove') ||
        ser.includes('delete'),
      `Expected remove response to report removed/remaining reviewer info, got: ${ser.slice(0, 300)}`,
    );

    const delReq = mockAdo.requests.find(
      (req) =>
        req.method === 'DELETE' &&
        new RegExp(`/pullrequests/42/reviewers/${BOB_ID}$`, 'i').test(
          req.relPath,
        ),
    );
    assert.ok(
      delReq,
      `Expected DELETE .../pullRequests/42/reviewers/${BOB_ID}`,
    );

    assert.equal(
      mockAdo.state.pullRequests[42].reviewers.some(
        (r) => r.id.toLowerCase() === BOB_ID,
      ),
      false,
      'Expected Bob removed from PR 42 reviewers state',
    );
    assert.equal(
      mockAdo.state.pullRequests[42].reviewers.some(
        (r) => r.id.toLowerCase() === ALICE_ID,
      ),
      true,
      'Expected Alice to remain in PR 42 reviewers state',
    );
  });

  it('T4.8 [F16] list_branches lists heads-only branches with clean names (stripped refs/heads/), refName, $top, and x-ms-continuationtoken pagination', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    requireTool(tools, 'list_branches');

    const page1Res = await client.callTool('list_branches', {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      top: 2,
    });
    const page1 = unwrapToolResultJson(page1Res, { expectSpotlighted: true });
    const branches1 = extractListItems(page1, ['branches', 'refs']);
    assert.equal(branches1.length, 2, 'Expected 2 branches on page 1');
    for (const branch of branches1) {
      assert.equal(
        typeof branch.name,
        'string',
        `Expected string branch.name, got ${JSON.stringify(branch)}`,
      );
      assert.equal(
        branch.name.startsWith('refs/heads/'),
        false,
        `Expected branch.name to strip "refs/heads/" prefix, got "${branch.name}"`,
      );
      assert.equal(
        branch.refName,
        `refs/heads/${branch.name}`,
        `Expected refName "refs/heads/${branch.name}", got ${JSON.stringify(branch.refName)}`,
      );
      assert.equal(
        branch.name.includes('v0.1.0'),
        false,
        'Tags (refs/tags/v0.1.0) must be excluded from list_branches',
      );
    }

    const nextToken1 = page1.continuationToken ?? page1.nextContinuationToken;
    assert.equal(
      nextToken1,
      '2',
      `Expected continuationToken "2" from x-ms-continuationtoken header, got ${JSON.stringify(nextToken1)}`,
    );

    const page2Res = await client.callTool('list_branches', {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      top: 2,
      continuationToken: nextToken1,
    });
    const page2 = unwrapToolResultJson(page2Res, { expectSpotlighted: true });
    const branches2 = extractListItems(page2, ['branches', 'refs']);
    assert.equal(branches2.length, 2, 'Expected 2 branches on page 2');
    for (const branch of branches2) {
      assert.equal(
        branch.name.startsWith('refs/heads/'),
        false,
        `Expected clean branch name on page 2, got "${branch.name}"`,
      );
      assert.equal(
        branch.refName,
        `refs/heads/${branch.name}`,
        `Expected refName "refs/heads/${branch.name}" on page 2, got ${JSON.stringify(branch.refName)}`,
      );
    }
    const page1Names = new Set(branches1.map((b) => b.name));
    for (const branch of branches2) {
      assert.equal(
        page1Names.has(branch.name),
        false,
        `Expected page 2 branch "${branch.name}" to be distinct from page 1`,
      );
    }
    assert.equal(
      page2.continuationToken ?? page2.nextContinuationToken,
      '4',
      'Expected continuationToken "4" on page 2',
    );

    const refsReqs = mockAdo.requests.filter(
      (req) =>
        req.method === 'GET' &&
        /\/git\/repositories\/DemoRepo\/refs$/i.test(req.relPath),
    );
    assert.equal(refsReqs.length, 2, 'Expected 2 GET .../refs requests');
    assert.ok(
      String(getQueryParamCI(refsReqs[0].query, 'filter') ?? '').startsWith(
        'heads/',
      ),
      `Expected filter=heads/... on call 1, got ${JSON.stringify(refsReqs[0].query)}`,
    );
    assert.equal(getQueryParamCI(refsReqs[0].query, '$top'), '2');
    assert.equal(getQueryParamCI(refsReqs[1].query, 'continuationToken'), '2');
    assert.equal(getQueryParamCI(refsReqs[1].query, '$top'), '2');
  });

  it('T4.9 [F16] list_branches supports includeMyBranches: true (omitting filter) and includeStats: true (aheadCount/behindCount from stats/branches)', async (t) => {
    const addCleanup = registerCleanup(t);
    const mockAdo = await createMockAdoServer({ profile: 'services' });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({ env: makeStandardEnv(mockAdo) });
    addCleanup(() => client.close());

    await client.initialize();
    const { tools } = await client.listTools();
    const tool = requireTool(tools, 'list_branches');
    const statsKey = resolvePropKey(tool, [
      'includeStats',
      'includeStatistics',
    ]);

    // 1. includeMyBranches: true must omit filter on the wire
    const mineRes = await client.callTool('list_branches', {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      includeMyBranches: true,
    });
    const mineBranches = extractListItems(
      unwrapToolResultJson(mineRes, { expectSpotlighted: true }),
      ['branches', 'refs'],
    );
    const mineNames = mineBranches
      .map((b) => String(b.name ?? '').replace(/^refs\/heads\//, ''))
      .sort();
    assert.deepEqual(
      mineNames,
      ['feature/analytics', 'main', 'release/1.0'],
      'Expected only Alice branches under includeMyBranches: true',
    );

    const mineReq = mockAdo.requests.find(
      (req) =>
        req.method === 'GET' &&
        /\/git\/repositories\/DemoRepo\/refs$/i.test(req.relPath),
    );
    assert.ok(mineReq, 'Expected GET .../refs for includeMyBranches');
    assert.equal(
      String(
        getQueryParamCI(mineReq.query, 'includeMyBranches') ?? '',
      ).toLowerCase(),
      'true',
    );
    assert.equal(
      getQueryParamCI(mineReq.query, 'filter'),
      undefined,
      `Expected filter query param omitted when includeMyBranches=true, got ${JSON.stringify(mineReq.query)}`,
    );

    // 2. includeStats: true enriches aheadCount / behindCount from stats/branches
    mockAdo.clearRequests();
    const statsRes = await client.callTool('list_branches', {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      [statsKey]: true,
    });
    const statsBranches = extractListItems(
      unwrapToolResultJson(statsRes, { expectSpotlighted: true }),
      ['branches', 'refs'],
    );

    assert.ok(
      mockAdo.requests.some(
        (req) =>
          req.method === 'GET' &&
          /\/git\/repositories\/DemoRepo\/stats\/branches$/i.test(req.relPath),
      ),
      'Expected GET .../stats/branches call when includeStats: true',
    );

    const analyticsBranch = statsBranches.find(
      (b) =>
        String(b.name ?? '').replace(/^refs\/heads\//, '') ===
        'feature/analytics',
    );
    const prVotingBranch = statsBranches.find(
      (b) =>
        String(b.name ?? '').replace(/^refs\/heads\//, '') ===
        'feature/pr-voting',
    );
    assert.ok(analyticsBranch, 'Expected feature/analytics in stats response');
    assert.ok(prVotingBranch, 'Expected feature/pr-voting in stats response');

    const analyticsAhead =
      analyticsBranch.aheadCount ?? analyticsBranch.stats?.aheadCount;
    const analyticsBehind =
      analyticsBranch.behindCount ?? analyticsBranch.stats?.behindCount;
    assert.equal(analyticsAhead, 3);
    assert.equal(analyticsBehind, 0);

    const prAhead =
      prVotingBranch.aheadCount ?? prVotingBranch.stats?.aheadCount;
    const prBehind =
      prVotingBranch.behindCount ?? prVotingBranch.stats?.behindCount;
    assert.equal(prAhead, 2);
    assert.equal(prBehind, 1);
  });
});
