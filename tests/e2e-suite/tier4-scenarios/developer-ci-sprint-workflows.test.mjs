import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertSpotlighted,
  extractTextContent,
  parseSpotlightedText,
  readRepoFile,
  readRepoJson,
  repoFileExists,
  unwrapToolResultJson,
  unwrapToolResultText,
} from '../harness/assertions.mjs';
import {
  createHttpMcpClient,
  startHttpMcpServer,
} from '../harness/mcp-http-client.mjs';
import {
  JsonRpcError,
  createStdioMcpClient,
} from '../harness/mcp-stdio-client.mjs';
import { createMockAdoServer } from '../harness/mock-ado-server.mjs';

const TEST_PAT = 'e3-tier4-dev-pat-24680';
const CURSOR_REGEX = /^v1:[0-9a-f]{8}:\d+$/i;
const ALICE_UUID = '11111111-1111-4111-8111-111111111111';
const CHARLIE_UUID = '33333333-3333-4333-8333-333333333333';
const SPRINT_1_UUID = '10000000-0000-4000-8000-000000000001';
const SPRINT_2_UUID = '10000000-0000-4000-8000-000000000002';

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

function buildAdoEnv(mockAdo, extra = {}) {
  return {
    AZURE_DEVOPS_ORG_URL: mockAdo.url,
    AZURE_DEVOPS_AUTH_METHOD: 'pat',
    AZURE_DEVOPS_PAT: TEST_PAT,
    AZURE_DEVOPS_DEFAULT_PROJECT: 'DemoProject',
    AZURE_DEVOPS_API_VERSION: '7.0',
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
    if (Array.isArray(payload.revisions)) {
      return payload.revisions;
    }
    if (Array.isArray(payload.results)) {
      return payload.results;
    }
  }
  return [];
}

function assertFullFiveHintAnnotations(tool) {
  const ann = tool.annotations;
  assert.ok(
    ann && typeof ann === 'object',
    `Tool "${tool.name}" must expose an annotations object`,
  );
  assert.equal(
    typeof ann.title,
    'string',
    `Tool "${tool.name}" annotations.title must be a string`,
  );
  assert.ok(
    ann.title.trim().length > 0,
    `Tool "${tool.name}" annotations.title must be non-empty`,
  );
  assert.equal(
    typeof ann.readOnlyHint,
    'boolean',
    `Tool "${tool.name}" annotations.readOnlyHint must be a boolean`,
  );
  assert.equal(
    typeof ann.destructiveHint,
    'boolean',
    `Tool "${tool.name}" annotations.destructiveHint must be a boolean`,
  );
  assert.equal(
    typeof ann.idempotentHint,
    'boolean',
    `Tool "${tool.name}" annotations.idempotentHint must be a boolean`,
  );
  assert.equal(
    typeof ann.openWorldHint,
    'boolean',
    `Tool "${tool.name}" annotations.openWorldHint must be a boolean`,
  );
}

async function assertDirectToolBlocked(client, toolName, args) {
  let res;
  let caughtErr = null;
  try {
    res = await client.callTool(toolName, args);
  } catch (err) {
    caughtErr = err;
  }
  if (caughtErr !== null) {
    assert.ok(
      caughtErr instanceof JsonRpcError,
      `Expected blocked tool "${toolName}" to return isError or JsonRpcError, got: ${caughtErr}`,
    );
    return;
  }
  assert.equal(
    res.isError,
    true,
    `Blocked tool "${toolName}" must return isError: true`,
  );
}

function parseJsonc(text) {
  const withoutComments = text.replace(
    /"(?:\\.|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
    (match) => (match.startsWith('"') ? match : ''),
  );
  const withoutTrailingCommas = withoutComments.replace(
    /"(?:\\.|[^"\\])*"|,\s*([}\]])/g,
    (match, closing) => (match.startsWith('"') ? match : closing),
  );
  return JSON.parse(withoutTrailingCommas);
}

function extractCiNodeMatrix(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  const stripYamlComment = (line) => {
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
      } else if (ch === '"' && !inSingle && line[i - 1] !== '\\') {
        inDouble = !inDouble;
      } else if (
        ch === '#' &&
        !inSingle &&
        !inDouble &&
        (i === 0 || /\s/.test(line[i - 1]))
      ) {
        return line.slice(0, i);
      }
    }
    return line;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const clean = stripYamlComment(lines[i]);
    const inlineMatch = /^(\s*)node-version\s*:\s*\[([^\]]*)\]\s*$/i.exec(
      clean,
    );
    if (inlineMatch) {
      return inlineMatch[2]
        .split(',')
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    }
    const blockMatch = /^(\s*)node-version\s*:\s*$/i.exec(clean);
    if (blockMatch) {
      const baseIndent = blockMatch[1].length;
      const items = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        const subClean = stripYamlComment(lines[j]);
        if (subClean.trim().length === 0) {
          continue;
        }
        const itemMatch = /^(\s*)-\s*(.+?)\s*$/.exec(subClean);
        if (!itemMatch || itemMatch[1].length < baseIndent) {
          break;
        }
        items.push(itemMatch[2].replace(/^['"]|['"]$/g, ''));
      }
      if (items.length > 0) {
        return items;
      }
    }
  }
  return [];
}

function parseDockerfileStages(rawText) {
  // Strip blank and pure comment lines BEFORE collapsing line continuations so
  // `# /healthz` after `HEALTHCHECK NONE \` can never merge into an instruction.
  const instructions = [];
  let current = '';
  for (const rawLine of rawText.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }
    if (trimmed.endsWith('\\')) {
      current += `${trimmed.slice(0, -1)} `;
    } else {
      current += trimmed;
      instructions.push(current.trim());
      current = '';
    }
  }
  if (current.trim().length > 0) {
    instructions.push(current.trim());
  }

  const globalArgs = new Map();
  const stages = [];
  let currentStage = null;

  for (const instr of instructions) {
    if (/^FROM\s+/i.test(instr)) {
      currentStage = { from: instr, instructions: [] };
      stages.push(currentStage);
    } else if (currentStage === null) {
      const argMatch = /^ARG\s+([A-Za-z_][A-Za-z0-9_]*)(?:=(.*))?$/i.exec(
        instr,
      );
      if (argMatch && argMatch[2] !== undefined) {
        globalArgs.set(
          argMatch[1],
          argMatch[2].trim().replace(/^["']|["']$/g, ''),
        );
      }
    } else {
      currentStage.instructions.push(instr);
    }
  }

  const substituteGlobalArgs = (text) =>
    text.replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
      (full, braced, bare) => {
        const name = braced ?? bare;
        return globalArgs.has(name) ? globalArgs.get(name) : full;
      },
    );

  // Resolve 3-stage `FROM base AS runtime` alias chains back to base image ref.
  const aliasToImage = new Map();
  for (const stage of stages) {
    const substituted = substituteGlobalArgs(stage.from);
    const m = /^FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?$/i.exec(
      substituted,
    );
    if (m && m[2]) {
      aliasToImage.set(m[2].toLowerCase(), m[1]);
    }
  }

  const resolveFinalFrom = (fromInstr) => {
    const substituted = substituteGlobalArgs(fromInstr);
    const m = /^FROM\s+((?:--platform=\S+\s+)?)(\S+)(\s+AS\s+\S+)?$/i.exec(
      substituted,
    );
    if (!m) {
      return substituted;
    }
    let imageRef = m[2];
    for (let depth = 0; depth < 8; depth += 1) {
      const next = aliasToImage.get(imageRef.toLowerCase());
      if (!next || next === imageRef) {
        break;
      }
      imageRef = next;
    }
    return `FROM ${m[1]}${imageRef}${m[3] ?? ''}`;
  };

  return { stages, resolveFinalFrom };
}

function isDockerignoreEffective(lines, requiredIgnore) {
  const escaped = requiredIgnore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patternRe =
    requiredIgnore === '.env'
      ? /^(?:\*\*\/)?\.env(?:\*|\.\*)?$/
      : new RegExp(`^(?:\\*\\*\\/)?${escaped}(?:\\*|\\/(?:\\*{1,2})?)?$`);

  let excluded = false;
  for (const rawLine of lines) {
    if (rawLine.startsWith('!')) {
      const negated = rawLine.slice(1).trim().replace(/^\//, '');
      if (patternRe.test(negated)) {
        excluded = false;
      }
      continue;
    }
    const normalized = rawLine.replace(/^\//, '');
    if (patternRe.test(normalized)) {
      excluded = true;
    }
  }
  return excluded;
}

function buildBuildCompleteWebhook(collectionUrl, overrides = {}) {
  return {
    subscriptionId: '11111111-aaaa-4111-8111-111111111113',
    notificationId: overrides.notificationId ?? 22,
    id: overrides.id ?? 'wh-wf2-build-500-ok',
    eventType: 'build.complete',
    publisherId: 'tfs',
    createdDate: '2026-11-25T10:15:00Z',
    resourceVersion: '1.0',
    resourceContainers: {
      project: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: 'DemoProject',
        baseUrl: `${collectionUrl}/`,
      },
    },
    resource: {
      id: 500,
      buildNumber: '20261125.1',
      status: 'completed',
      result: overrides.result ?? 'succeeded',
      sourceBranch: 'refs/heads/main',
      definition: {
        id: 10,
        name: 'CI-Main',
      },
      project: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: 'DemoProject',
      },
      url: `${collectionUrl}/DemoProject/_apis/build/builds/500`,
    },
  };
}

describe('Tier 4 — Developer, CI & Sprint End-to-End Workflows', () => {
  it('Workflow 1: End-to-End AI PR Code Review Lifecycle (--toolsets pr-review)', async (t) => {
    const addCleanup = createLifoCleanup(t);

    const mockAdo = await createMockAdoServer({
      profile: 'server-2022',
      expectedPat: TEST_PAT,
    });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      args: ['--toolsets', 'pr-review'],
      env: buildAdoEnv(mockAdo),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const toolMap = indexTools(await client.listTools());
    const observedNonces = new Set();

    const recordSpotlight = (res) => {
      const raw = extractTextContent(res);
      const spot = assertSpotlighted(raw, { checkNotDoubleWrapped: true });
      observedNonces.add(spot.nonce);
      return spot;
    };

    // Step 1: Inspect PR 42 metadata
    const prRes = await client.callTool('get_pull_request', {
      projectId: 'DemoProject',
      pullRequestId: 42,
    });
    recordSpotlight(prRes);
    const prJson = unwrapToolResultJson(prRes, { expectSpotlighted: true });
    assert.equal(prJson.pullRequestId, 42);
    assert.equal(prJson.title, 'Add PR review actions');
    assert.equal(prJson.sourceRefName, 'refs/heads/feature/pr-voting');

    // Step 2: Inspect PR 42 diff / changes
    const changesRes = await client.callTool('get_pull_request_changes', {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 42,
    });
    recordSpotlight(changesRes);
    const changesJson = unwrapToolResultJson(changesRes, {
      expectSpotlighted: true,
    });
    assert.ok(
      JSON.stringify(changesJson).includes('/src/app.ts'),
      'get_pull_request_changes must include modified /src/app.ts',
    );

    // Step 3: Inspect PR 42 statuses and policy checks
    const checksRes = await client.callTool('get_pull_request_checks', {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 42,
    });
    recordSpotlight(checksRes);
    const checksJson = unwrapToolResultJson(checksRes, {
      expectSpotlighted: true,
    });
    const checksStr = JSON.stringify(checksJson);
    assert.ok(
      checksStr.includes('ci-build') && checksStr.includes('succeeded'),
      'get_pull_request_checks must include succeeded ci-build status',
    );
    assert.ok(
      checksStr.includes('Minimum number of reviewers'),
      'get_pull_request_checks must include reviewer policy evaluation',
    );

    // Step 4: Inspect repository branches with ahead/behind stats
    const branchesRes = await client.callTool(
      'list_branches',
      buildSchemaArgs(toolMap, 'list_branches', [
        [['projectId', 'project'], 'DemoProject'],
        [['repositoryId', 'repository'], 'DemoRepo'],
        [['includeStats'], true],
      ]),
    );
    recordSpotlight(branchesRes);
    const branchesStr = JSON.stringify(
      unwrapToolResultJson(branchesRes, { expectSpotlighted: true }),
    );
    assert.ok(branchesStr.includes('main'));
    assert.ok(branchesStr.includes('feature/pr-voting'));
    assert.ok(
      branchesStr.includes('"aheadCount":2') ||
        branchesStr.includes('"aheadCount": 2'),
      'list_branches(includeStats: true) must include feature/pr-voting aheadCount: 2',
    );

    // Step 5: Resolve charlie@example.com via /_apis/identities and add as required reviewer
    mockAdo.clearRequests();
    const reviewerRes = await client.callTool(
      'manage_pull_request_reviewers',
      buildAddReviewerArgs(toolMap, 42, 'charlie@example.com', true),
    );
    recordSpotlight(reviewerRes);
    unwrapToolResultText(reviewerRes, { expectSpotlighted: true });

    assert.ok(
      mockAdo.requests.some(
        (r) =>
          r.method === 'GET' &&
          /\/_apis\/identities$/i.test(r.pathname) &&
          String(getQueryParamCI(r.query, 'filterValue') ?? '')
            .toLowerCase()
            .includes('charlie@example.com'),
      ),
      'manage_pull_request_reviewers must resolve charlie@example.com via /_apis/identities',
    );
    const charlie = mockAdo.state.pullRequests[42].reviewers.find(
      (rev) => rev.id === CHARLIE_UUID,
    );
    assert.ok(charlie, 'Charlie must be added to PR 42 reviewers');
    assert.equal(charlie.isRequired, true);

    // Step 6: Post active review comment thread on PR 42
    const initialThreadCount = mockAdo.state.pullRequests[42].threads.length;
    const reviewBody = 'Reviewed diff and checks; looks clean.';
    const commentRes = await client.callTool('add_pull_request_comment', {
      projectId: 'DemoProject',
      repositoryId: 'DemoRepo',
      pullRequestId: 42,
      content: reviewBody,
      status: 'active',
    });
    recordSpotlight(commentRes);
    unwrapToolResultJson(commentRes, { expectSpotlighted: true });

    assert.equal(
      mockAdo.state.pullRequests[42].threads.length,
      initialThreadCount + 1,
      'add_pull_request_comment must create a new active thread on PR 42',
    );
    assert.ok(
      mockAdo.state.pullRequests[42].threads.some((thr) =>
        thr.comments.some((c) => c.content === reviewBody),
      ),
      'New thread must persist the exact review comment text',
    );

    // Step 7: Cast Approve vote as Alice preserving isRequired === true
    const voteRes = await client.callTool(
      'vote_pull_request',
      buildVoteApproveArgs(toolMap, 42),
    );
    recordSpotlight(voteRes);
    unwrapToolResultText(voteRes, { expectSpotlighted: true });

    const alice = mockAdo.state.pullRequests[42].reviewers.find(
      (rev) => rev.id === ALICE_UUID,
    );
    assert.ok(alice, 'Alice must remain a reviewer on PR 42');
    assert.equal(alice.vote, 10, 'Alice vote must be updated to 10 (approved)');
    assert.equal(
      alice.isRequired,
      true,
      'vote_pull_request must preserve Alice isRequired === true',
    );

    assert.equal(
      observedNonces.size,
      7,
      'All 7 PR review tool calls must carry distinct 128-bit Spotlighting nonces',
    );
    client.assertCleanStdout();
  });

  it('Workflow 2: CI Build Failure Triage -> Test Stack Trace -> Stage Retry -> Live Event Confirmation (--toolsets ci-debug,events over Streamable HTTP)', async (t) => {
    const addCleanup = createLifoCleanup(t);
    const webhookSecret = 'wf2-ci-secret';
    const feedUri = 'ado://DefaultCollection/DemoProject/events/feed';

    const mockAdo = await createMockAdoServer({
      profile: 'server-2022',
      expectedPat: TEST_PAT,
    });
    addCleanup(() => mockAdo.close());

    const httpServer = await startHttpMcpServer({
      passPortZero: true,
      args: [
        '--toolsets',
        'ci-debug,events',
        '--webhook-secret',
        webhookSecret,
      ],
      env: buildAdoEnv(mockAdo),
    });
    addCleanup(() => httpServer.close());

    const client = createHttpMcpClient(httpServer.baseUrl);
    addCleanup(() => client.close());
    const webhookClient = createHttpMcpClient(httpServer.baseUrl);
    addCleanup(() => webhookClient.close());

    await client.initialize();
    const toolMap = indexTools(await client.listTools());

    // Step 1: Fetch pipeline run 500
    const runRes = await client.callTool('get_pipeline_run', {
      projectId: 'DemoProject',
      pipelineId: 10,
      runId: 500,
    });
    const runJson = unwrapToolResultJson(runRes, { expectSpotlighted: true });
    assert.equal(runJson.id, 500);

    // Step 2: Inspect timeline to locate failed stage identifier & failed job logId
    const timelineRes = await client.callTool('pipeline_timeline', {
      projectId: 'DemoProject',
      runId: 500,
    });
    const timelineJson = unwrapToolResultJson(timelineRes, {
      expectSpotlighted: true,
    });
    assert.ok(
      Array.isArray(timelineJson.records),
      'pipeline_timeline must return records array',
    );
    const failedStage = timelineJson.records.find(
      (rec) => rec.type === 'Stage' && rec.result === 'failed',
    );
    assert.ok(failedStage, 'Timeline must identify failed Stage record');
    assert.equal(failedStage.identifier, 'Test');

    const failedJob = timelineJson.records.find(
      (rec) => rec.type === 'Job' && rec.result === 'failed' && rec.log?.id,
    );
    assert.ok(failedJob, 'Timeline must identify failed Job with log.id');
    assert.equal(failedJob.log.id, 1);

    // Step 3: Fetch plain-text job log (NOT JSON!)
    const logRes = await client.callTool('get_pipeline_log', {
      projectId: 'DemoProject',
      runId: 500,
      logId: failedJob.log.id,
    });
    const { text: logText } = unwrapToolResultText(logRes, {
      expectSpotlighted: true,
    });
    assert.ok(
      logText.includes('Auth.TokenSpec.shouldHandleExpiredToken failed'),
      `Expected failure line in pipeline log, got: ${logText}`,
    );
    assert.ok(logText.includes('Expected 401 but received 500'));

    // Step 4: Inspect structured build test results & stack trace
    const testRes = await client.callTool(
      'get_build_test_results',
      buildSchemaArgs(toolMap, 'get_build_test_results', [
        [['projectId', 'project'], 'DemoProject'],
        [['runId', 'buildId'], 500],
      ]),
    );
    const testJson = unwrapToolResultJson(testRes, { expectSpotlighted: true });
    const testStr = JSON.stringify(testJson);
    assert.ok(testStr.includes('Auth.TokenSpec.shouldHandleExpiredToken'));
    assert.ok(testStr.includes('Expected 401 but received 500'));
    assert.ok(testStr.includes('at AuthSpec (src/auth.spec.ts:42:11)'));

    // Step 5: Bootstrap SEP-3415 events/poll cursor before retrying stage
    const bootPoll = await client.request('events/poll', {
      name: 'ado.pipeline.run_state_changed',
      arguments: { projectId: 'DemoProject' },
      cursor: null,
    });
    assert.equal(bootPoll.resultType, 'complete');
    assert.match(bootPoll.cursor, CURSOR_REGEX);

    // Step 6: Retry failed stage using identifier discovered from timeline
    mockAdo.clearRequests();
    const retryRes = await client.callTool(
      'retry_pipeline_stage',
      buildSchemaArgs(toolMap, 'retry_pipeline_stage', [
        [['projectId', 'project'], 'DemoProject'],
        [['runId', 'buildId'], 500],
        [
          ['stageRefName', 'stageName', 'stageIdentifier', 'stageId', 'stage'],
          failedStage.identifier,
        ],
      ]),
    );
    unwrapToolResultText(retryRes, { expectSpotlighted: true });

    assert.ok(
      mockAdo.requests.some(
        (r) =>
          r.method === 'PATCH' &&
          /\/build\/builds\/500\/stages\/Test$/i.test(r.pathname),
      ),
      'retry_pipeline_stage must PATCH /build/builds/500/stages/Test',
    );
    assert.equal(
      mockAdo.state.builds[500].stages.Test.attempt,
      2,
      'Retried Test stage attempt must increment to 2',
    );

    // Step 7: Deliver ADO build.complete (succeeded) webhook confirming recovery
    const whRes = await webhookClient.postWebhook(
      buildBuildCompleteWebhook(mockAdo.collectionUrl, {
        result: 'succeeded',
      }),
      { 'X-ADO-Webhook-Secret': webhookSecret },
    );
    assert.equal(whRes.status, 200);

    // Step 8: Confirm recovery via BOTH SEP-3415 events/poll AND raw resources/read
    const afterPoll = await client.request('events/poll', {
      name: 'ado.pipeline.run_state_changed',
      arguments: { projectId: 'DemoProject' },
      cursor: bootPoll.cursor,
    });
    assert.equal(afterPoll.resultType, 'complete');
    assert.match(
      String(afterPoll.cursor ?? ''),
      CURSOR_REGEX,
      `Expected valid SEP-3415 cursor on follow-up events/poll, got: ${String(afterPoll.cursor)}`,
    );
    assert.notEqual(afterPoll.cursor, bootPoll.cursor);
    const recoveredEvt = afterPoll.events.find(
      (e) =>
        e.name === 'ado.pipeline.run_state_changed' &&
        Number(e.data?.runId) === 500 &&
        String(e.data?.result || '').toLowerCase() === 'succeeded',
    );
    assert.ok(
      recoveredEvt,
      `Expected recovered build 500 (succeeded) in events/poll, got: ${JSON.stringify(afterPoll.events)}`,
    );

    const readRes = await client.readResource(feedUri);
    const rawFeed = readRes.contents[0].text;
    assert.equal(
      parseSpotlightedText(rawFeed).isSpotlighted,
      false,
      'resources/read feed must be raw un-spotlighted JSON',
    );
    const feedJson = JSON.parse(rawFeed);
    assert.ok(
      feedJson.events.some(
        (e) =>
          e.name === 'ado.pipeline.run_state_changed' &&
          Number(e.data?.runId) === 500 &&
          String(e.data?.result || '').toLowerCase() === 'succeeded',
      ),
      'resources/read feed must also contain recovered run 500 succeeded event',
    );
  });

  it('Workflow 3: Sprint Planning & OData Cycle-Time / Flaky-Test Analytics Audit (--toolsets boards,work,analytics)', async (t) => {
    const addCleanup = createLifoCleanup(t);

    const mockAdo = await createMockAdoServer({
      profile: 'server-2022',
      expectedPat: TEST_PAT,
    });
    addCleanup(() => mockAdo.close());

    const client = createStdioMcpClient({
      args: ['--toolsets', 'boards,work,analytics'],
      env: buildAdoEnv(mockAdo),
    });
    addCleanup(() => client.close());

    await client.initialize();
    const toolMap = indexTools(await client.listTools());

    // Step 1: Discover project teams
    const teamsRes = await client.callTool(
      'list_teams',
      buildSchemaArgs(toolMap, 'list_teams', [
        [['projectId', 'project'], 'DemoProject'],
      ]),
    );
    const teamsStr = JSON.stringify(
      unwrapToolResultJson(teamsRes, { expectSpotlighted: true }),
    );
    assert.ok(teamsStr.includes('DemoProject Team'));
    assert.ok(teamsStr.includes('Platform Team'));

    // Step 2: Read team settings (@CurrentIteration & Sprint 2)
    const settingsRes = await client.callTool(
      'get_team_settings',
      buildSchemaArgs(toolMap, 'get_team_settings', [
        [['projectId', 'project'], 'DemoProject'],
        [['teamId', 'team'], 'DemoProject Team'],
      ]),
    );
    const settingsStr = JSON.stringify(
      unwrapToolResultJson(settingsRes, { expectSpotlighted: true }),
    );
    assert.ok(settingsStr.includes('@CurrentIteration'));
    assert.ok(settingsStr.includes('Sprint 2'));

    // Step 3: Query current AND past team iterations (proving client-side 'past' filtering!)
    mockAdo.clearRequests();
    const currentIterRes = await client.callTool(
      'list_team_iterations',
      buildSchemaArgs(toolMap, 'list_team_iterations', [
        [['projectId', 'project'], 'DemoProject'],
        [['teamId', 'team'], 'DemoProject Team'],
        [['timeframe', 'timeFrame'], 'current'],
      ]),
    );
    const currentIterStr = JSON.stringify(
      unwrapToolResultJson(currentIterRes, { expectSpotlighted: true }),
    );
    assert.ok(currentIterStr.includes(SPRINT_2_UUID));
    assert.ok(currentIterStr.includes('Sprint 2'));

    const pastIterRes = await client.callTool(
      'list_team_iterations',
      buildSchemaArgs(toolMap, 'list_team_iterations', [
        [['projectId', 'project'], 'DemoProject'],
        [['teamId', 'team'], 'DemoProject Team'],
        [['timeframe', 'timeFrame'], 'past'],
      ]),
    );
    const pastIterStr = JSON.stringify(
      unwrapToolResultJson(pastIterRes, { expectSpotlighted: true }),
    );
    assert.ok(
      pastIterStr.includes(SPRINT_1_UUID) && pastIterStr.includes('Sprint 1'),
      `Expected Sprint 1 in past iterations, got: ${pastIterStr}`,
    );
    assert.equal(
      pastIterStr.includes('Sprint 2'),
      false,
      'Past timeframe filter must exclude current Sprint 2',
    );
    assert.equal(
      mockAdo.requests.some(
        (r) =>
          String(getQueryParamCI(r.query, '$timeframe') ?? '').toLowerCase() ===
          'past',
      ),
      false,
      'list_team_iterations(past) MUST NEVER send $timeframe=past to ADO REST API',
    );

    // Step 4: Fetch Sprint 2 work items with details hydrated
    const sprintWisRes = await client.callTool(
      'get_iteration_work_items',
      buildSchemaArgs(toolMap, 'get_iteration_work_items', [
        [['projectId', 'project'], 'DemoProject'],
        [['teamId', 'team'], 'DemoProject Team'],
        [['iterationId', 'id'], SPRINT_2_UUID],
        [['includeWorkItemDetails', 'includeDetails', 'hydrate'], true],
      ]),
    );
    const sprintWisStr = JSON.stringify(
      unwrapToolResultJson(sprintWisRes, { expectSpotlighted: true }),
    );
    assert.ok(sprintWisStr.includes('Implement OData Analytics'));
    assert.ok(sprintWisStr.includes('Add stage retry handler'));

    // Step 5: Inspect WI 101 revision history
    const revsRes = await client.callTool(
      'get_work_item_revisions',
      buildSchemaArgs(toolMap, 'get_work_item_revisions', [
        [['projectId', 'project'], 'DemoProject'],
        [['workItemId', 'id'], 101],
      ]),
    );
    const revsJson = unwrapToolResultJson(revsRes, { expectSpotlighted: true });
    assert.ok(
      extractRows(revsJson).length >= 2,
      'Expected >= 2 revisions for WI 101',
    );

    // Step 6: Post sprint audit comment on WI 101
    const auditComment = 'Sprint 2 audit complete.';
    const commentRes = await client.callTool(
      'add_work_item_comment',
      buildSchemaArgs(toolMap, 'add_work_item_comment', [
        [['projectId', 'project'], 'DemoProject'],
        [['workItemId', 'id'], 101],
        [['text', 'comment', 'content'], auditComment],
      ]),
    );
    unwrapToolResultText(commentRes, { expectSpotlighted: true });
    assert.ok(
      mockAdo.state.workItemComments[101].some((c) =>
        String(c.text || '').includes(auditComment),
      ),
      'Sprint audit comment must be persisted in mockAdo state',
    );

    // Step 7: Discover OData Analytics schema & custom WorkItems properties
    const catalogRes = await client.callTool(
      'get_analytics_schema',
      buildSchemaArgs(toolMap, 'get_analytics_schema', [
        [['projectId', 'project'], 'DemoProject'],
      ]),
    );
    const catalogText = unwrapToolResultText(catalogRes, {
      expectSpotlighted: true,
    }).text;
    assert.ok(catalogText.includes('WorkItems'));
    assert.ok(catalogText.includes('TestResultsDaily'));

    const wiSchemaTool = toolMap.get('get_analytics_schema');
    const wiSchemaProps = wiSchemaTool?.inputSchema?.properties ?? {};
    let wiSchemaText = catalogText;
    const entityArgCandidates = [
      'entitySet',
      'entity',
      'entityType',
      'entitySetName',
    ];
    if (entityArgCandidates.some((k) => Object.hasOwn(wiSchemaProps, k))) {
      const wiSchemaRes = await client.callTool(
        'get_analytics_schema',
        buildSchemaArgs(toolMap, 'get_analytics_schema', [
          [['projectId', 'project'], 'DemoProject'],
          [entityArgCandidates, 'WorkItems'],
        ]),
      );
      wiSchemaText = unwrapToolResultText(wiSchemaRes, {
        expectSpotlighted: true,
      }).text;
    }
    assert.ok(
      wiSchemaText.includes('Custom_Team') &&
        wiSchemaText.includes('Custom_RiskScore'),
      'get_analytics_schema must surface org-specific Custom_Team and Custom_RiskScore properties',
    );

    // Step 8: Query curated DORA/Quality presets (work_item_cycle_time & flaky_tests)
    mockAdo.clearRequests();
    const cycleRes = await client.callTool(
      'get_analytics_metrics',
      buildSchemaArgs(toolMap, 'get_analytics_metrics', [
        [['projectId', 'project'], 'DemoProject'],
        [['metric', 'preset', 'metricName'], 'work_item_cycle_time'],
      ]),
    );
    const cycleJson = unwrapToolResultJson(cycleRes, {
      expectSpotlighted: true,
    });
    assert.ok(
      cycleJson && typeof cycleJson === 'object',
      'work_item_cycle_time preset must return structured aggregated data',
    );
    assert.ok(
      mockAdo.requests.some(
        (r) =>
          /\/_odata\/.*\/WorkItems\b/i.test(r.pathname) &&
          (hasQueryParamCI(r.query, '$apply') ||
            /(?:\$|%24)apply/i.test(`${r.url} ${r.body}`)),
      ),
      'work_item_cycle_time must execute server-side OData $apply against WorkItems',
    );

    const flakyRes = await client.callTool(
      'get_analytics_metrics',
      buildSchemaArgs(toolMap, 'get_analytics_metrics', [
        [['projectId', 'project'], 'DemoProject'],
        [['metric', 'preset', 'metricName'], 'flaky_tests'],
      ]),
    );
    const flakyJson = unwrapToolResultJson(flakyRes, {
      expectSpotlighted: true,
    });
    const flakyStr = JSON.stringify(flakyJson);
    assert.ok(
      flakyStr.includes('shouldHandleExpiredToken') ||
        flakyStr.includes('shouldTimeout'),
      `flaky_tests metric must reflect seeded flaky tests from TestResultsDaily, got: ${flakyStr}`,
    );
    assert.ok(
      mockAdo.requests.some(
        (r) =>
          /\/_odata\/.*\/TestResultsDaily\b/i.test(r.pathname) &&
          (hasQueryParamCI(r.query, '$apply') ||
            /(?:\$|%24)apply/i.test(`${r.url} ${r.body}`)),
      ),
      'flaky_tests must execute server-side OData $apply against TestResultsDaily',
    );

    // Step 9: Run custom server-side $apply aggregation on WorkItems
    const applyRes = await client.callTool(
      'query_analytics',
      buildSchemaArgs(toolMap, 'query_analytics', [
        [['projectId', 'project'], 'DemoProject'],
        [['entitySet', 'entity', 'table'], 'WorkItems'],
        [
          ['apply', '$apply'],
          'groupby((State),aggregate($count as Count,StoryPoints with sum as TotalPoints))',
        ],
      ]),
    );
    assertSpotlighted(extractTextContent(applyRes), {
      checkNotDoubleWrapped: true,
    });
    const applyJson = unwrapToolResultJson(applyRes, {
      expectSpotlighted: true,
    });
    const applyRows = extractRows(applyJson);
    const activeRow = applyRows.find((r) => r.State === 'Active');
    const closedRow = applyRows.find((r) => r.State === 'Closed');
    assert.ok(
      activeRow,
      `Expected Active aggregate row, got: ${JSON.stringify(applyRows)}`,
    );
    assert.equal(activeRow.Count, 2);
    assert.equal(activeRow.TotalPoints, 7);
    assert.ok(
      closedRow,
      `Expected Closed aggregate row, got: ${JSON.stringify(applyRows)}`,
    );
    assert.equal(closedRow.Count, 1);
    assert.equal(closedRow.TotalPoints, 3);

    client.assertCleanStdout();
  });

  it('Workflow 4: Platform Modernization, Tool Governance & Security Hygiene Audit', async (t) => {
    const addCleanup = createLifoCleanup(t);

    // --- Part A: Static Repo Modernization & Hygiene Audit ---
    const pkg = readRepoJson('package.json');
    const runtimeDeps = Object.keys(pkg.dependencies ?? {}).sort((a, b) =>
      a.localeCompare(b),
    );
    assert.deepEqual(
      runtimeDeps,
      [
        '@azure/identity',
        '@modelcontextprotocol/sdk',
        'azure-devops-node-api',
        'diff',
        'zod',
      ],
      'package.json must maintain the exact 5 runtime dependencies',
    );

    assert.match(
      String(pkg.engines?.node || '').trim(),
      /^>=\s*24(?:\.\d+(?:\.\d+)?)?$/,
      `engines.node must target >=24.0.0, got: ${String(pkg.engines?.node)}`,
    );

    const inspectorScript = String(pkg.scripts?.inspector || '');
    assert.ok(
      inspectorScript.includes('@modelcontextprotocol/inspector@2.16.0'),
      `scripts.inspector must use @modelcontextprotocol/inspector@2.16.0, got: ${inspectorScript}`,
    );
    assert.equal(
      inspectorScript.includes('0.9.0'),
      false,
      'scripts.inspector must not reference legacy 0.9.0',
    );
    assert.match(
      inspectorScript,
      /@modelcontextprotocol\/inspector@2\.16\.0\b[^&|;]*\s--\s+node\b/,
      `scripts.inspector must include "-- node ..." separator after inspector package, got: ${inspectorScript}`,
    );

    const buildScript = String(pkg.scripts?.build || '');
    assert.ok(
      /\b(?:rmSync|rm|rimraf)\b/i.test(buildScript) &&
        buildScript.includes('dist') &&
        /\btsc\b/.test(buildScript) &&
        buildScript.indexOf('dist') < buildScript.lastIndexOf('tsc'),
      `scripts.build must clean dist before invoking tsc, got: ${buildScript}`,
    );

    const testScripts = [
      String(pkg.scripts?.test || ''),
      String(pkg.scripts?.['test:unit'] || ''),
    ];
    assert.ok(
      testScripts.some((s) => /\bnode\b[^&|;]*\s--test\b/.test(s)),
      `Test scripts must use native node --test, got: ${testScripts.join(' | ')}`,
    );
    assert.equal(
      testScripts.some((s) => /\bjest\b/i.test(s)),
      false,
      `Test scripts must not invoke Jest after test-runner modernization, got: ${testScripts.join(' | ')}`,
    );

    const devScript = String(pkg.scripts?.dev || '');
    assert.equal(
      /\btsx\b/i.test(devScript),
      false,
      `scripts.dev must not use tsx, got: ${devScript}`,
    );
    if (devScript.trim().length > 0) {
      assert.match(
        devScript,
        /\bnode\b[^&|;]*\s--watch\b/,
        `scripts.dev must use native node --watch, got: ${devScript}`,
      );
    }

    const allDeps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
      ...(pkg.optionalDependencies ?? {}),
      ...(pkg.peerDependencies ?? {}),
    };
    const forbiddenDepNames = [
      'jest',
      'ts-jest',
      '@types/jest',
      'tsx',
      'vitest',
      'express',
      'fastify',
      'keytar',
    ];
    for (const dep of forbiddenDepNames) {
      assert.equal(
        Object.hasOwn(allDeps, dep),
        false,
        `Forbidden dependency "${dep}" must not be present in package.json`,
      );
    }
    for (const [depName, depSpec] of Object.entries(allDeps)) {
      assert.equal(
        /msal/i.test(depName),
        false,
        `MSAL dependency "${depName}" violates Explicit Non-Goals`,
      );
      assert.equal(
        /typescript6/i.test(depName) || /typescript6/i.test(String(depSpec)),
        false,
        `Legacy @typescript/typescript6 alias must be removed (found "${depName}": "${String(depSpec)}")`,
      );
    }

    assert.ok(
      Array.isArray(pkg.files) && pkg.files.length > 0,
      'package.json must declare a non-empty files allowlist so LEDGER.md and .agents/ are excluded from npm tarballs',
    );
    assert.equal(
      pkg.files.some((f) => {
        const entry = String(f).trim();
        return (
          /LEDGER\.md|\.agents/i.test(entry) ||
          /^(?:\.\/)?(?:\*\*|\*(?:\.md)?|\.?\/?)$/.test(entry)
        );
      }),
      false,
      'LEDGER.md and .agents/ must NOT be shipped in package.json files',
    );

    for (const legacyFile of [
      'jest.unit.config.js',
      'jest.int.config.js',
      'jest.e2e.config.js',
      'tsconfig.jest.json',
    ]) {
      assert.equal(
        repoFileExists(legacyFile),
        false,
        `Legacy Jest config "${legacyFile}" must be removed`,
      );
    }

    const tsconfig = parseJsonc(readRepoFile('tsconfig.json'));
    assert.equal(
      String(tsconfig.compilerOptions?.target || '').toLowerCase(),
      'es2024',
      'tsconfig.json target must be ES2024',
    );
    assert.equal(
      tsconfig.compilerOptions?.erasableSyntaxOnly,
      true,
      'tsconfig.json must enable erasableSyntaxOnly: true',
    );

    assert.equal(
      repoFileExists('LEDGER.md'),
      true,
      'Living shared ledger LEDGER.md must exist at repo root',
    );
    const ledgerText = readRepoFile('LEDGER.md');
    assert.ok(
      ledgerText.trim().length > 500,
      'LEDGER.md must contain substantive living project records',
    );
    const roadmapText = readRepoFile('ROADMAP.md');
    assert.ok(
      roadmapText.includes('LEDGER.md'),
      'ROADMAP.md must link to LEDGER.md',
    );

    const ciWorkflow = readRepoFile('.github/workflows/main.yml');
    const matrixVersions = extractCiNodeMatrix(ciWorkflow);
    assert.ok(
      matrixVersions.length >= 2,
      `CI workflow .github/workflows/main.yml must define a node-version matrix, got: ${JSON.stringify(matrixVersions)}`,
    );
    assert.ok(
      matrixVersions.some((v) => /^24(?:\.|x|$)/i.test(v)),
      `CI matrix must include Node 24, got: ${JSON.stringify(matrixVersions)}`,
    );
    assert.ok(
      matrixVersions.some((v) => /^26(?:\.|x|$)/i.test(v)),
      `CI matrix must include Node 26, got: ${JSON.stringify(matrixVersions)}`,
    );
    assert.equal(
      matrixVersions.some((v) => /^22(?:\.|x|$)/i.test(v)),
      false,
      `CI matrix must drop legacy Node 22, got: ${JSON.stringify(matrixVersions)}`,
    );

    assert.equal(
      repoFileExists('Dockerfile'),
      true,
      'Official Dockerfile must exist at repo root',
    );
    const dockerfile = readRepoFile('Dockerfile');
    const { stages, resolveFinalFrom } = parseDockerfileStages(dockerfile);
    assert.ok(
      stages.length >= 2,
      `Dockerfile must be multi-stage (>= 2 FROM stages), found ${stages.length}`,
    );

    const finalStage = stages[stages.length - 1];
    const resolvedFinalFrom = resolveFinalFrom(finalStage.from);
    assert.match(
      resolvedFinalFrom,
      /^FROM\s+(?:--platform=\S+\s+)?(?:docker\.io\/library\/)?node:(24|26)(?:\.\d+(?:\.\d+)?)?(?:-[a-z0-9]+)?-slim(?:@sha256:[0-9a-f]{64})?(?:\s+AS\s+\S+)?$/i,
      `Dockerfile final runtime stage must use node:24-slim or node:26-slim, got: ${resolvedFinalFrom}`,
    );

    const finalUserDirectives = finalStage.instructions
      .map((instr) => /^USER\s+(.+)$/i.exec(instr))
      .filter(Boolean)
      .map((m) => m[1].trim());
    assert.ok(
      finalUserDirectives.length >= 1,
      'Dockerfile final runtime stage must declare a non-root USER directive',
    );
    const lastUser = finalUserDirectives[finalUserDirectives.length - 1];
    assert.ok(
      lastUser.length > 0 && !/^(?:root|0+)(?::|\s|$)/i.test(lastUser),
      `Dockerfile final runtime stage last USER must be non-root, got: USER ${lastUser}`,
    );

    const finalHealthchecks = finalStage.instructions.filter((instr) =>
      /^HEALTHCHECK\b/i.test(instr),
    );
    assert.ok(
      finalHealthchecks.length >= 1,
      'Dockerfile final runtime stage must define a HEALTHCHECK instruction',
    );
    const lastHealthcheck = finalHealthchecks[finalHealthchecks.length - 1];
    assert.equal(
      /^HEALTHCHECK\s+NONE\b/i.test(lastHealthcheck),
      false,
      `Dockerfile final runtime stage HEALTHCHECK must not be disabled with NONE, got: ${lastHealthcheck}`,
    );
    assert.match(
      lastHealthcheck,
      /^HEALTHCHECK\b.*\bCMD\b.*\/healthz\b/i,
      `Dockerfile final runtime stage HEALTHCHECK CMD must probe /healthz, got: ${lastHealthcheck}`,
    );

    assert.equal(
      repoFileExists('.dockerignore'),
      true,
      '.dockerignore must exist at repo root',
    );
    const dockerignoreLines = readRepoFile('.dockerignore')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
    for (const requiredIgnore of ['.git', '.agents', 'node_modules', '.env']) {
      assert.ok(
        isDockerignoreEffective(dockerignoreLines, requiredIgnore),
        `.dockerignore must effectively exclude "${requiredIgnore}" (without negating it)`,
      );
    }

    // --- Part B: Live MCP Catalog Governance Audit ---
    const mockAdo = await createMockAdoServer({
      profile: 'server-2022',
      expectedPat: TEST_PAT,
    });
    addCleanup(() => mockAdo.close());

    const allToolsets = [
      'users',
      'organizations',
      'projects',
      'repositories',
      'work-items',
      'search',
      'pull-requests',
      'pipelines',
      'wikis',
      'test-plans',
      'work',
      'analytics',
      'events',
    ].join(',');

    const fullClient = createStdioMcpClient({
      args: ['--toolsets', allToolsets],
      env: buildAdoEnv(mockAdo),
    });
    addCleanup(() => fullClient.close());
    await fullClient.initialize();

    const fullList = await fullClient.listTools();
    const fullMap = indexTools(fullList);
    assert.ok(
      fullList.tools.length >= 75,
      `Expected >= 75 tools across all 13 toolsets, got ${fullList.tools.length}`,
    );

    const representativeAcrossAll13 = [
      'get_me',
      'list_organizations',
      'list_projects',
      'list_teams',
      'get_repository',
      'list_branches',
      'get_work_item',
      'list_work_items',
      'create_work_item',
      'update_work_item',
      'add_work_item_comment',
      'get_work_item_revisions',
      'search_code',
      'get_pull_request',
      'list_pull_requests',
      'merge_pull_request',
      'vote_pull_request',
      'manage_pull_request_reviewers',
      'get_pipeline_run',
      'get_build_test_results',
      'retry_pipeline_stage',
      'list_wiki_pages',
      'list_test_plans',
      'list_iterations',
      'list_team_iterations',
      'get_team_settings',
      'get_iteration_work_items',
      'get_analytics_schema',
      'query_analytics',
      'get_analytics_metrics',
      'list_event_types',
      'poll_events',
    ];
    for (const name of representativeAcrossAll13) {
      assert.ok(
        fullMap.has(name),
        `Expected representative atomic tool "${name}" across 13-toolset catalog`,
      );
    }

    for (const tool of fullList.tools) {
      assert.equal(
        /^advsec_/i.test(tool.name),
        false,
        `Non-goal Advanced Security tool "${tool.name}" must NOT exist`,
      );
      assertFullFiveHintAnnotations(tool);
    }

    const createCommitTool = fullMap.get('create_commit');
    assert.ok(createCommitTool, 'create_commit tool must remain registered');
    const createCommitDescBytes = Buffer.byteLength(
      String(createCommitTool.description || ''),
      'utf8',
    );
    const createCommitTotalBytes = Buffer.byteLength(
      JSON.stringify(createCommitTool),
      'utf8',
    );
    assert.ok(
      createCommitDescBytes < 1200,
      `create_commit description must be trimmed (< 1200 bytes; baseline was 1615 B), got ${createCommitDescBytes} bytes`,
    );
    assert.ok(
      createCommitTotalBytes < 4200,
      `create_commit serialized tool definition must be trimmed (< 4200 bytes; baseline was ~5025 B), got ${createCommitTotalBytes} bytes`,
    );

    const projOnRes = await fullClient.callTool('list_projects', {});
    assertSpotlighted(extractTextContent(projOnRes), {
      checkNotDoubleWrapped: true,
    });
    const projOnJson = unwrapToolResultJson(projOnRes, {
      expectSpotlighted: true,
    });
    assert.ok(JSON.stringify(projOnJson).includes('DemoProject'));

    // Server 2: --read-only --no-spotlighting governance check
    const roClient = createStdioMcpClient({
      args: [
        '--toolsets',
        'projects,work-items,work,analytics',
        '--read-only',
        '--no-spotlighting',
      ],
      env: buildAdoEnv(mockAdo),
    });
    addCleanup(() => roClient.close());
    await roClient.initialize();

    const roList = await roClient.listTools();
    assert.ok(roList.tools.length > 0);
    for (const tool of roList.tools) {
      assert.equal(
        tool.annotations?.readOnlyHint,
        true,
        `Tool "${tool.name}" exposed under --read-only must have readOnlyHint === true`,
      );
    }

    await assertDirectToolBlocked(roClient, 'add_work_item_comment', {
      workItemId: 101,
      text: 'Blocked in governance audit',
    });

    const projOffRes = await roClient.callTool('list_projects', {});
    assert.equal(
      parseSpotlightedText(extractTextContent(projOffRes)).isSpotlighted,
      false,
      '--no-spotlighting must emit raw JSON without Spotlighting delimiters',
    );
    const projOffJson = unwrapToolResultJson(projOffRes, {
      expectSpotlighted: false,
    });
    assert.ok(JSON.stringify(projOffJson).includes('DemoProject'));

    fullClient.assertCleanStdout();
    roClient.assertCleanStdout();
  });
});
