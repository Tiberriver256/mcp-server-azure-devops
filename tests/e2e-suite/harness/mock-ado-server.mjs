import crypto from 'node:crypto';
import http from 'node:http';
import { types } from 'node:util';
import {
  ODATA_ENTITY_SETS_BY_VERSION,
  RESOURCE_AREAS,
  buildODataError,
  buildODataMetadataXml,
  buildOptionsCatalog,
  buildResourceAreasResponse,
  buildVssInvalidPreviewVersionError,
  buildVssVersionOutOfRangeError,
  getProfile,
} from './mock-ado-profiles.mjs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_PR_VOTES = new Set([10, 5, 0, -5, -10]);
const SNAPSHOT_ENTITIES = new Set([
  'WorkItemSnapshot',
  'WorkItemBoardSnapshot',
  'TestPointHistorySnapshots',
  'TaskAgentPoolSizeSnapshots',
  'TaskAgentRequestSnapshots',
  'ParallelPipelineJobsSnapshot',
]);
const HIGH_CARDINALITY_GROUPBY_COLUMNS = new Set([
  'workitemid',
  'workitemsk',
  'title',
  'workitemrevisionsk',
  'workitemlinksk',
  'pipelinerunid',
  'pipelinerunsk',
  'testresultid',
  'testresultsk',
  'testrunid',
  'testrunsk',
  'description',
]);
const FORBIDDEN_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const UNARY_VALUE_FNS = new Set(['tolower', 'toupper', 'trim']);
const MAX_ODATA_NESTING_DEPTH = 128;
const MAX_MERGE_DEPTH = 64;

class ODataQueryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ODataQueryError';
    this.odataCode = code;
  }
}

const TEST_OUTCOME_BY_CODE = {
  0: 'Unspecified',
  1: 'None',
  2: 'Passed',
  3: 'Failed',
  4: 'Inconclusive',
  5: 'Timeout',
  6: 'Aborted',
  7: 'Blocked',
  8: 'NotExecuted',
  9: 'Warning',
  10: 'Error',
  11: 'NotApplicable',
  12: 'Paused',
  13: 'InProgress',
  14: 'NotImpacted',
};

const VALID_TEST_OUTCOMES = new Set(
  Object.values(TEST_OUTCOME_BY_CODE).map((v) => v.toLowerCase()),
);

/**
 * Compute standard IEEE 802.3 CRC-32 for building zero-dep stored-entry ZIP archives.
 */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Build a valid stored-method (compression=0) ZIP archive buffer from `{ name, content }` entries.
 *
 * @param {Array<{ name: string, content: string | Buffer }>} entries
 * @returns {Buffer}
 */
function buildStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const dataBuf = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(String(entry.content), 'utf8');
    const checksum = crc32(dataBuf);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8); // store
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18);
    localHeader.writeUInt32LE(dataBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuf, dataBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + dataBuf.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

function deepClone(value) {
  return structuredClone(value);
}

function compareMajorMinor(a, b) {
  if (a[0] !== b[0]) {
    return a[0] - b[0];
  }
  return a[1] - b[1];
}

function parseApiVersion(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }
  const trimmed = raw.trim();
  const match = /^(\d+)\.(\d+)(?:-preview(?:\.(\d+))?)?$/i.exec(trimmed);
  if (!match) {
    return { raw: trimmed, invalid: true };
  }
  return {
    raw: trimmed,
    invalid: false,
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    isPreview: /-preview/i.test(trimmed),
    resourceVersion: match[3] ? Number.parseInt(match[3], 10) : null,
  };
}

function extractApiVersion(urlObj, headers) {
  for (const [k, v] of urlObj.searchParams.entries()) {
    if (k.toLowerCase() === 'api-version' && v) {
      return v.trim();
    }
  }
  const accept = typeof headers.accept === 'string' ? headers.accept : '';
  const match = /;\s*api-version=([^;,\s]+)/i.exec(accept);
  if (match) {
    return match[1].trim();
  }
  return null;
}

function getQueryParam(searchParams, name) {
  const lower = name.toLowerCase();
  for (const [k, v] of searchParams.entries()) {
    if (k.toLowerCase() === lower) {
      return v;
    }
  }
  return null;
}

function hasQueryParam(searchParams, name) {
  const lower = name.toLowerCase();
  for (const k of searchParams.keys()) {
    if (k.toLowerCase() === lower) {
      return true;
    }
  }
  return false;
}

function getOwn(map, key) {
  if (!map || typeof map !== 'object' || key === undefined || key === null) {
    return undefined;
  }
  const strKey = String(key);
  return Object.hasOwn(map, strKey) ? map[strKey] : undefined;
}

function setOwnProp(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

function isPlainObject(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function safeMergeObjects(base, extra, depth = 0) {
  const out = {};
  if (base && typeof base === 'object') {
    for (const [k, v] of Object.entries(base)) {
      setOwnProp(out, k, v);
    }
  }
  if (extra && typeof extra === 'object') {
    for (const [k, v] of Object.entries(extra)) {
      if (
        depth < MAX_MERGE_DEPTH &&
        Object.hasOwn(out, k) &&
        isPlainObject(out[k]) &&
        isPlainObject(v)
      ) {
        setOwnProp(out, k, safeMergeObjects(out[k], v, depth + 1));
      } else {
        setOwnProp(out, k, v);
      }
    }
  }
  return out;
}

function assignSafeOwnProps(target, patch) {
  if (
    !target ||
    typeof target !== 'object' ||
    !patch ||
    typeof patch !== 'object' ||
    Array.isArray(patch)
  ) {
    return target;
  }
  for (const [k, v] of Object.entries(patch)) {
    if (FORBIDDEN_PROTO_KEYS.has(k.toLowerCase())) {
      continue;
    }
    setOwnProp(target, k, v);
  }
  return target;
}

function parseNonNegativeIntParam(searchParams, name, defaultVal) {
  const raw = getQueryParam(searchParams, name);
  if (raw === null) {
    return defaultVal;
  }
  const trimmed = raw.trim();
  if (trimmed === '' || !/^-?\d+$/.test(trimmed)) {
    return defaultVal;
  }
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(n) || n < 0) {
    return defaultVal;
  }
  return n;
}

function safeDecode(seg) {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Create realistic, interconnected default state for the Mock Azure DevOps Server.
 */
function createDefaultSeedState(collectionUrl) {
  const projId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const proj2Id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const team1Id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const team2Id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const team3Id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const repoId = '77777777-7777-4777-8777-777777777777';
  const wikiId = '66666666-6666-4666-8666-666666666666';

  const alice = {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Alice Reviewer',
    providerDisplayName: 'Alice Reviewer',
    customDisplayName: 'Alice Reviewer',
    uniqueName: 'alice@example.com',
    mailAddress: 'alice@example.com',
    accountName: 'alice',
    descriptor: 'Microsoft.IdentityModel.Claims.ClaimsIdentity;alice',
    subjectDescriptor: 'aad.alice-descriptor',
    isActive: true,
  };
  const bob = {
    id: '22222222-2222-4222-8222-222222222222',
    displayName: 'Bob Developer',
    providerDisplayName: 'Bob Developer',
    customDisplayName: 'Bob Developer',
    uniqueName: 'bob@example.com',
    mailAddress: 'bob@example.com',
    accountName: 'bob',
    descriptor: 'Microsoft.IdentityModel.Claims.ClaimsIdentity;bob',
    subjectDescriptor: 'aad.bob-descriptor',
    isActive: true,
  };
  const charlie = {
    id: '33333333-3333-4333-8333-333333333333',
    displayName: 'Charlie Ops',
    providerDisplayName: 'Charlie Ops',
    customDisplayName: 'Charlie Ops',
    uniqueName: 'charlie@example.com',
    mailAddress: 'charlie@example.com',
    accountName: 'charlie',
    descriptor: 'Microsoft.IdentityModel.Claims.ClaimsIdentity;charlie',
    subjectDescriptor: 'aad.charlie-descriptor',
    isActive: true,
  };
  const ambig1 = {
    id: '44444444-4444-4444-8444-444444444444',
    displayName: 'Ambiguous User One',
    providerDisplayName: 'Ambiguous User One',
    uniqueName: 'ambiguous.one@example.com',
    mailAddress: 'ambiguous.one@example.com',
    accountName: 'ambiguous1',
    isActive: true,
  };
  const ambig2 = {
    id: '55555555-5555-4555-8555-555555555555',
    displayName: 'Ambiguous User Two',
    providerDisplayName: 'Ambiguous User Two',
    uniqueName: 'ambiguous.two@example.com',
    mailAddress: 'ambiguous.two@example.com',
    accountName: 'ambiguous2',
    isActive: true,
  };

  const wi101Rev1 = {
    id: 101,
    rev: 1,
    url: `${collectionUrl}/DemoProject/_apis/wit/workItems/101`,
    fields: {
      'System.Id': 101,
      'System.TeamProject': 'DemoProject',
      'System.WorkItemType': 'User Story',
      'System.Title': 'Implement OData Analytics (initial)',
      'System.State': 'New',
      'System.AreaPath': 'DemoProject',
      'System.IterationPath': 'DemoProject\\Sprint 2',
      'System.AssignedTo': {
        displayName: alice.displayName,
        uniqueName: alice.uniqueName,
        id: alice.id,
      },
      'System.Tags': 'analytics',
      'System.Description': 'Initial story description',
      'System.CreatedDate': '2026-11-01T10:00:00Z',
      'System.ChangedDate': '2026-11-01T10:00:00Z',
    },
    relations: [],
  };
  const wi101Rev2 = {
    id: 101,
    rev: 2,
    url: `${collectionUrl}/DemoProject/_apis/wit/workItems/101`,
    fields: {
      ...wi101Rev1.fields,
      'System.Title': 'Implement OData Analytics',
      'System.State': 'Active',
      'System.Tags': 'analytics; e2e',
      'System.ChangedDate': '2026-11-20T12:00:00Z',
    },
    relations: [],
  };
  const wi102 = {
    id: 102,
    rev: 1,
    url: `${collectionUrl}/DemoProject/_apis/wit/workItems/102`,
    fields: {
      'System.Id': 102,
      'System.TeamProject': 'DemoProject',
      'System.WorkItemType': 'Task',
      'System.Title': 'Add stage retry handler',
      'System.State': 'New',
      'System.AreaPath': 'DemoProject\\Backend',
      'System.IterationPath': 'DemoProject\\Sprint 2',
      'System.AssignedTo': {
        displayName: bob.displayName,
        uniqueName: bob.uniqueName,
        id: bob.id,
      },
      'System.Tags': 'ci',
      'System.Description': 'Support retrying failed YAML pipeline stages',
      'System.CreatedDate': '2026-11-10T09:00:00Z',
      'System.ChangedDate': '2026-11-10T09:00:00Z',
    },
    relations: [],
  };
  const wi103 = {
    id: 103,
    rev: 1,
    url: `${collectionUrl}/DemoProject/_apis/wit/workItems/103`,
    fields: {
      'System.Id': 103,
      'System.TeamProject': 'DemoProject',
      'System.WorkItemType': 'Bug',
      'System.Title': 'Fix flaky login test',
      'System.State': 'Active',
      'System.AreaPath': 'DemoProject',
      'System.IterationPath': 'DemoProject\\Sprint 2',
      'System.AssignedTo': {
        displayName: charlie.displayName,
        uniqueName: charlie.uniqueName,
        id: charlie.id,
      },
      'System.Tags': 'bug; flaky',
      'System.Description': 'Login test fails intermittently under load',
      'System.CreatedDate': '2026-11-12T15:30:00Z',
      'System.ChangedDate': '2026-11-12T15:30:00Z',
    },
    relations: [],
  };

  return {
    authenticatedUser: alice,
    identities: [alice, bob, charlie, ambig1, ambig2],
    projects: [
      {
        id: projId,
        name: 'DemoProject',
        description: 'Primary E2E test project',
        url: `${collectionUrl}/_apis/projects/${projId}`,
        state: 'wellFormed',
        revision: 1,
        visibility: 'private',
      },
      {
        id: proj2Id,
        name: 'OtherProject',
        description: 'Secondary E2E project',
        url: `${collectionUrl}/_apis/projects/${proj2Id}`,
        state: 'wellFormed',
        revision: 1,
        visibility: 'private',
      },
    ],
    teams: [
      {
        id: team1Id,
        name: 'DemoProject Team',
        description: 'Default team for DemoProject',
        projectId: projId,
        projectName: 'DemoProject',
        url: `${collectionUrl}/_apis/projects/${projId}/teams/${team1Id}`,
        identityUrl: `${collectionUrl}/_apis/Identities/${team1Id}`,
        isMine: true,
        identity: {
          id: team1Id,
          displayName: '[DemoProject]\\DemoProject Team',
        },
      },
      {
        id: team2Id,
        name: 'Platform Team',
        description: 'Platform infrastructure team',
        projectId: projId,
        projectName: 'DemoProject',
        url: `${collectionUrl}/_apis/projects/${projId}/teams/${team2Id}`,
        identityUrl: `${collectionUrl}/_apis/Identities/${team2Id}`,
        isMine: false,
        identity: { id: team2Id, displayName: '[DemoProject]\\Platform Team' },
      },
      {
        id: team3Id,
        name: 'OtherProject Team',
        description: 'Default team for OtherProject',
        projectId: proj2Id,
        projectName: 'OtherProject',
        url: `${collectionUrl}/_apis/projects/${proj2Id}/teams/${team3Id}`,
        identityUrl: `${collectionUrl}/_apis/Identities/${team3Id}`,
        isMine: true,
        identity: {
          id: team3Id,
          displayName: '[OtherProject]\\OtherProject Team',
        },
      },
    ],
    classificationNodes: {
      iterations: {
        id: 100,
        identifier: '10000000-0000-4000-8000-000000000000',
        name: 'DemoProject',
        structureType: 'iteration',
        hasChildren: true,
        path: '\\DemoProject\\Iteration',
        children: [
          {
            id: 101,
            identifier: '10000000-0000-4000-8000-000000000001',
            name: 'Sprint 1',
            structureType: 'iteration',
            hasChildren: false,
            path: '\\DemoProject\\Iteration\\Sprint 1',
            attributes: {
              startDate: '2026-10-01T00:00:00Z',
              finishDate: '2026-10-14T00:00:00Z',
            },
          },
          {
            id: 102,
            identifier: '10000000-0000-4000-8000-000000000002',
            name: 'Sprint 2',
            structureType: 'iteration',
            hasChildren: false,
            path: '\\DemoProject\\Iteration\\Sprint 2',
            attributes: {
              startDate: '2026-11-15T00:00:00Z',
              finishDate: '2026-11-30T00:00:00Z',
            },
          },
          {
            id: 103,
            identifier: '10000000-0000-4000-8000-000000000003',
            name: 'Sprint 3',
            structureType: 'iteration',
            hasChildren: false,
            path: '\\DemoProject\\Iteration\\Sprint 3',
            attributes: {
              startDate: '2026-12-01T00:00:00Z',
              finishDate: '2026-12-14T00:00:00Z',
            },
          },
        ],
      },
      areas: {
        id: 200,
        identifier: '20000000-0000-4000-8000-000000000000',
        name: 'DemoProject',
        structureType: 'area',
        hasChildren: true,
        path: '\\DemoProject\\Area',
        children: [
          {
            id: 201,
            identifier: '20000000-0000-4000-8000-000000000001',
            name: 'Backend',
            structureType: 'area',
            hasChildren: false,
            path: '\\DemoProject\\Area\\Backend',
          },
          {
            id: 202,
            identifier: '20000000-0000-4000-8000-000000000002',
            name: 'Frontend',
            structureType: 'area',
            hasChildren: false,
            path: '\\DemoProject\\Area\\Frontend',
          },
        ],
      },
    },
    teamIterations: [
      {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Sprint 1',
        path: 'DemoProject\\Sprint 1',
        attributes: {
          startDate: '2026-10-01T00:00:00Z',
          finishDate: '2026-10-14T00:00:00Z',
          timeFrame: 'past',
        },
        url: `${collectionUrl}/DemoProject/_apis/work/teamsettings/iterations/10000000-0000-4000-8000-000000000001`,
      },
      {
        id: '10000000-0000-4000-8000-000000000002',
        name: 'Sprint 2',
        path: 'DemoProject\\Sprint 2',
        attributes: {
          startDate: '2026-11-15T00:00:00Z',
          finishDate: '2026-11-30T00:00:00Z',
          timeFrame: 'current',
        },
        url: `${collectionUrl}/DemoProject/_apis/work/teamsettings/iterations/10000000-0000-4000-8000-000000000002`,
      },
      {
        id: '10000000-0000-4000-8000-000000000003',
        name: 'Sprint 3',
        path: 'DemoProject\\Sprint 3',
        attributes: {
          startDate: '2026-12-01T00:00:00Z',
          finishDate: '2026-12-14T00:00:00Z',
          timeFrame: 'future',
        },
        url: `${collectionUrl}/DemoProject/_apis/work/teamsettings/iterations/10000000-0000-4000-8000-000000000003`,
      },
    ],
    teamSettings: {
      backlogIteration: {
        id: '10000000-0000-4000-8000-000000000000',
        name: 'DemoProject',
        path: '',
      },
      defaultIteration: {
        id: '10000000-0000-4000-8000-000000000002',
        name: 'Sprint 2',
        path: '\\Sprint 2',
      },
      defaultIterationMacro: '@CurrentIteration',
      backlogVisibilities: {
        'Microsoft.EpicCategory': true,
        'Microsoft.FeatureCategory': true,
        'Microsoft.RequirementCategory': true,
      },
      bugsBehavior: 'asRequirements',
      workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      url: `${collectionUrl}/DemoProject/_apis/work/teamsettings`,
    },
    teamFieldValues: {
      field: {
        referenceName: 'System.AreaPath',
        url: `${collectionUrl}/_apis/wit/fields/System.AreaPath`,
      },
      defaultValue: 'DemoProject',
      values: [
        { value: 'DemoProject', includeChildren: true },
        { value: 'DemoProject\\Backend', includeChildren: false },
      ],
      url: `${collectionUrl}/DemoProject/_apis/work/teamsettings/teamfieldvalues`,
    },
    iterationWorkItems: {
      '10000000-0000-4000-8000-000000000001': [],
      '10000000-0000-4000-8000-000000000002': [
        {
          rel: null,
          source: null,
          target: {
            id: 101,
            url: `${collectionUrl}/DemoProject/_apis/wit/workItems/101`,
          },
        },
        {
          rel: 'System.LinkTypes.Hierarchy-Forward',
          source: {
            id: 101,
            url: `${collectionUrl}/DemoProject/_apis/wit/workItems/101`,
          },
          target: {
            id: 102,
            url: `${collectionUrl}/DemoProject/_apis/wit/workItems/102`,
          },
        },
      ],
      '10000000-0000-4000-8000-000000000003': [],
    },
    nextWorkItemId: 104,
    workItems: {
      101: wi101Rev2,
      102: wi102,
      103: wi103,
    },
    workItemRevisions: {
      101: [wi101Rev1, wi101Rev2],
      102: [wi102],
      103: [wi103],
    },
    nextCommentId: 2,
    workItemComments: {
      101: [
        {
          id: 1,
          workItemId: 101,
          version: 1,
          text: 'Initial triage comment on story 101',
          renderedText: '<p>Initial triage comment on story 101</p>',
          format: 'html',
          createdBy: {
            displayName: alice.displayName,
            uniqueName: alice.uniqueName,
            id: alice.id,
          },
          createdDate: '2026-11-18T11:00:00Z',
          modifiedBy: {
            displayName: alice.displayName,
            uniqueName: alice.uniqueName,
            id: alice.id,
          },
          modifiedDate: '2026-11-18T11:00:00Z',
          isDeleted: false,
          url: `${collectionUrl}/DemoProject/_apis/wit/workItems/101/comments/1`,
        },
      ],
      102: [],
      103: [],
    },
    attachments: {},
    workItemTypes: [
      { name: 'User Story', description: 'Tracks user story work' },
      { name: 'Task', description: 'Tracks engineering task work' },
      { name: 'Bug', description: 'Tracks defects' },
      { name: 'Test Case', description: 'Tracks manual/automated test cases' },
    ],
    repositories: [
      {
        id: repoId,
        name: 'DemoRepo',
        url: `${collectionUrl}/DemoProject/_apis/git/repositories/${repoId}`,
        defaultBranch: 'refs/heads/main',
        remoteUrl: `${collectionUrl}/DemoProject/_git/DemoRepo`,
        project: { id: projId, name: 'DemoProject', state: 'wellFormed' },
      },
    ],
    refs: [
      {
        name: 'refs/heads/main',
        objectId: '1111111111111111111111111111111111111111',
        creator: {
          id: alice.id,
          displayName: alice.displayName,
          uniqueName: alice.uniqueName,
        },
        isLocked: false,
        statuses: [
          {
            id: 1,
            state: 'succeeded',
            description: 'CI passed',
            context: { name: 'ci', genre: 'build' },
          },
        ],
      },
      {
        name: 'refs/heads/feature/analytics',
        objectId: '2222222222222222222222222222222222222222',
        creator: {
          id: alice.id,
          displayName: alice.displayName,
          uniqueName: alice.uniqueName,
        },
        isLocked: false,
        statuses: [],
      },
      {
        name: 'refs/heads/feature/pr-voting',
        objectId: '3333333333333333333333333333333333333333',
        creator: {
          id: bob.id,
          displayName: bob.displayName,
          uniqueName: bob.uniqueName,
        },
        isLocked: false,
        statuses: [],
      },
      {
        name: 'refs/heads/bugfix/login',
        objectId: '4444444444444444444444444444444444444444',
        creator: {
          id: charlie.id,
          displayName: charlie.displayName,
          uniqueName: charlie.uniqueName,
        },
        isLocked: true,
        statuses: [],
      },
      {
        name: 'refs/heads/release/1.0',
        objectId: '5555555555555555555555555555555555555555',
        creator: {
          id: alice.id,
          displayName: alice.displayName,
          uniqueName: alice.uniqueName,
        },
        isLocked: false,
        statuses: [],
      },
      {
        name: 'refs/tags/v0.1.0',
        objectId: '1111111111111111111111111111111111111111',
        creator: {
          id: alice.id,
          displayName: alice.displayName,
          uniqueName: alice.uniqueName,
        },
        isLocked: false,
        statuses: [],
      },
    ],
    branchStats: [
      {
        name: 'main',
        aheadCount: 0,
        behindCount: 0,
        isBaseVersion: true,
        commit: {
          commitId: '1111111111111111111111111111111111111111',
          comment: 'Initial commit',
        },
      },
      {
        name: 'feature/analytics',
        aheadCount: 3,
        behindCount: 0,
        isBaseVersion: false,
        commit: {
          commitId: '2222222222222222222222222222222222222222',
          comment: 'Add OData client',
        },
      },
      {
        name: 'feature/pr-voting',
        aheadCount: 2,
        behindCount: 1,
        isBaseVersion: false,
        commit: {
          commitId: '3333333333333333333333333333333333333333',
          comment: 'Add PR voting',
        },
      },
    ],
    repoFiles: {
      '/README.md': {
        objectId: 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1',
        gitObjectType: 'blob',
        isFolder: false,
        content: '# DemoRepo\nHello from Mock Azure DevOps Server.\n',
      },
      '/src/app.ts': {
        objectId: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2',
        gitObjectType: 'blob',
        isFolder: false,
        content:
          'export function greet(name: string): string {\n  return `Hello, ${name}`;\n}\n',
      },
      '/package.json': {
        objectId: 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3',
        gitObjectType: 'blob',
        isFolder: false,
        content: '{"name":"demo-repo","version":"1.0.0"}\n',
      },
    },
    blobs: {
      a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1:
        '# DemoRepo\nHello from Mock Azure DevOps Server.\n',
      b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2:
        'export function greet(name: string): string {\n  return `Hello, ${name}`;\n}\n',
      b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b1:
        'export function greet(name: string): string {\n  return `Hi, ${name}`;\n}\n',
      c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3:
        '{"name":"demo-repo","version":"1.0.0"}\n',
    },
    commits: [
      {
        commitId: '3333333333333333333333333333333333333333',
        comment: 'Add PR review actions',
        author: {
          name: bob.displayName,
          email: bob.uniqueName,
          date: '2026-11-24T10:00:00Z',
        },
        committer: {
          name: bob.displayName,
          email: bob.uniqueName,
          date: '2026-11-24T10:00:00Z',
        },
      },
      {
        commitId: '1111111111111111111111111111111111111111',
        comment: 'Initial commit',
        author: {
          name: alice.displayName,
          email: alice.uniqueName,
          date: '2026-11-01T08:00:00Z',
        },
        committer: {
          name: alice.displayName,
          email: alice.uniqueName,
          date: '2026-11-01T08:00:00Z',
        },
      },
    ],
    nextPushId: 2,
    pushes: [
      {
        pushId: 1,
        date: '2026-11-24T10:00:00Z',
        pushedBy: {
          id: bob.id,
          displayName: bob.displayName,
          uniqueName: bob.uniqueName,
        },
        refUpdates: [
          {
            name: 'refs/heads/main',
            oldObjectId: '1111111111111111111111111111111111111111',
            newObjectId: '3333333333333333333333333333333333333333',
          },
        ],
        commits: [
          {
            commitId: '3333333333333333333333333333333333333333',
            comment: 'Add PR review actions',
            author: {
              name: bob.displayName,
              email: bob.uniqueName,
              date: '2026-11-24T10:00:00Z',
            },
            committer: {
              name: bob.displayName,
              email: bob.uniqueName,
              date: '2026-11-24T10:00:00Z',
            },
          },
        ],
        repository: {
          id: repoId,
          name: 'DemoRepo',
          url: `${collectionUrl}/DemoProject/_apis/git/repositories/${repoId}`,
          project: { id: projId, name: 'DemoProject', state: 'wellFormed' },
        },
        url: `${collectionUrl}/DemoProject/_apis/git/repositories/${repoId}/pushes/1`,
      },
    ],
    nextPullRequestId: 44,
    pullRequests: {
      42: {
        pullRequestId: 42,
        codeReviewId: 42,
        status: 'active',
        title: 'Add PR review actions',
        description: 'Implements voting and reviewer management',
        sourceRefName: 'refs/heads/feature/pr-voting',
        targetRefName: 'refs/heads/main',
        mergeStatus: 'succeeded',
        isDraft: false,
        creationDate: '2026-11-24T10:05:00Z',
        createdBy: {
          id: bob.id,
          displayName: bob.displayName,
          uniqueName: bob.uniqueName,
        },
        lastMergeSourceCommit: {
          commitId: '3333333333333333333333333333333333333333',
        },
        lastMergeTargetCommit: {
          commitId: '1111111111111111111111111111111111111111',
        },
        repository: {
          id: repoId,
          name: 'DemoRepo',
          project: { id: projId, name: 'DemoProject' },
        },
        url: `${collectionUrl}/DemoProject/_apis/git/repositories/${repoId}/pullRequests/42`,
        reviewers: [
          {
            id: alice.id,
            displayName: alice.displayName,
            uniqueName: alice.uniqueName,
            vote: 0,
            isRequired: true,
            hasDeclined: false,
            isFlagged: false,
          },
          {
            id: bob.id,
            displayName: bob.displayName,
            uniqueName: bob.uniqueName,
            vote: 0,
            isRequired: false,
            hasDeclined: false,
            isFlagged: false,
          },
        ],
        labels: [{ id: 'lbl-1', name: 'enhancement', active: true }],
        threads: [
          {
            id: 1,
            status: 'active',
            publishedDate: '2026-11-24T11:00:00Z',
            lastUpdatedDate: '2026-11-24T11:00:00Z',
            comments: [
              {
                id: 1,
                parentCommentId: 0,
                content: 'Looks great, please preserve isRequired!',
                commentType: 'text',
                publishedDate: '2026-11-24T11:00:00Z',
                author: {
                  id: alice.id,
                  displayName: alice.displayName,
                  uniqueName: alice.uniqueName,
                },
              },
            ],
          },
        ],
        iterations: [
          {
            id: 1,
            description: 'Initial push',
            createdDate: '2026-11-24T10:05:00Z',
            sourceRefCommit: {
              commitId: '3333333333333333333333333333333333333333',
            },
            targetRefCommit: {
              commitId: '1111111111111111111111111111111111111111',
            },
          },
        ],
        iterationChanges: {
          1: {
            changeEntries: [
              {
                changeTrackingId: 1,
                changeType: 'edit',
                item: {
                  path: '/src/app.ts',
                  objectId: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2',
                  originalObjectId: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b1',
                },
              },
            ],
          },
        },
        statuses: [
          {
            id: 1,
            state: 'succeeded',
            description: 'CI build passed',
            context: { name: 'ci-build', genre: 'continuous-integration' },
          },
        ],
      },
      43: {
        pullRequestId: 43,
        codeReviewId: 43,
        status: 'completed',
        title: 'Already merged PR',
        description: 'Completed pull request for negative vote testing',
        sourceRefName: 'refs/heads/feature/analytics',
        targetRefName: 'refs/heads/main',
        mergeStatus: 'succeeded',
        isDraft: false,
        creationDate: '2026-11-20T09:00:00Z',
        closedDate: '2026-11-21T09:00:00Z',
        createdBy: {
          id: alice.id,
          displayName: alice.displayName,
          uniqueName: alice.uniqueName,
        },
        lastMergeSourceCommit: {
          commitId: '2222222222222222222222222222222222222222',
        },
        repository: {
          id: repoId,
          name: 'DemoRepo',
          project: { id: projId, name: 'DemoProject' },
        },
        url: `${collectionUrl}/DemoProject/_apis/git/repositories/${repoId}/pullRequests/43`,
        reviewers: [
          {
            id: alice.id,
            displayName: alice.displayName,
            uniqueName: alice.uniqueName,
            vote: 10,
            isRequired: true,
          },
        ],
        labels: [],
        threads: [],
        iterations: [],
        iterationChanges: {},
        statuses: [],
      },
    },
    policyEvaluations: [
      {
        evaluationId: '99999999-9999-4999-8999-999999999999',
        status: 'approved',
        artifactId: `vstfs:///CodeReview/CodeReviewId/${projId}/42`,
        configuration: {
          id: 1,
          isEnabled: true,
          isBlocking: true,
          type: {
            id: 'fa4e907d-c16b-4a4c-9dfa-4906e5d171dd',
            displayName: 'Minimum number of reviewers',
          },
        },
      },
    ],
    pipelines: [
      {
        id: 10,
        name: 'CI-Main',
        folder: '\\',
        revision: 1,
        url: `${collectionUrl}/DemoProject/_apis/pipelines/10`,
      },
    ],
    nextBuildId: 501,
    builds: {
      500: {
        id: 500,
        buildNumber: '20261125.1',
        name: '20261125.1',
        status: 'completed',
        state: 'completed',
        result: 'partiallySucceeded',
        sourceBranch: 'refs/heads/main',
        queueTime: '2026-11-25T05:00:00Z',
        startTime: '2026-11-25T05:01:00Z',
        finishTime: '2026-11-25T05:06:00Z',
        createdDate: '2026-11-25T05:00:00Z',
        finishedDate: '2026-11-25T05:06:00Z',
        definition: { id: 10, name: 'CI-Main' },
        pipeline: { id: 10, name: 'CI-Main', revision: 1, folder: '\\' },
        project: { id: projId, name: 'DemoProject' },
        url: `${collectionUrl}/DemoProject/_apis/build/builds/500`,
        stages: {
          Build: {
            identifier: 'Build',
            name: 'Build Stage',
            state: 'completed',
            result: 'succeeded',
            attempt: 1,
          },
          Test: {
            identifier: 'Test',
            name: 'Test Stage',
            state: 'completed',
            result: 'failed',
            attempt: 1,
          },
          Deploy: {
            identifier: 'Deploy',
            name: 'Deploy Stage',
            state: 'inProgress',
            result: null,
            attempt: 1,
          },
        },
        timeline: {
          id: 'tl-500',
          changeId: 12,
          records: [
            {
              id: 'rec-stage-build',
              parentId: null,
              type: 'Stage',
              name: 'Build Stage',
              identifier: 'Build',
              state: 'completed',
              result: 'succeeded',
            },
            {
              id: 'rec-stage-test',
              parentId: null,
              type: 'Stage',
              name: 'Test Stage',
              identifier: 'Test',
              state: 'completed',
              result: 'failed',
            },
            {
              id: 'rec-job-test',
              parentId: 'rec-stage-test',
              type: 'Job',
              name: 'Run Unit Tests',
              identifier: 'RunUnitTests',
              state: 'completed',
              result: 'failed',
              log: {
                id: 1,
                url: `${collectionUrl}/DemoProject/_apis/build/builds/500/logs/1`,
              },
            },
            {
              id: 'rec-stage-deploy',
              parentId: null,
              type: 'Stage',
              name: 'Deploy Stage',
              identifier: 'Deploy',
              state: 'inProgress',
              result: null,
            },
          ],
        },
        logs: {
          1: [
            '[info] Starting unit test suite',
            '[error] Auth.TokenSpec.shouldHandleExpiredToken failed: Expected 401 but received 500',
            '[info] Completed with 2 failures',
          ],
        },
        artifacts: [
          {
            id: 1,
            name: 'drop',
            resource: {
              type: 'Container',
              data: '#/9001/drop',
              downloadUrl: `${collectionUrl}/_apis/resources/Containers/9001?itemPath=drop`,
            },
          },
          {
            id: 2,
            name: 'report-zip',
            resource: {
              type: 'PipelineArtifact',
              data: 'report-zip',
              downloadUrl: `${collectionUrl}/_apis/mock-downloads/report.zip`,
            },
          },
        ],
      },
    },
    containerItems: {
      9001: [
        {
          containerId: 9001,
          itemType: 'file',
          path: 'drop/summary.txt',
          content: 'Build 500 artifact summary\n',
        },
      ],
    },
    testRuns: [
      {
        id: 700,
        name: 'Unit Tests',
        state: 'Completed',
        buildConfiguration: {
          id: 500,
          number: '20261125.1',
          uri: 'vstfs:///Build/Build/500',
        },
        buildUri: 'vstfs:///Build/Build/500',
        totalTests: 3,
        passedTests: 1,
        unanalyzedTests: 2,
        incompleteTests: 0,
        notApplicableTests: 0,
        startedDate: '2026-11-25T05:02:00Z',
        completedDate: '2026-11-25T05:05:00Z',
        url: `${collectionUrl}/DemoProject/_apis/test/Runs/700`,
      },
    ],
    testResults: {
      700: [
        {
          id: 100000,
          testCaseTitle: 'should handle expired token',
          automatedTestName: 'Auth.TokenSpec.shouldHandleExpiredToken',
          automatedTestStorage: 'auth.spec.ts',
          outcome: 'Failed',
          errorMessage: 'Expected 401 but received 500',
          stackTrace: 'at AuthSpec (src/auth.spec.ts:42:11)',
          durationInMs: 125,
          computerName: 'build-agent-01',
          testRun: { id: '700', name: 'Unit Tests' },
        },
        {
          id: 100001,
          testCaseTitle: 'should accept valid PAT',
          automatedTestName: 'Auth.TokenSpec.shouldAcceptValidPat',
          automatedTestStorage: 'auth.spec.ts',
          outcome: 'Passed',
          errorMessage: null,
          stackTrace: null,
          durationInMs: 15,
          computerName: 'build-agent-01',
          testRun: { id: '700', name: 'Unit Tests' },
        },
        {
          id: 100002,
          testCaseTitle: 'should timeout gracefully',
          automatedTestName: 'Net.TimeoutSpec.shouldTimeout',
          automatedTestStorage: 'net.spec.ts',
          outcome: 'Aborted',
          errorMessage: 'Test host aborted after 5000ms',
          stackTrace: 'at TimeoutSpec (src/net.spec.ts:88:5)',
          durationInMs: 5000,
          computerName: 'build-agent-01',
          testRun: { id: '700', name: 'Unit Tests' },
        },
      ],
    },
    testPlans: [
      {
        id: 1,
        name: 'Release 1.0 Test Plan',
        state: 'Active',
        rootSuite: { id: 10, name: 'Release 1.0 Test Plan' },
        project: { id: projId, name: 'DemoProject' },
      },
    ],
    testSuites: {
      1: [
        {
          id: 10,
          name: 'Release 1.0 Test Plan',
          suiteType: 'staticTestSuite',
          plan: { id: 1, name: 'Release 1.0 Test Plan' },
          testCases: [{ workItem: { id: 101, name: 'Verify OData query' } }],
        },
      ],
    },
    wikis: [
      {
        id: wikiId,
        name: 'DemoProject.wiki',
        type: 'projectWiki',
        projectId: projId,
        url: `${collectionUrl}/DemoProject/_apis/wiki/wikis/${wikiId}`,
      },
    ],
    wikiPages: {
      [wikiId]: {
        '/Home': {
          id: 1,
          path: '/Home',
          order: 0,
          etag: 'v1',
          content: '# Demo Wiki\nWelcome to DemoProject.',
        },
        '/Architecture': {
          id: 2,
          path: '/Architecture',
          order: 1,
          etag: 'v1',
          content: '# Architecture\nOn-prem first design.',
        },
      },
    },
    analytics: {
      wideSchemaColumns: 0,
      WorkItems: [
        {
          WorkItemId: 101,
          Title: 'Implement OData Analytics',
          WorkItemType: 'User Story',
          State: 'Active',
          StateCategory: 'InProgress',
          StoryPoints: 5,
          CycleTimeDays: 4.5,
          LeadTimeDays: 8.0,
          CompletedDateSK: 20261120,
          ChangedDate: '2026-11-20T12:00:00Z',
          Custom_Team: 'Platform',
          Custom_RiskScore: 3,
          Area: { AreaPath: 'DemoProject' },
          Iteration: { IterationPath: 'DemoProject\\Sprint 2' },
          AssignedTo: {
            UserName: 'Alice Reviewer',
            UserEmail: 'alice@example.com',
          },
        },
        {
          WorkItemId: 102,
          Title: 'Add stage retry handler',
          WorkItemType: 'Task',
          State: 'Closed',
          StateCategory: 'Completed',
          StoryPoints: 3,
          CycleTimeDays: 2.0,
          LeadTimeDays: 3.5,
          CompletedDateSK: 20261122,
          ChangedDate: '2026-11-22T14:00:00Z',
          Custom_Team: 'Platform',
          Custom_RiskScore: 1,
          Area: { AreaPath: 'DemoProject\\Backend' },
          Iteration: { IterationPath: 'DemoProject\\Sprint 2' },
          AssignedTo: {
            UserName: 'Bob Developer',
            UserEmail: 'bob@example.com',
          },
        },
        {
          WorkItemId: 103,
          Title: 'Fix flaky login test',
          WorkItemType: 'Bug',
          State: 'Active',
          StateCategory: 'InProgress',
          StoryPoints: 2,
          CycleTimeDays: 6.0,
          LeadTimeDays: 9.0,
          CompletedDateSK: 20261124,
          ChangedDate: '2026-11-24T09:00:00Z',
          Custom_Team: 'Auth',
          Custom_RiskScore: 5,
          Area: { AreaPath: 'DemoProject' },
          Iteration: { IterationPath: 'DemoProject\\Sprint 2' },
          AssignedTo: {
            UserName: 'Charlie Ops',
            UserEmail: 'charlie@example.com',
          },
        },
      ],
      WorkItemRevisions: [
        {
          WorkItemRevisionSK: 1,
          WorkItemId: 101,
          Revision: 1,
          State: 'New',
          RevisedDateSK: 20261101,
        },
        {
          WorkItemRevisionSK: 2,
          WorkItemId: 101,
          Revision: 2,
          State: 'Active',
          RevisedDateSK: 20261120,
        },
      ],
      WorkItemSnapshot: [
        {
          DateSK: 20261120,
          DateValue: '2026-11-20T00:00:00Z',
          WorkItemId: 101,
          WorkItemType: 'User Story',
          State: 'Active',
          StateCategory: 'InProgress',
          StoryPoints: 5,
          RemainingWork: 8,
          Area: { AreaPath: 'DemoProject' },
          Iteration: { IterationPath: 'DemoProject\\Sprint 2' },
        },
        {
          DateSK: 20261120,
          DateValue: '2026-11-20T00:00:00Z',
          WorkItemId: 102,
          WorkItemType: 'Task',
          State: 'Closed',
          StateCategory: 'Completed',
          StoryPoints: 3,
          RemainingWork: 0,
          Area: { AreaPath: 'DemoProject\\Backend' },
          Iteration: { IterationPath: 'DemoProject\\Sprint 2' },
        },
        {
          DateSK: 20261121,
          DateValue: '2026-11-21T00:00:00Z',
          WorkItemId: 101,
          WorkItemType: 'User Story',
          State: 'Active',
          StateCategory: 'InProgress',
          StoryPoints: 5,
          RemainingWork: 4,
          Area: { AreaPath: 'DemoProject' },
          Iteration: { IterationPath: 'DemoProject\\Sprint 2' },
        },
      ],
      WorkItemBoardSnapshot: [
        {
          DateSK: 20261120,
          BoardName: 'Stories',
          ColumnName: 'Active',
          Count: 2,
          Area: { AreaPath: 'DemoProject' },
        },
      ],
      PipelineRuns: [
        {
          PipelineRunSK: 500,
          PipelineRunId: 500,
          PipelineId: 10,
          PipelineName: 'CI-Main',
          SucceededCount: 1,
          FailedCount: 0,
          PartiallySucceededCount: 0,
          CanceledCount: 0,
          TotalDurationSeconds: 180,
          QueueDurationSeconds: 10,
          RunDurationSeconds: 170,
          CompletedDate: '2026-11-24T12:00:00Z',
          CompletedDateSK: 20261124,
          CompletedOn: {
            DateSK: 20261124,
            Date: '2026-11-24T00:00:00Z',
            Year: 2026,
            MonthOfYear: 11,
          },
          Pipeline: { PipelineId: 10, PipelineName: 'CI-Main' },
          Branch: { BranchName: 'refs/heads/main' },
        },
        {
          PipelineRunSK: 501,
          PipelineRunId: 501,
          PipelineId: 10,
          PipelineName: 'CI-Main',
          SucceededCount: 0,
          FailedCount: 1,
          PartiallySucceededCount: 0,
          CanceledCount: 0,
          TotalDurationSeconds: 300,
          QueueDurationSeconds: 20,
          RunDurationSeconds: 280,
          CompletedDate: '2026-11-25T05:06:00Z',
          CompletedDateSK: 20261125,
          CompletedOn: {
            DateSK: 20261125,
            Date: '2026-11-25T00:00:00Z',
            Year: 2026,
            MonthOfYear: 11,
          },
          Pipeline: { PipelineId: 10, PipelineName: 'CI-Main' },
          Branch: { BranchName: 'refs/heads/main' },
        },
      ],
      TestResultsDaily: [
        {
          DateSK: 20261125,
          Workflow: 'Build',
          ResultCount: 10,
          ResultPassCount: 7,
          ResultFailCount: 2,
          ResultNotExecutedCount: 0,
          ResultNotImpactedCount: 0,
          ResultFlakyCount: 1,
          DurationSeconds: 12.5,
          Test: { TestName: 'Auth.TokenSpec.shouldHandleExpiredToken' },
          Pipeline: { PipelineId: 10, PipelineName: 'CI-Main' },
          Branch: { BranchName: 'refs/heads/main' },
          Date: {
            DateSK: 20261125,
            Date: '2026-11-25T00:00:00Z',
            Year: 2026,
            MonthOfYear: 11,
          },
        },
        {
          DateSK: 20261125,
          Workflow: 'Build',
          ResultCount: 8,
          ResultPassCount: 5,
          ResultFailCount: 1,
          ResultNotExecutedCount: 0,
          ResultNotImpactedCount: 0,
          ResultFlakyCount: 2,
          DurationSeconds: 45.0,
          Test: { TestName: 'Net.TimeoutSpec.shouldTimeout' },
          Pipeline: { PipelineId: 10, PipelineName: 'CI-Main' },
          Branch: { BranchName: 'refs/heads/main' },
          Date: {
            DateSK: 20261125,
            Date: '2026-11-25T00:00:00Z',
            Year: 2026,
            MonthOfYear: 11,
          },
        },
      ],
      Pipelines: [{ PipelineSK: 10, PipelineId: 10, PipelineName: 'CI-Main' }],
      Processes: [
        {
          ProcessSK: 'p-1',
          WorkItemType: 'User Story',
          State: 'Active',
          StateCategory: 'InProgress',
        },
      ],
      Areas: [
        { AreaSK: 'a-1', AreaName: 'DemoProject', AreaPath: 'DemoProject' },
      ],
      Iterations: [
        {
          IterationSK: '10000000-0000-4000-8000-000000000002',
          IterationName: 'Sprint 2',
          IterationPath: 'DemoProject\\Sprint 2',
        },
      ],
      Teams: [
        { TeamSK: team1Id, TeamId: team1Id, TeamName: 'DemoProject Team' },
      ],
      Users: [
        {
          UserSK: alice.id,
          UserId: alice.id,
          UserName: alice.displayName,
          UserEmail: alice.uniqueName,
        },
      ],
      ParallelPipelineJobsSnapshot: [
        { DateSK: 20261125, AgentPoolName: 'Default', ParallelJobCount: 4 },
      ],
      TaskAgentPoolSizeSnapshots: [
        { DateSK: 20261125, PoolName: 'Default', AgentCount: 6 },
      ],
      TaskAgentRequestSnapshots: [
        {
          DateSK: 20261125,
          PoolName: 'Default',
          QueuedCount: 1,
          RunningCount: 4,
        },
      ],
    },
  };
}

/**
 * Strip single-quoted OData string literals (respecting `''` escapes) so structural
 * rule checks cannot false-positive or be bypassed by quoted string contents.
 */
function stripODataSingleQuotes(expr) {
  if (!expr) {
    return '';
  }
  return expr.replace(/'(?:''|[^'])*'/g, "''");
}

/**
 * Evaluate OData `$filter` expressions against an array of rows using a recursive-descent
 * boolean parser that respects single-quoted string literals (`''` escapes), nested
 * parentheses, operator precedence (`or` < `and` < unary `not`), `contains`/`startswith`/
 * `endswith`/`in`, ISO DateTimeOffset comparisons, and OData `null` semantics on unset fields.
 */
function resolveNestedProperty(row, pathExpr) {
  const parts = pathExpr.trim().split('/');
  let cur = row;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') {
      return undefined;
    }
    const partLower = part.toLowerCase();
    if (FORBIDDEN_PROTO_KEYS.has(partLower)) {
      return undefined;
    }
    const key = Object.keys(cur).find(
      (k) => k.toLowerCase() === partLower && Object.hasOwn(cur, k),
    );
    cur = key !== undefined ? cur[key] : undefined;
  }
  return cur;
}

const ODATA_CMP_OPS = new Set(['eq', 'ne', 'ge', 'le', 'gt', 'lt']);
const ISO_DATE_CMP_RE =
  /^(\d{4}-\d{2}-\d{2})(?:[Tt](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?([Zz]|[+-]\d{2}:\d{2})$/;

function tryParseIsoTimestamp(val) {
  if (typeof val !== 'string') {
    return null;
  }
  const m = ISO_DATE_CMP_RE.exec(val);
  if (!m) {
    return null;
  }
  const tz = m[3].toUpperCase();
  const normalized = m[2] ? `${m[1]}T${m[2]}${tz}` : `${m[1]}T00:00:00${tz}`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

function tokenizeODataFilter(expr) {
  const tokens = [];
  let i = 0;
  const len = expr.length;
  while (i < len) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'COMMA', value: ',' });
      i += 1;
      continue;
    }
    if (ch === "'") {
      i += 1;
      let str = '';
      while (i < len) {
        if (expr[i] === "'") {
          if (expr[i + 1] === "'") {
            str += "'";
            i += 2;
          } else {
            i += 1;
            break;
          }
        } else {
          str += expr[i];
          i += 1;
        }
      }
      tokens.push({ type: 'STRING', value: str });
      continue;
    }
    const start = i;
    while (
      i < len &&
      !/\s/.test(expr[i]) &&
      expr[i] !== '(' &&
      expr[i] !== ')' &&
      expr[i] !== ',' &&
      expr[i] !== "'"
    ) {
      i += 1;
    }
    const raw = expr.slice(start, i);
    tokens.push({ type: 'WORD', value: raw, lower: raw.toLowerCase() });
  }
  return tokens;
}

function parseODataFilterAst(expr) {
  const tokens = tokenizeODataFilter(expr);
  let pos = 0;

  function peek(offset = 0) {
    return tokens[pos + offset] ?? null;
  }

  function consume() {
    return tokens[pos++] ?? null;
  }

  function skipBalancedParens() {
    let depth = 1;
    while (pos < tokens.length && depth > 0) {
      const tok = consume();
      if (tok.type === 'LPAREN') {
        depth += 1;
      } else if (tok.type === 'RPAREN') {
        depth -= 1;
      }
    }
  }

  function parseValueToken(tok) {
    if (!tok) {
      return { kind: 'literal', value: null };
    }
    if (tok.type === 'STRING') {
      return { kind: 'literal', value: tok.value };
    }
    if (tok.type === 'WORD') {
      if (tok.lower === 'null') {
        return { kind: 'literal', value: null };
      }
      if (tok.lower === 'true') {
        return { kind: 'literal', value: true };
      }
      if (tok.lower === 'false') {
        return { kind: 'literal', value: false };
      }
      if (/^-?\d+(?:\.\d+)?$/.test(tok.value)) {
        return { kind: 'literal', value: Number(tok.value) };
      }
      if (
        /^\d{4}-\d{2}-\d{2}(?:[Tt]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?(?:[Zz]|[+-]\d{2}:\d{2})?$/.test(
          tok.value,
        ) ||
        UUID_RE.test(tok.value)
      ) {
        return { kind: 'literal', value: tok.value };
      }
      return { kind: 'prop', path: tok.value };
    }
    return { kind: 'literal', value: null };
  }

  function checkDepth(depth) {
    if (depth > MAX_ODATA_NESTING_DEPTH) {
      throw new ODataQueryError(
        'VS403483',
        'OData query expression exceeds maximum nesting depth.',
      );
    }
  }

  function parseValueExpr(depth = 0) {
    checkDepth(depth);
    const tok = peek();
    if (!tok || tok.type === 'RPAREN' || tok.type === 'COMMA') {
      return { kind: 'literal', value: null };
    }
    if (tok.type === 'LPAREN') {
      consume(); // LPAREN
      const inner = parseValueExpr(depth + 1);
      if (peek()?.type === 'RPAREN') {
        consume();
      } else {
        skipBalancedParens();
      }
      return inner;
    }
    if (tok.type === 'WORD' && peek(1)?.type === 'LPAREN') {
      const fnName = consume().lower;
      consume(); // LPAREN
      if (UNARY_VALUE_FNS.has(fnName)) {
        const arg = parseValueExpr(depth + 1);
        skipBalancedParens();
        return { kind: 'fn_val', name: fnName, arg };
      }
      skipBalancedParens();
      return { kind: 'literal', value: null };
    }
    return parseValueToken(consume());
  }

  function tryParseStrictValueExpr(depth) {
    checkDepth(depth);
    const tok = peek();
    if (!tok) {
      return null;
    }
    if (tok.type === 'LPAREN') {
      consume(); // LPAREN
      const inner = tryParseStrictValueExpr(depth + 1);
      if (!inner || peek()?.type !== 'RPAREN') {
        return null;
      }
      consume(); // RPAREN
      return inner;
    }
    if (tok.type === 'WORD' && peek(1)?.type === 'LPAREN') {
      if (!UNARY_VALUE_FNS.has(tok.lower)) {
        return null;
      }
      const fnName = consume().lower;
      consume(); // LPAREN
      const arg = tryParseStrictValueExpr(depth + 1);
      if (!arg || peek()?.type !== 'RPAREN') {
        return null;
      }
      consume(); // RPAREN
      return { kind: 'fn_val', name: fnName, arg };
    }
    if (tok.type === 'STRING') {
      return parseValueToken(consume());
    }
    if (tok.type === 'WORD') {
      if (
        tok.lower === 'and' ||
        tok.lower === 'or' ||
        tok.lower === 'not' ||
        tok.lower === 'in' ||
        ODATA_CMP_OPS.has(tok.lower)
      ) {
        return null;
      }
      return parseValueToken(consume());
    }
    return null;
  }

  function parseComparisonOrIn(lhs, depth) {
    const nextTok = peek();

    if (nextTok?.type === 'WORD' && ODATA_CMP_OPS.has(nextTok.lower)) {
      const op = consume().lower;
      const rhs = parseValueExpr(depth + 1);
      return {
        type: 'cmp',
        op,
        lhs,
        rhs,
      };
    }

    if (
      nextTok?.type === 'WORD' &&
      nextTok.lower === 'in' &&
      peek(1)?.type === 'LPAREN'
    ) {
      consume(); // 'in'
      consume(); // '('
      const items = [];
      while (pos < tokens.length && peek()?.type !== 'RPAREN') {
        if (peek()?.type === 'COMMA') {
          consume();
          continue;
        }
        const posBefore = pos;
        items.push(parseValueExpr(depth + 1));
        if (pos === posBefore) {
          consume();
        }
      }
      if (peek()?.type === 'RPAREN') {
        consume();
      }
      return {
        type: 'in',
        lhs,
        items,
      };
    }

    return null;
  }

  function parseOr(depth = 0) {
    checkDepth(depth);
    const items = [parseAnd(depth)];
    while (peek()?.type === 'WORD' && peek().lower === 'or') {
      consume();
      items.push(parseAnd(depth));
    }
    return items.length === 1 ? items[0] : { type: 'or', items };
  }

  function parseAnd(depth = 0) {
    checkDepth(depth);
    const items = [parseNot(depth)];
    while (peek()?.type === 'WORD' && peek().lower === 'and') {
      consume();
      items.push(parseNot(depth));
    }
    return items.length === 1 ? items[0] : { type: 'and', items };
  }

  function parseNot(depth = 0) {
    checkDepth(depth);
    if (peek()?.type === 'WORD' && peek().lower === 'not') {
      consume();
      return { type: 'not', expr: parseNot(depth + 1) };
    }
    return parsePrimary(depth);
  }

  function parsePrimary(depth = 0) {
    checkDepth(depth);
    const tok = peek();
    if (!tok) {
      return { type: 'const', value: true };
    }

    if (tok.type === 'LPAREN') {
      const savedPos = pos;
      const candidateVal = tryParseStrictValueExpr(depth);
      const afterParen = peek();
      if (
        candidateVal &&
        ((afterParen?.type === 'WORD' && ODATA_CMP_OPS.has(afterParen.lower)) ||
          (afterParen?.type === 'WORD' &&
            afterParen.lower === 'in' &&
            peek(1)?.type === 'LPAREN'))
      ) {
        return parseComparisonOrIn(candidateVal, depth);
      }
      pos = savedPos;
      consume(); // LPAREN
      const inner = parseOr(depth + 1);
      if (peek()?.type === 'RPAREN') {
        consume();
      }
      if (
        peek()?.type === 'WORD' &&
        (peek().lower === 'eq' || peek().lower === 'ne') &&
        peek(1)?.type === 'WORD' &&
        (peek(1).lower === 'true' || peek(1).lower === 'false')
      ) {
        const cmpOp = consume().lower;
        const boolVal = consume().lower === 'true';
        const wantTrue = cmpOp === 'eq' ? boolVal : !boolVal;
        return wantTrue ? inner : { type: 'not', expr: inner };
      }
      return inner;
    }

    if (tok.type === 'WORD' && peek(1)?.type === 'LPAREN') {
      if (
        tok.lower === 'contains' ||
        tok.lower === 'startswith' ||
        tok.lower === 'endswith'
      ) {
        const fnName = consume().lower;
        consume(); // LPAREN
        const arg1 = parseValueExpr(depth + 1);
        if (peek()?.type === 'COMMA') {
          consume();
        }
        const arg2 = parseValueExpr(depth + 1);
        skipBalancedParens();
        const fnNode = {
          type: 'fn',
          name: fnName,
          arg1,
          arg2,
        };
        if (
          peek()?.type === 'WORD' &&
          (peek().lower === 'eq' || peek().lower === 'ne') &&
          peek(1)?.type === 'WORD' &&
          (peek(1).lower === 'true' || peek(1).lower === 'false')
        ) {
          const cmpOp = consume().lower;
          const boolVal = consume().lower === 'true';
          const wantTrue = cmpOp === 'eq' ? boolVal : !boolVal;
          return wantTrue ? fnNode : { type: 'not', expr: fnNode };
        }
        return fnNode;
      }

      if (!UNARY_VALUE_FNS.has(tok.lower)) {
        consume(); // unknown fnName
        consume(); // LPAREN
        skipBalancedParens();
        if (peek()?.type === 'WORD' && ODATA_CMP_OPS.has(peek().lower)) {
          consume();
          parseValueExpr(depth + 1);
        }
        return { type: 'const', value: true };
      }
    }

    if (tok.type === 'RPAREN' || tok.type === 'COMMA') {
      consume();
      return { type: 'const', value: true };
    }

    const lhs = parseValueExpr(depth);
    const cmpNode = parseComparisonOrIn(lhs, depth);
    if (cmpNode) {
      return cmpNode;
    }

    if (lhs.kind === 'literal' && typeof lhs.value === 'boolean') {
      return { type: 'const', value: lhs.value };
    }
    if (lhs.kind === 'prop') {
      return {
        type: 'cmp',
        op: 'eq',
        lhs,
        rhs: { kind: 'literal', value: true },
      };
    }

    return { type: 'const', value: true };
  }

  return parseOr(0);
}

function evalFilterValue(row, valNode) {
  if (!valNode) {
    return null;
  }
  if (valNode.kind === 'literal') {
    return valNode.value;
  }
  if (valNode.kind === 'prop') {
    return resolveNestedProperty(row, valNode.path) ?? null;
  }
  if (valNode.kind === 'fn_val') {
    const raw = evalFilterValue(row, valNode.arg);
    if (raw === null || raw === undefined) {
      return null;
    }
    if (typeof raw !== 'string') {
      return raw;
    }
    if (valNode.name === 'tolower') {
      return raw.toLowerCase();
    }
    if (valNode.name === 'toupper') {
      return raw.toUpperCase();
    }
    if (valNode.name === 'trim') {
      return raw.trim();
    }
    return raw;
  }
  return null;
}

function compareODataValues(lhs, rhs, op) {
  const lhsIso = tryParseIsoTimestamp(lhs);
  const rhsIso = tryParseIsoTimestamp(rhs);
  const lhsNorm =
    lhsIso !== null && rhsIso !== null
      ? lhsIso
      : typeof lhs === 'string'
        ? lhs.toLowerCase()
        : lhs;
  const rhsNorm =
    lhsIso !== null && rhsIso !== null
      ? rhsIso
      : typeof rhs === 'string'
        ? rhs.toLowerCase()
        : rhs;

  switch (op) {
    case 'eq':
      return lhsNorm === rhsNorm;
    case 'ne':
      return lhsNorm !== rhsNorm;
    case 'ge':
      if (lhsNorm === null || rhsNorm === null) {
        return false;
      }
      return lhsNorm >= rhsNorm;
    case 'le':
      if (lhsNorm === null || rhsNorm === null) {
        return false;
      }
      return lhsNorm <= rhsNorm;
    case 'gt':
      if (lhsNorm === null || rhsNorm === null) {
        return false;
      }
      return lhsNorm > rhsNorm;
    case 'lt':
      if (lhsNorm === null || rhsNorm === null) {
        return false;
      }
      return lhsNorm < rhsNorm;
    default:
      return true;
  }
}

function evalFilterAst(row, node) {
  if (!node) {
    return true;
  }
  switch (node.type) {
    case 'const':
      return Boolean(node.value);
    case 'or':
      return node.items.some((child) => evalFilterAst(row, child));
    case 'and':
      return node.items.every((child) => evalFilterAst(row, child));
    case 'not':
      return !evalFilterAst(row, node.expr);
    case 'fn': {
      const val = evalFilterValue(row, node.arg1);
      const needleVal = evalFilterValue(row, node.arg2);
      if (typeof val !== 'string' || typeof needleVal !== 'string') {
        return false;
      }
      const haystack = val.toLowerCase();
      const needle = needleVal.toLowerCase();
      if (node.name === 'contains') {
        return haystack.includes(needle);
      }
      if (node.name === 'startswith') {
        return haystack.startsWith(needle);
      }
      if (node.name === 'endswith') {
        return haystack.endsWith(needle);
      }
      return true;
    }
    case 'cmp': {
      const lhs = evalFilterValue(row, node.lhs);
      const rhs = evalFilterValue(row, node.rhs);
      return compareODataValues(lhs, rhs, node.op);
    }
    case 'in': {
      const lhs = evalFilterValue(row, node.lhs);
      return node.items.some((item) =>
        compareODataValues(lhs, evalFilterValue(row, item), 'eq'),
      );
    }
    default:
      return true;
  }
}

function applyODataFilter(rows, filterExpr) {
  if (!filterExpr || !filterExpr.trim()) {
    return rows;
  }
  const ast = parseODataFilterAst(filterExpr);
  return rows.filter((row) => evalFilterAst(row, ast));
}

function computeAggregateList(groupRows, aggSpec) {
  const out = {};
  const exprs = splitTopLevelCommas(aggSpec);
  for (const expr of exprs) {
    const countMatch = /^\$count\s+as\s+(\w+)$/i.exec(expr);
    if (countMatch) {
      setOwnProp(out, countMatch[1], groupRows.length);
      continue;
    }
    const aggMatch =
      /^([\w/]+)\s+with\s+(sum|average|min|max)\s+as\s+(\w+)$/i.exec(expr);
    if (aggMatch) {
      const [, fieldPath, fnName, alias] = aggMatch;
      const fn = fnName.toLowerCase();
      const rawVals = groupRows
        .map((r) => resolveNestedProperty(r, fieldPath))
        .filter((v) => v !== null && v !== undefined);

      if (fn === 'sum' || fn === 'average') {
        const nums = rawVals.filter(
          (v) => typeof v === 'number' && Number.isFinite(v),
        );
        if (nums.length === 0) {
          setOwnProp(out, alias, fn === 'sum' ? 0 : null);
        } else if (fn === 'sum') {
          setOwnProp(
            out,
            alias,
            nums.reduce((a, b) => a + b, 0),
          );
        } else {
          setOwnProp(out, alias, nums.reduce((a, b) => a + b, 0) / nums.length);
        }
        continue;
      }

      // min / max: support numbers, ISO DateTimeOffset strings (by epoch), and plain strings
      const nums = rawVals.filter(
        (v) => typeof v === 'number' && Number.isFinite(v),
      );
      if (nums.length > 0) {
        let best = nums[0];
        for (let i = 1; i < nums.length; i += 1) {
          if (fn === 'min' ? nums[i] < best : nums[i] > best) {
            best = nums[i];
          }
        }
        setOwnProp(out, alias, best);
        continue;
      }

      const strs = rawVals.filter((v) => typeof v === 'string');
      if (strs.length > 0) {
        const parsedDates = strs.map((s) => ({
          raw: s,
          ts: tryParseIsoTimestamp(s),
        }));
        if (parsedDates.every((d) => d.ts !== null)) {
          let best = parsedDates[0];
          for (let i = 1; i < parsedDates.length; i += 1) {
            if (
              fn === 'min'
                ? parsedDates[i].ts < best.ts
                : parsedDates[i].ts > best.ts
            ) {
              best = parsedDates[i];
            }
          }
          setOwnProp(out, alias, best.raw);
        } else {
          let best = strs[0];
          for (let i = 1; i < strs.length; i += 1) {
            if (fn === 'min' ? strs[i] < best : strs[i] > best) {
              best = strs[i];
            }
          }
          setOwnProp(out, alias, best);
        }
        continue;
      }

      setOwnProp(out, alias, null);
      continue;
    }
    const asMatch = /\bas\s+(\w+)$/i.exec(expr);
    if (asMatch) {
      setOwnProp(out, asMatch[1], groupRows.length);
    }
  }
  return out;
}

/**
 * Split a comma-separated list at depth 0 (ignoring commas inside parentheses or single quotes).
 */
function splitTopLevelCommas(str) {
  const parts = [];
  let depth = 0;
  let inQuote = false;
  let start = 0;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    if (inQuote) {
      if (ch === "'") {
        if (str[i + 1] === "'") {
          i += 1;
        } else {
          inQuote = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inQuote = true;
    } else if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
    } else if (ch === ',' && depth === 0) {
      parts.push(str.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = str.slice(start).trim();
  if (tail) {
    parts.push(tail);
  }
  return parts;
}

/**
 * Split an OData `$apply` pipeline at top-level `/` boundaries
 * (ignoring `/` inside parentheses or single-quoted string literals).
 */
function splitTopLevelSlashes(expr) {
  const parts = [];
  let depth = 0;
  let inQuote = false;
  let start = 0;
  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i];
    if (inQuote) {
      if (ch === "'") {
        if (expr[i + 1] === "'") {
          i += 1;
        } else {
          inQuote = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inQuote = true;
    } else if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
    } else if (ch === '/' && depth === 0) {
      const seg = expr.slice(start, i).trim();
      if (seg) {
        parts.push(seg);
      }
      start = i + 1;
    }
  }
  const tail = expr.slice(start).trim();
  if (tail) {
    parts.push(tail);
  }
  return parts;
}

function parseApplySegment(segment) {
  const m = /^([a-zA-Z_]\w*)\s*\(([\s\S]*)\)$/.exec(segment.trim());
  if (!m) {
    return null;
  }
  return { name: m[1].toLowerCase(), body: m[2] };
}

/**
 * Sequentially evaluate `$apply` pipelines split at top-level `/` boundaries
 * (`filter(...)`, `groupby((cols), aggregate(...))`, `aggregate(...)`, `compute(...)`).
 */
function applyODataTransformations(rows, applyExpr, depth = 0) {
  if (depth > MAX_ODATA_NESTING_DEPTH) {
    throw new ODataQueryError(
      'VS403483',
      'OData query expression exceeds maximum nesting depth.',
    );
  }
  let current = [...rows];
  const segments = splitTopLevelSlashes(applyExpr);

  for (const segment of segments) {
    const parsed = parseApplySegment(segment);
    if (!parsed) {
      continue;
    }

    if (parsed.name === 'filter') {
      current = applyODataFilter(current, parsed.body);
      continue;
    }

    if (parsed.name === 'groupby') {
      const topParts = splitTopLevelCommas(parsed.body);
      const colsRaw = (topParts[0] || '')
        .trim()
        .replace(/^\(([\s\S]*)\)$/, '$1');
      const groupCols = colsRaw
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      const tailTransform = topParts[1] ? topParts[1].trim() : '';
      const groups = new Map();

      for (const row of current) {
        const keyObj = {};
        const keyParts = [];
        for (const col of groupCols) {
          const val = resolveNestedProperty(row, col);
          keyParts.push(JSON.stringify(val ?? null));
          const colSegments = col
            .split('/')
            .map((s) => s.trim())
            .filter(Boolean);
          if (
            colSegments.length === 0 ||
            colSegments.some((s) => FORBIDDEN_PROTO_KEYS.has(s.toLowerCase()))
          ) {
            continue;
          }
          if (colSegments.length === 1) {
            setOwnProp(keyObj, colSegments[0], val ?? null);
          } else {
            let cursor = keyObj;
            for (let i = 0; i < colSegments.length - 1; i += 1) {
              const seg = colSegments[i];
              if (
                !Object.hasOwn(cursor, seg) ||
                typeof cursor[seg] !== 'object' ||
                cursor[seg] === null ||
                Array.isArray(cursor[seg])
              ) {
                setOwnProp(cursor, seg, {});
              }
              cursor = cursor[seg];
            }
            setOwnProp(
              cursor,
              colSegments[colSegments.length - 1],
              val ?? null,
            );
          }
        }
        const keyStr = keyParts.join('|');
        if (!groups.has(keyStr)) {
          groups.set(keyStr, { keyObj, rows: [] });
        }
        groups.get(keyStr).rows.push(row);
      }

      const result = [];
      for (const { keyObj, rows: groupRows } of groups.values()) {
        if (!tailTransform) {
          result.push(safeMergeObjects(keyObj, {}));
        } else {
          const subRes = applyODataTransformations(
            groupRows,
            tailTransform,
            depth + 1,
          );
          for (const item of subRes) {
            result.push(safeMergeObjects(keyObj, item));
          }
        }
      }
      current = result;
      continue;
    }

    if (parsed.name === 'aggregate') {
      current = [computeAggregateList(current, parsed.body)];
      continue;
    }

    if (parsed.name === 'compute') {
      // Tolerate compute(...) segments gracefully in the pipeline
      continue;
    }
  }

  return current;
}

/**
 * Detect unquoted DateTimeOffset literals missing a timezone offset (`Z` or `[+-]HH:MM`),
 * including bare `YYYY-MM-DD` dates and `YYYY-MM-DDTHH:mm:ss` timestamps.
 */
function hasDateTimeWithoutTimezone(expr) {
  if (!expr) {
    return false;
  }
  const unquoted = stripODataSingleQuotes(expr);
  const isoRe =
    /(?<![0-9A-Za-z-])\d{4}-\d{2}-\d{2}(?:[Tt]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?([Zz]|[+-]\d{2}:\d{2})?(?![0-9A-Za-z-])/g;
  let m;
  while ((m = isoRe.exec(unquoted)) !== null) {
    if (!m[1]) {
      return true;
    }
  }
  return false;
}

/**
 * Trim a classification node tree to the requested `$depth` (ADO defaults `$depth=0` = no children).
 */
function trimClassificationDepth(node, depth) {
  const copy = { ...node };
  if (depth <= 0) {
    delete copy.children;
    return copy;
  }
  if (Array.isArray(node.children)) {
    copy.children = node.children.map((child) =>
      trimClassificationDepth(child, depth - 1),
    );
  }
  return copy;
}

/**
 * Start a loopback `node:http` Mock Azure DevOps Server implementing authentic REST & OData
 * behaviors across Server 2019 RTM (`5.0`), Server 2020 (`6.0`), Server 2022 (`7.0`), and Services (`7.1`).
 *
 * @param {{
 *   profile?: string | object,
 *   collectionPath?: string,
 *   expectedPat?: string,
 *   authFailStatus?: number,
 *   analyticsEnabled?: boolean,
 *   initialState?: Record<string, unknown>,
 * }} [options]
 */
export async function createMockAdoServer(options = {}) {
  const profile = getProfile(options.profile ?? 'services');
  const rawCollectionPath =
    options.collectionPath === undefined
      ? '/tfs/DefaultCollection'
      : String(options.collectionPath);
  const normalizedCollectionPath =
    rawCollectionPath === '' || rawCollectionPath === '/'
      ? ''
      : `/${rawCollectionPath.replace(/^\/+|\/+$/g, '')}`;

  const expectedPat = options.expectedPat;
  const authFailStatus = options.authFailStatus ?? 401;
  const analyticsEnabled =
    options.analyticsEnabled !== undefined
      ? Boolean(options.analyticsEnabled)
      : profile.analyticsEnabled;

  /** @type {Array<Record<string, unknown>>} */
  const requests = [];
  /** @type {Array<{ matcher: string | RegExp | ((r: any) => boolean), response: object }>} */
  const injectedErrors = [];
  let injectedNextLink = null;

  /** @type {Record<string, any>} */
  const state = {};
  const initialStateSnapshot =
    options.initialState && typeof options.initialState === 'object'
      ? deepClone(options.initialState)
      : null;
  let etagSeq = 2;
  let collectionUrl = '';
  let baseUrl = '';

  function initStateInPlace() {
    const fresh = createDefaultSeedState(collectionUrl);
    if (initialStateSnapshot) {
      Object.assign(fresh, deepClone(initialStateSnapshot));
    }
    for (const key of Object.keys(state)) {
      delete state[key];
    }
    Object.assign(state, fresh);
  }

  function mergeResponseHeaders(defaults, extraHeaders) {
    const map = new Map();
    for (const [k, v] of Object.entries(defaults)) {
      if (v !== undefined) {
        map.set(k.toLowerCase(), [k, v]);
      }
    }
    if (extraHeaders && typeof extraHeaders === 'object') {
      for (const [k, v] of Object.entries(extraHeaders)) {
        if (v !== undefined) {
          map.set(k.toLowerCase(), [k, v]);
        }
      }
    }
    const out = {};
    for (const [k, v] of map.values()) {
      out[k] = v;
    }
    return out;
  }

  function sendJson(res, status, data, extraHeaders = {}) {
    const payload = (JSON.stringify(data) ?? 'null')
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');
    const headers = mergeResponseHeaders(
      extraHeaders && typeof extraHeaders === 'object' ? extraHeaders : {},
      {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Content-Length': String(Buffer.byteLength(payload)),
      },
    );
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', String(Buffer.byteLength(payload)));
    res.writeHead(status);
    res.end(payload);
  }

  function sendText(
    res,
    status,
    text,
    contentType = 'text/plain; charset=utf-8',
    extraHeaders = {},
  ) {
    const buf = Buffer.isBuffer(text)
      ? text
      : Buffer.from(String(text), 'utf8');
    res.writeHead(
      status,
      mergeResponseHeaders(
        {
          'Content-Type': contentType,
          'X-Content-Type-Options': 'nosniff',
          'Content-Length': String(buf.length),
        },
        extraHeaders,
      ),
    );
    res.end(buf);
  }

  function sendNoContent(res, extraHeaders = {}) {
    res.writeHead(204, extraHeaders);
    res.end();
  }

  function validateApiVersion(reqRecord, rules = {}) {
    if (rules.supported === false) {
      return {
        status: 404,
        body: {
          $id: '1',
          innerException: null,
          message: `The requested resource is not available on ${profile.label}.`,
          typeName:
            'Microsoft.VisualStudio.Services.WebApi.VssResourceNotFoundException',
          typeKey: 'VssResourceNotFoundException',
          errorCode: 0,
          eventId: 3000,
        },
      };
    }

    const raw = reqRecord.apiVersion;
    if (!raw) {
      return {
        status: 400,
        body: {
          $id: '1',
          innerException: null,
          message: 'Missing required api-version parameter.',
          typeName:
            'Microsoft.VisualStudio.Services.WebApi.VssInvalidApiVersionException',
          typeKey: 'VssInvalidApiVersionException',
          errorCode: 0,
          eventId: 3000,
        },
      };
    }

    const parsed = parseApiVersion(raw);
    if (!parsed || parsed.invalid) {
      return {
        status: 400,
        body: buildVssVersionOutOfRangeError(raw, profile.maxApiVersion),
      };
    }

    const reqPair = [parsed.major, parsed.minor];
    if (parsed.isPreview) {
      if (compareMajorMinor(reqPair, profile.maxPreviewMajorMinor) > 0) {
        return {
          status: 400,
          body: buildVssVersionOutOfRangeError(raw, profile.maxApiVersion),
        };
      }
      return null;
    }

    // Non-preview (GA) version requested
    if (compareMajorMinor(reqPair, profile.maxMajorMinor) > 0) {
      return {
        status: 400,
        body: buildVssVersionOutOfRangeError(raw, profile.maxApiVersion),
      };
    }

    if (rules.previewOnly) {
      return {
        status: 400,
        body: buildVssInvalidPreviewVersionError(raw, rules.minPreviewHint),
      };
    }

    return null;
  }

  function matchInjectedError(reqRecord) {
    for (let i = 0; i < injectedErrors.length; i += 1) {
      const entry = injectedErrors[i];
      let matched = false;
      if (typeof entry.matcher === 'string') {
        const needle = entry.matcher.toLowerCase();
        matched =
          reqRecord.url.toLowerCase().includes(needle) ||
          reqRecord.pathname.toLowerCase().includes(needle);
      } else if (types.isRegExp(entry.matcher)) {
        entry.matcher.lastIndex = 0;
        matched = entry.matcher.test(reqRecord.url);
        if (!matched) {
          entry.matcher.lastIndex = 0;
          matched = entry.matcher.test(reqRecord.pathname);
        }
        entry.matcher.lastIndex = 0;
      } else if (typeof entry.matcher === 'function') {
        matched = Boolean(entry.matcher(reqRecord));
      }
      if (matched) {
        if (entry.response.once !== false) {
          injectedErrors.splice(i, 1);
        }
        return entry.response;
      }
    }
    return null;
  }

  function checkBasicAuth(headers) {
    if (!expectedPat) {
      return true;
    }
    const auth =
      typeof headers.authorization === 'string' ? headers.authorization : '';
    const match = /^Basic\s+(\S+)$/i.exec(auth.trim());
    if (!match) {
      return false;
    }
    const token = match[1];
    if (token.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(token)) {
      return false;
    }
    let decoded;
    try {
      decoded = Buffer.from(token, 'base64').toString('utf8');
    } catch {
      return false;
    }
    const colonIdx = decoded.indexOf(':');
    if (colonIdx === -1) {
      return false;
    }
    const password = decoded.slice(colonIdx + 1);
    return password === expectedPat;
  }

  /**
   * Evaluate a single OData entity query (shared by direct GET and single-op POST $batch).
   */
  function evaluateODataEntityQuery(
    version,
    entityPathTail,
    searchParams,
    odataBasePrefix,
  ) {
    if (!analyticsEnabled) {
      return {
        status: 404,
        body: buildODataError(
          'VS403483',
          'Analytics service is not enabled or installed for this collection.',
        ),
      };
    }
    if (!profile.odataVersions.includes(version)) {
      return {
        status: 404,
        body: buildODataError(
          'VS403483',
          `Analytics OData version '${version}' is not supported by ${profile.label}.`,
        ),
      };
    }

    // Rule 1 [BLOCKED]: Entity key addressing (e.g., WorkItems(123) or WorkItems(123)/AssignedTo)
    if (
      entityPathTail.includes('(') ||
      entityPathTail.includes(')') ||
      entityPathTail.includes('/')
    ) {
      return {
        status: 400,
        body: buildODataError(
          'VS403483',
          `Entity key or property path addressing ('${entityPathTail}') is not supported in Analytics OData queries.`,
        ),
      };
    }

    const versionEntitySets =
      getOwn(ODATA_ENTITY_SETS_BY_VERSION, version) || [];
    const matchedEntitySet = versionEntitySets.find(
      (es) => es.name.toLowerCase() === entityPathTail.toLowerCase(),
    );
    if (!matchedEntitySet) {
      return {
        status: 404,
        body: buildODataError(
          'VS403483',
          `EntitySet '${entityPathTail}' is not available in OData ${version}.`,
        ),
      };
    }

    const entitySetName = matchedEntitySet.name;
    const selectParam = getQueryParam(searchParams, '$select');
    const filterParam = getQueryParam(searchParams, '$filter');
    const applyParam = getQueryParam(searchParams, '$apply');
    const expandParam = getQueryParam(searchParams, '$expand');
    const orderbyParam = getQueryParam(searchParams, '$orderby');
    const topParam = getQueryParam(searchParams, '$top');
    const skipParam = getQueryParam(searchParams, '$skip');
    const countParam = getQueryParam(searchParams, '$count');

    // Rule 2 [BLOCKED]: $expand containing Revisions
    if (
      expandParam &&
      /\brevisions\b/i.test(stripODataSingleQuotes(expandParam))
    ) {
      return {
        status: 400,
        body: buildODataError(
          'VS403483',
          'Expanding Revisions on WorkItems is not supported. Query the WorkItemRevisions entity set instead.',
        ),
      };
    }

    const unquotedApply = applyParam ? stripODataSingleQuotes(applyParam) : '';

    // Rule 3 [BLOCKED]: countdistinct in $apply
    if (applyParam && /\bcountdistinct\b/i.test(unquotedApply)) {
      return {
        status: 400,
        body: buildODataError(
          'VS403483',
          'The countdistinct aggregation method is not supported by Azure DevOps Analytics.',
        ),
      };
    }

    // Rule 4 [BLOCKED]: Non-aggregated query on *Snapshot entity
    if (SNAPSHOT_ENTITIES.has(entitySetName)) {
      if (!applyParam || !/\baggregate\s*\(/i.test(unquotedApply)) {
        return {
          status: 400,
          body: buildODataError(
            'VS403483',
            `Queries against snapshot entity '${entitySetName}' must include an aggregation ($apply=...aggregate(...)).`,
          ),
        };
      }
    }

    // Rule 5 [BLOCKED]: DateTimeOffset literal missing timezone offset
    if (
      hasDateTimeWithoutTimezone(filterParam) ||
      hasDateTimeWithoutTimezone(applyParam)
    ) {
      return {
        status: 400,
        body: buildODataError(
          'VS403494',
          'No datetime offset was specified. Please use either of these formats YYYY-MM-ddZ or YYYY-MM-ddTHH:mm:ss+HH:mm.',
        ),
      };
    }

    // Rule 6 [BLOCKED]: Invalid high-cardinality groupby (and prototype-key guard)
    if (applyParam) {
      const gbRegex = /\bgroupby\s*\(\s*\(([^)]*)\)/gi;
      let gbMatch;
      while ((gbMatch = gbRegex.exec(unquotedApply)) !== null) {
        const cols = gbMatch[1]
          .split(',')
          .map((c) => c.trim().toLowerCase())
          .filter(Boolean);
        for (const c of cols) {
          const segs = c
            .split('/')
            .map((s) => s.trim())
            .filter(Boolean);
          const forbiddenProto = segs.find((s) => FORBIDDEN_PROTO_KEYS.has(s));
          if (forbiddenProto) {
            return {
              status: 400,
              body: buildODataError(
                'VS403483',
                `The groupby property '${c}' contains invalid segment '${forbiddenProto}'.`,
              ),
            };
          }
        }
        const forbidden = cols.find((c) => {
          const leaf = c.split('/').pop() || c;
          return (
            HIGH_CARDINALITY_GROUPBY_COLUMNS.has(c) ||
            HIGH_CARDINALITY_GROUPBY_COLUMNS.has(leaf)
          );
        });
        if (forbidden) {
          return {
            status: 400,
            body: buildODataError(
              'VS403522',
              `The groupby property '${forbidden}' has too high cardinality and is not permitted in groupby().`,
            ),
          };
        }
      }
    }

    // Rule 7 [BLOCKED]: > 800 columns
    if (selectParam) {
      const selectedCols = selectParam
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      if (selectedCols.length > 800) {
        return {
          status: 400,
          body: buildODataError(
            'VS403670',
            `The specified query returns '${selectedCols.length}' columns which is higher than the allowed limit of 800 columns. Please, use explicit $select options to limit number of columns.`,
          ),
        };
      }
    } else if (!applyParam && (state.analytics?.wideSchemaColumns ?? 0) > 800) {
      return {
        status: 400,
        body: buildODataError(
          'VS403670',
          `The specified query returns '${state.analytics.wideSchemaColumns}' columns which is higher than the allowed limit of 800 columns. Please, use explicit $select (including within the $expand) options to limit number of columns.`,
        ),
      };
    }

    // Execute query against seeded analytics rows (OData v4 §3.1.5: $apply executes BEFORE $filter)
    let rows = deepClone(getOwn(state.analytics, entitySetName) ?? []);
    try {
      if (applyParam) {
        rows = applyODataTransformations(rows, applyParam);
      }
      if (filterParam) {
        rows = applyODataFilter(rows, filterParam);
      }
    } catch (err) {
      if (err instanceof ODataQueryError) {
        return {
          status: 400,
          body: buildODataError(err.odataCode, err.message),
        };
      }
      throw err;
    }

    if (orderbyParam) {
      const clauses = orderbyParam
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const tokens = part.split(/\s+/);
          return {
            field: tokens[0],
            desc: (tokens[1] || 'asc').toLowerCase() === 'desc',
          };
        })
        .filter((c) => Boolean(c.field));

      if (clauses.length > 0) {
        rows.sort((a, b) => {
          for (const { field, desc } of clauses) {
            const va = resolveNestedProperty(a, field);
            const vb = resolveNestedProperty(b, field);
            const aNull = va === null || va === undefined;
            const bNull = vb === null || vb === undefined;
            if (aNull && bNull) {
              continue;
            }
            if (aNull) {
              return 1;
            }
            if (bNull) {
              return -1;
            }
            const tsA = tryParseIsoTimestamp(va);
            const tsB = tryParseIsoTimestamp(vb);
            const cmpA = tsA !== null && tsB !== null ? tsA : va;
            const cmpB = tsA !== null && tsB !== null ? tsB : vb;
            if (cmpA === cmpB) {
              continue;
            }
            return desc ? (cmpA < cmpB ? 1 : -1) : cmpA < cmpB ? -1 : 1;
          }
          return 0;
        });
      }
    }

    const totalCount = rows.length;
    const skip = skipParam
      ? Math.max(0, Number.parseInt(skipParam, 10) || 0)
      : 0;
    const top = topParam
      ? Math.max(0, Number.parseInt(topParam, 10) || 0)
      : null;
    if (skip > 0) {
      rows = rows.slice(skip);
    }
    if (top !== null) {
      rows = rows.slice(0, top);
    }

    if (selectParam) {
      const selectedCols = selectParam
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      const expandCols = expandParam
        ? splitTopLevelCommas(expandParam)
            .map((e) => e.trim().split('(')[0].trim())
            .filter(Boolean)
        : [];
      const keepCols = [...selectedCols, ...expandCols];
      rows = rows.map((row) => {
        const projected = {};
        for (const col of keepCols) {
          const foundKey = Object.keys(row).find(
            (k) => k.toLowerCase() === col.toLowerCase(),
          );
          if (foundKey !== undefined) {
            setOwnProp(projected, foundKey, row[foundKey]);
          }
        }
        return projected;
      });
    }

    const payload = {
      '@odata.context': `${odataBasePrefix}/$metadata#${entitySetName}`,
      ...(countParam && countParam.toLowerCase() === 'true'
        ? { '@odata.count': totalCount }
        : {}),
      value: rows,
    };

    if (injectedNextLink) {
      payload['@odata.nextLink'] = injectedNextLink;
    }

    return { status: 200, body: payload };
  }

  function handleOData(
    reqRecord,
    urlObj,
    res,
    prefixSegments,
    odataVersion,
    odataTail,
  ) {
    const projectPrefix =
      prefixSegments.length > 0
        ? `/${prefixSegments.map(encodeURIComponent).join('/')}`
        : '';
    const odataBasePrefix = `${collectionUrl}${projectPrefix}/_odata/${odataVersion}`;

    if (!analyticsEnabled) {
      return sendJson(
        res,
        404,
        buildODataError(
          'VS403483',
          'Analytics service is not enabled or installed for this collection.',
        ),
      );
    }

    if (!profile.odataVersions.includes(odataVersion)) {
      return sendJson(
        res,
        404,
        buildODataError(
          'VS403483',
          `Analytics OData version '${odataVersion}' is not supported by ${profile.label}.`,
        ),
      );
    }

    // Direct GET URL length limit (> 3,000 characters returns 404 Not Found!)
    if (reqRecord.method === 'GET') {
      const fullRequestUrl = `${baseUrl}${reqRecord.url}`;
      if (fullRequestUrl.length > 3000) {
        return sendJson(
          res,
          404,
          buildODataError(
            'VS403483',
            `Request URL length (${fullRequestUrl.length}) exceeds the 3,000-character GET limit. Use POST $batch instead.`,
          ),
        );
      }
    }

    // GET .../_odata/{version}/$metadata
    if (reqRecord.method === 'GET' && odataTail.toLowerCase() === '$metadata') {
      const xml = buildODataMetadataXml(profile, odataVersion);
      return sendText(res, 200, xml, 'application/xml; charset=utf-8');
    }

    // POST .../_odata/{version}/$batch
    if (reqRecord.method === 'POST' && odataTail.toLowerCase() === '$batch') {
      const ct = String(reqRecord.headers['content-type'] || '');
      const boundaryMatch = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(ct);
      if (!ct.toLowerCase().startsWith('multipart/mixed') || !boundaryMatch) {
        return sendJson(
          res,
          400,
          buildODataError(
            'VS403483',
            'OData $batch requires Content-Type: multipart/mixed; boundary=...',
          ),
        );
      }
      const boundary = boundaryMatch[1] || boundaryMatch[2];
      const rawParts = reqRecord.body.split(`--${boundary}`);
      const subRequests = [];

      for (const rawPart of rawParts) {
        const trimmed = rawPart.trim();
        if (!trimmed || trimmed === '--') {
          continue;
        }
        const reqLineMatch =
          /\b(GET|POST|PUT|PATCH|DELETE)\s+(\S+)\s+HTTP\/1\.[01]/i.exec(
            trimmed,
          );
        if (reqLineMatch) {
          subRequests.push({
            method: reqLineMatch[1].toUpperCase(),
            target: reqLineMatch[2],
          });
        }
      }

      if (subRequests.length === 0) {
        return sendJson(
          res,
          400,
          buildODataError(
            'VS403483',
            'OData $batch payload contained no HTTP sub-requests.',
          ),
        );
      }
      if (subRequests.length > 1) {
        return sendJson(
          res,
          400,
          buildODataError(
            'VS403483',
            'Multiple operations in $batch are not supported; Azure DevOps Analytics allows only a single GET request per $batch.',
          ),
        );
      }

      const sub = subRequests[0];
      if (sub.method !== 'GET') {
        return sendJson(
          res,
          400,
          buildODataError(
            'VS403483',
            `Only GET operations are supported inside Analytics OData $batch, got ${sub.method}.`,
          ),
        );
      }

      let subUrl;
      try {
        subUrl = new URL(sub.target, `${odataBasePrefix}/`);
      } catch {
        return sendJson(
          res,
          400,
          buildODataError(
            'VS403483',
            `Invalid OData $batch sub-request URL '${sub.target}'.`,
          ),
        );
      }
      let subEntityTail = subUrl.pathname;
      const odataMarker = /\/_odata\/[^/]+\/(.+)$/i.exec(subEntityTail);
      if (odataMarker) {
        subEntityTail = odataMarker[1];
      } else {
        subEntityTail = subEntityTail.replace(/^\/+/, '');
      }
      subEntityTail = safeDecode(subEntityTail);

      const innerResult = evaluateODataEntityQuery(
        odataVersion,
        subEntityTail,
        subUrl.searchParams,
        odataBasePrefix,
      );
      const respBoundary = `batchresponse_${crypto.randomUUID()}`;
      const innerJson = JSON.stringify(innerResult.body);
      const statusText =
        innerResult.status === 200
          ? 'OK'
          : innerResult.status === 400
            ? 'Bad Request'
            : 'Not Found';

      const multipartBody =
        `--${respBoundary}\r\n` +
        `Content-Type: application/http\r\n` +
        `Content-Transfer-Encoding: binary\r\n\r\n` +
        `HTTP/1.1 ${innerResult.status} ${statusText}\r\n` +
        `Content-Type: application/json; odata.metadata=minimal\r\n\r\n` +
        `${innerJson}\r\n` +
        `--${respBoundary}--\r\n`;

      return sendText(
        res,
        200,
        multipartBody,
        `multipart/mixed; boundary=${respBoundary}`,
      );
    }

    // GET .../_odata/{version}/{EntitySet}
    if (reqRecord.method === 'GET') {
      const result = evaluateODataEntityQuery(
        odataVersion,
        odataTail,
        urlObj.searchParams,
        odataBasePrefix,
      );
      return sendJson(res, result.status, result.body);
    }

    return sendJson(
      res,
      405,
      buildODataError(
        'VS403483',
        `Method ${reqRecord.method} not supported for OData.`,
      ),
    );
  }

  function findProject(projectIdOrName) {
    if (!projectIdOrName) {
      return null;
    }
    const needle = projectIdOrName.toLowerCase();
    return (
      state.projects.find(
        (p) => p.id.toLowerCase() === needle || p.name.toLowerCase() === needle,
      ) || null
    );
  }

  function findRepo(repoIdOrName) {
    if (!repoIdOrName) {
      return state.repositories[0] || null;
    }
    const needle = repoIdOrName.toLowerCase();
    return (
      state.repositories.find(
        (r) => r.id.toLowerCase() === needle || r.name.toLowerCase() === needle,
      ) || null
    );
  }

  function findWiki(wikiIdOrName) {
    if (!wikiIdOrName) {
      return state.wikis[0] || null;
    }
    const needle = wikiIdOrName.toLowerCase();
    return (
      state.wikis.find(
        (w) => w.id.toLowerCase() === needle || w.name.toLowerCase() === needle,
      ) || null
    );
  }

  function applyWorkItemPatch(workItem, patchOps, project) {
    if (!Array.isArray(patchOps)) {
      return workItem;
    }
    const updated = deepClone(workItem);
    updated.fields = updated.fields || {};
    updated.relations = Array.isArray(updated.relations)
      ? updated.relations
      : [];

    for (const op of patchOps) {
      if (!op || typeof op !== 'object') {
        continue;
      }
      const action = String(op.op || 'add').toLowerCase();
      const targetPath = String(op.path || '');

      if (targetPath.startsWith('/fields/')) {
        const fieldName = targetPath.slice('/fields/'.length);
        if (action === 'remove') {
          if (Object.hasOwn(updated.fields, fieldName)) {
            delete updated.fields[fieldName];
          }
        } else {
          setOwnProp(updated.fields, fieldName, op.value);
          // Mirror System.History patch into workItemComments for Server 2019 RTM fallback visibility
          if (
            fieldName === 'System.History' &&
            typeof op.value === 'string' &&
            op.value.length > 0
          ) {
            const list = (state.workItemComments[updated.id] =
              getOwn(state.workItemComments, updated.id) || []);
            const cid = state.nextCommentId++;
            list.push({
              id: cid,
              workItemId: updated.id,
              version: 1,
              text: op.value,
              renderedText: op.value,
              format: 'html',
              createdBy: {
                displayName: state.authenticatedUser.displayName,
                uniqueName: state.authenticatedUser.uniqueName,
                id: state.authenticatedUser.id,
              },
              createdDate: new Date().toISOString(),
              modifiedBy: {
                displayName: state.authenticatedUser.displayName,
                uniqueName: state.authenticatedUser.uniqueName,
                id: state.authenticatedUser.id,
              },
              modifiedDate: new Date().toISOString(),
              isDeleted: false,
              url: `${collectionUrl}/${project || 'DemoProject'}/_apis/wit/workItems/${updated.id}/comments/${cid}`,
            });
          }
        }
      } else if (targetPath === '/relations/-' && action === 'add') {
        updated.relations.push(op.value);
      } else if (targetPath.startsWith('/relations/')) {
        const idx = Number.parseInt(targetPath.slice('/relations/'.length), 10);
        if (
          Number.isInteger(idx) &&
          idx >= 0 &&
          idx < updated.relations.length
        ) {
          if (action === 'remove') {
            updated.relations.splice(idx, 1);
          } else if (action === 'replace') {
            updated.relations[idx] = op.value;
          }
        }
      }
    }

    updated.rev = (updated.rev || 0) + 1;
    updated.fields['System.ChangedDate'] = new Date().toISOString();
    return updated;
  }

  async function handleRequest(req, res) {
    const urlObj = new URL(req.url || '/', baseUrl);
    const rawBodyBuf = await readRequestBody(req);
    const rawBodyStr = rawBodyBuf.toString('utf8');
    let parsedBody = null;
    if (rawBodyStr.length > 0) {
      try {
        parsedBody = JSON.parse(rawBodyStr);
      } catch {
        parsedBody = null;
      }
    }

    const apiVersion = extractApiVersion(urlObj, req.headers);

    // Strip collectionPath prefix (case-insensitive)
    let relPath = urlObj.pathname;
    if (
      normalizedCollectionPath &&
      relPath.toLowerCase().startsWith(normalizedCollectionPath.toLowerCase())
    ) {
      const rest = relPath.slice(normalizedCollectionPath.length);
      if (rest === '' || rest.startsWith('/')) {
        relPath = rest || '/';
      }
    }

    const reqRecord = {
      method: (req.method || 'GET').toUpperCase(),
      url: req.url || '/',
      pathname: urlObj.pathname,
      relPath,
      query: Object.fromEntries(urlObj.searchParams.entries()),
      headers: { ...req.headers },
      body: rawBodyStr,
      rawBody: rawBodyBuf,
      parsedBody,
      apiVersion,
      timestamp: new Date().toISOString(),
    };
    requests.push(reqRecord);

    // 1. Injected errors take precedence (so tests can simulate 203/401/429/500/503 on any route)
    const injected = matchInjectedError(reqRecord);
    if (injected) {
      const status = injected.status ?? 500;
      const hdrs = { ...(injected.headers || {}) };
      if (status === 204) {
        return sendNoContent(res, hdrs);
      }
      if (
        status === 203 &&
        !Object.keys(hdrs).some((k) => k.toLowerCase() === 'content-type')
      ) {
        const html =
          typeof injected.body === 'string'
            ? injected.body
            : '<!DOCTYPE html><html><head><title>Sign in to Azure DevOps</title></head><body>Sign in required</body></html>';
        return sendText(res, 203, html, 'text/html; charset=utf-8', hdrs);
      }
      if (typeof injected.body === 'string' || Buffer.isBuffer(injected.body)) {
        const ctKey = Object.keys(hdrs).find(
          (k) => k.toLowerCase() === 'content-type',
        );
        const ct = ctKey ? String(hdrs[ctKey]) : 'text/plain; charset=utf-8';
        return sendText(res, status, injected.body, ct, hdrs);
      }
      return sendJson(
        res,
        status,
        injected.body ?? { message: `Injected HTTP ${status} error` },
        hdrs,
      );
    }

    // 2. Basic Auth validation when expectedPat is configured
    // Pre-signed artifact blob downloads (`/_apis/mock-downloads/*`) omit Authorization (matching Azure Blob SAS).
    const isPreSignedDownload =
      reqRecord.method === 'GET' &&
      /(?:^|\/)_apis\/mock-downloads(?:\/|$)/i.test(relPath);
    if (!isPreSignedDownload && !checkBasicAuth(req.headers)) {
      if (authFailStatus === 203) {
        return sendText(
          res,
          203,
          '<!DOCTYPE html><html><head><title>Azure DevOps Sign In</title></head><body>Authentication required</body></html>',
          'text/html; charset=utf-8',
        );
      }
      return sendJson(
        res,
        401,
        {
          $id: '1',
          innerException: null,
          message:
            'TF400813: The user is not authorized to access this resource.',
          typeName:
            'Microsoft.VisualStudio.Services.Common.VssUnauthorizedException',
          typeKey: 'UnauthorizedRequestException',
          errorCode: 0,
          eventId: 3000,
        },
        { 'WWW-Authenticate': 'Basic realm="Azure DevOps Mock"' },
      );
    }

    // 3. Analytics OData routing (`/{project?}/_odata/{version}/{tail}`)
    const odataMatch = /^(.*?)\/_odata\/([^/]+)\/(.+)$/i.exec(relPath);
    if (odataMatch) {
      const prefixSegments = odataMatch[1]
        .split('/')
        .filter(Boolean)
        .map(safeDecode);
      const odataVersion = safeDecode(odataMatch[2]);
      const odataTail = safeDecode(odataMatch[3]);
      return handleOData(
        reqRecord,
        urlObj,
        res,
        prefixSegments,
        odataVersion,
        odataTail,
      );
    }

    // 4. REST API routing (`/{project?}/{team?}/_apis/{restTail}`)
    const apisMatch = /^(.*?)\/_apis(?:\/(.*))?$/i.exec(relPath);
    if (!apisMatch) {
      return sendJson(res, 404, {
        message: `Route not found: ${reqRecord.method} ${relPath}`,
      });
    }

    const prefixSegments = apisMatch[1]
      .split('/')
      .filter(Boolean)
      .map(safeDecode);
    const restTail = (apisMatch[2] || '').replace(/\/+$/, '');
    const restSegments = restTail ? restTail.split('/').map(safeDecode) : [];
    const restLower = restSegments.map((s) => s.toLowerCase());
    const method = reqRecord.method;
    const sp = urlObj.searchParams;

    // 4a. OPTIONS /_apis and OPTIONS /_apis/{area} (exempt from api-version)
    if (method === 'OPTIONS') {
      const area = restSegments[0] || undefined;
      return sendJson(
        res,
        200,
        buildOptionsCatalog(profile, collectionUrl, area),
      );
    }

    // 4b. GET /_apis/connectionData (exempt from api-version)
    if (
      method === 'GET' &&
      restLower.length === 1 &&
      restLower[0] === 'connectiondata'
    ) {
      return sendJson(res, 200, {
        authenticatedUser: {
          ...state.authenticatedUser,
          properties: {
            Account: {
              $type: 'System.String',
              $value: state.authenticatedUser.uniqueName,
            },
          },
          resourceVersion: 2,
          metaTypeId: 0,
        },
        authorizedUser: {
          id: state.authenticatedUser.id,
          providerDisplayName: state.authenticatedUser.displayName,
          isActive: true,
        },
        instanceId: '22222222-2222-4222-8222-222222222222',
        deploymentId: '33333333-3333-4333-8333-333333333333',
        deploymentType: profile.connectionDeploymentType,
        webApplicationRelativeDirectory: normalizedCollectionPath
          ? `${normalizedCollectionPath}/`
          : '/',
      });
    }

    // 4c. Mock binary ZIP downloads (exempt from api-version)
    if (method === 'GET' && restLower[0] === 'mock-downloads') {
      const zipBuf = buildStoredZip([
        {
          name: 'test-report.txt',
          content: 'Build 500 report: 1 passed, 2 failed\n',
        },
        {
          name: 'logs/summary.json',
          content: JSON.stringify({ buildId: 500, failed: 2 }),
        },
      ]);
      return sendText(res, 200, zipBuf, 'application/zip');
    }

    // 4d. FileContainer API (exempt from api-version — SDK FileContainerApi.getItem omits Accept/api-version)
    if (
      method === 'GET' &&
      restLower[0] === 'resources' &&
      restLower[1] === 'containers'
    ) {
      const containerId = Number.parseInt(restSegments[2], 10);
      const items =
        (Number.isInteger(containerId)
          ? getOwn(state.containerItems, containerId)
          : undefined) || [];
      const itemPath =
        getQueryParam(sp, 'itemPath') || restSegments.slice(3).join('/');
      const format = getQueryParam(sp, '$format');
      if (format && format.toLowerCase() === 'octetstream') {
        const found = items.find(
          (i) =>
            !itemPath ||
            i.path.toLowerCase() === itemPath.toLowerCase() ||
            i.path.toLowerCase().endsWith(itemPath.toLowerCase()),
        );
        if (!found) {
          return sendJson(res, 404, {
            message: `Container item not found: ${itemPath}`,
          });
        }
        return sendText(res, 200, found.content, 'application/octet-stream');
      }
      const filtered = itemPath
        ? items.filter((i) =>
            i.path.toLowerCase().startsWith(itemPath.toLowerCase()),
          )
        : items;
      return sendJson(res, 200, { count: filtered.length, value: filtered });
    }

    // 4e. ResourceAreas discovery
    if (method === 'GET' && restLower[0] === 'resourceareas') {
      const err = validateApiVersion(reqRecord, {
        previewOnly: profile.locationPreviewOnly,
        minPreviewHint: `${profile.maxApiVersion}-preview.1`,
      });
      if (err) {
        return sendJson(res, err.status, err.body);
      }
      if (restSegments.length === 1) {
        return sendJson(
          res,
          200,
          buildResourceAreasResponse(profile, collectionUrl),
        );
      }
      const areaId = restSegments[1].toLowerCase();
      const found = RESOURCE_AREAS.find((a) => a.id.toLowerCase() === areaId);
      if (!found) {
        return sendJson(res, 404, {
          message: `ResourceArea '${restSegments[1]}' not found`,
        });
      }
      return sendJson(res, 200, {
        id: found.id,
        name: found.name,
        locationUrl: collectionUrl,
      });
    }

    // 4f. Core: Projects & Teams
    if (restLower[0] === 'projects') {
      const err = validateApiVersion(reqRecord);
      if (err) {
        return sendJson(res, err.status, err.body);
      }

      if (method === 'GET' && restSegments.length === 1) {
        const skip = parseNonNegativeIntParam(sp, '$skip', 0);
        const top = parseNonNegativeIntParam(sp, '$top', 100);
        const slice = state.projects.slice(skip, skip + top);
        return sendJson(res, 200, { count: slice.length, value: slice });
      }
      if (method === 'GET' && restSegments.length === 2) {
        const proj = findProject(restSegments[1]);
        if (!proj) {
          return sendJson(res, 404, {
            message: `Project '${restSegments[1]}' not found`,
          });
        }
        return sendJson(res, 200, proj);
      }
      if (
        method === 'GET' &&
        restSegments.length === 3 &&
        restLower[2] === 'properties'
      ) {
        return sendJson(res, 200, { count: 0, value: [] });
      }
      if (method === 'GET' && restLower[2] === 'teams') {
        if (
          hasQueryParam(sp, '$expandIdentity') &&
          !profile.supportsExpandIdentity
        ) {
          return sendJson(res, 400, {
            message:
              '$expandIdentity is not supported on Azure DevOps Server 2019 (api-version 5.0).',
            typeKey: 'InvalidArgumentException',
          });
        }
        const proj = findProject(restSegments[1]);
        if (!proj) {
          return sendJson(res, 404, {
            message: `Project '${restSegments[1]}' not found`,
          });
        }
        let teams = state.teams.filter((t) => t.projectId === proj.id);
        if (restSegments.length === 4) {
          const needle = restSegments[3].toLowerCase();
          const team = teams.find(
            (t) =>
              t.id.toLowerCase() === needle || t.name.toLowerCase() === needle,
          );
          if (!team) {
            return sendJson(res, 404, {
              message: `Team '${restSegments[3]}' not found`,
            });
          }
          return sendJson(res, 200, team);
        }
        if (restSegments.length === 5 && restLower[4] === 'members') {
          return sendJson(res, 200, {
            count: 2,
            value: [
              { isTeamAdmin: true, identity: state.identities[0] },
              { isTeamAdmin: false, identity: state.identities[1] },
            ],
          });
        }
        const mine = getQueryParam(sp, '$mine');
        if (mine && mine.toLowerCase() === 'true') {
          teams = teams.filter((t) => t.isMine);
        }
        const skip = parseNonNegativeIntParam(sp, '$skip', 0);
        const top = parseNonNegativeIntParam(sp, '$top', 100);
        const slice = teams.slice(skip, skip + top);
        return sendJson(res, 200, { count: slice.length, value: slice });
      }
    }

    // Org/collection-wide GET /_apis/teams (preview-only on ALL profiles!)
    if (
      method === 'GET' &&
      restLower.length === 1 &&
      restLower[0] === 'teams'
    ) {
      const err = validateApiVersion(reqRecord, {
        previewOnly: profile.allTeamsPreviewOnly,
        minPreviewHint: `${profile.maxApiVersion}-preview.${profile.allTeamsResourceVersion}`,
      });
      if (err) {
        return sendJson(res, err.status, err.body);
      }

      if (
        hasQueryParam(sp, '$expandIdentity') &&
        !profile.supportsExpandIdentity
      ) {
        return sendJson(res, 400, {
          message:
            '$expandIdentity is not supported on Azure DevOps Server 2019 (api-version 5.0).',
          typeKey: 'InvalidArgumentException',
        });
      }
      let teams = [...state.teams];
      const mine = getQueryParam(sp, '$mine');
      if (mine && mine.toLowerCase() === 'true') {
        teams = teams.filter((t) => t.isMine);
      }
      const skip = parseNonNegativeIntParam(sp, '$skip', 0);
      const top = parseNonNegativeIntParam(sp, '$top', 100);
      const slice = teams.slice(skip, skip + top);
      return sendJson(res, 200, { count: slice.length, value: slice });
    }

    // 4g. Identities (IMS)
    if (
      method === 'GET' &&
      restLower.length === 1 &&
      restLower[0] === 'identities'
    ) {
      const err = validateApiVersion(reqRecord);
      if (err) {
        return sendJson(res, err.status, err.body);
      }

      const filterValue = (getQueryParam(sp, 'filterValue') || '')
        .trim()
        .toLowerCase();
      let matches;
      if (!filterValue) {
        matches = [...state.identities];
      } else if (
        filterValue === 'ambiguous@example.com' ||
        filterValue === 'ambiguous'
      ) {
        matches = state.identities.filter((u) =>
          u.uniqueName.toLowerCase().includes('ambiguous'),
        );
      } else {
        const exact = state.identities.filter(
          (u) =>
            u.uniqueName.toLowerCase() === filterValue ||
            (u.mailAddress && u.mailAddress.toLowerCase() === filterValue) ||
            (u.accountName && u.accountName.toLowerCase() === filterValue) ||
            u.displayName.toLowerCase() === filterValue,
        );
        if (exact.length > 0) {
          matches = exact;
        } else {
          matches = state.identities.filter(
            (u) =>
              u.uniqueName.toLowerCase().includes(filterValue) ||
              u.displayName.toLowerCase().includes(filterValue) ||
              (u.accountName &&
                u.accountName.toLowerCase().includes(filterValue)),
          );
        }
      }
      return sendJson(res, 200, { count: matches.length, value: matches });
    }

    // 4h. WIT (Work Item Tracking)
    if (restLower[0] === 'wit') {
      const project = prefixSegments[0] || 'DemoProject';

      // Comments (profile-dependent!)
      if (restLower[1] === 'workitems' && restLower[3] === 'comments') {
        const wiId = Number.parseInt(restSegments[2], 10);
        if (method === 'POST') {
          const err = validateApiVersion(reqRecord, {
            supported: profile.supportsWitCommentsCrud,
            previewOnly: true,
            minPreviewHint: `${profile.maxApiVersion}-preview.${profile.witCommentsResourceVersion}`,
          });
          if (err) {
            return sendJson(res, err.status, err.body);
          }

          const formatParam = getQueryParam(sp, 'format');
          if (formatParam) {
            const parsedVer = parseApiVersion(reqRecord.apiVersion);
            const supportsMarkdownVersion =
              profile.supportsWitCommentMarkdown &&
              parsedVer &&
              !parsedVer.invalid &&
              (parsedVer.major > 7 ||
                (parsedVer.major === 7 &&
                  parsedVer.minor >= 2 &&
                  (parsedVer.resourceVersion === null ||
                    parsedVer.resourceVersion >= 4)) ||
                (parsedVer.major === 7 &&
                  parsedVer.minor === 1 &&
                  (parsedVer.resourceVersion ?? 0) >= 4));
            if (!supportsMarkdownVersion) {
              return sendJson(res, 400, {
                message: `Query parameter 'format=${formatParam}' requires api-version 7.1-preview.4 or newer (got '${reqRecord.apiVersion}' on ${profile.label}).`,
                typeKey: 'InvalidArgumentException',
              });
            }
          }

          if (!getOwn(state.workItems, wiId)) {
            return sendJson(res, 404, {
              message: `Work item ${wiId} does not exist.`,
            });
          }

          const commentText =
            reqRecord.parsedBody &&
            typeof reqRecord.parsedBody.text === 'string'
              ? reqRecord.parsedBody.text
              : '';
          if (!commentText.trim()) {
            return sendJson(res, 400, {
              message: 'Comment text must not be empty.',
            });
          }

          const formatNormalized =
            formatParam &&
            (formatParam.toLowerCase() === 'markdown' || formatParam === '0')
              ? 'markdown'
              : 'html';
          const commentId = state.nextCommentId++;
          const now = new Date().toISOString();
          const created = {
            id: commentId,
            workItemId: wiId,
            version: 1,
            text: commentText,
            renderedText:
              formatNormalized === 'markdown'
                ? `<p>${commentText}</p>`
                : commentText,
            format: formatNormalized,
            createdBy: {
              displayName: state.authenticatedUser.displayName,
              uniqueName: state.authenticatedUser.uniqueName,
              id: state.authenticatedUser.id,
            },
            createdDate: now,
            modifiedBy: {
              displayName: state.authenticatedUser.displayName,
              uniqueName: state.authenticatedUser.uniqueName,
              id: state.authenticatedUser.id,
            },
            modifiedDate: now,
            isDeleted: false,
            url: `${collectionUrl}/${project}/_apis/wit/workItems/${wiId}/comments/${commentId}`,
          };
          state.workItemComments[wiId] =
            getOwn(state.workItemComments, wiId) || [];
          state.workItemComments[wiId].push(created);
          return sendJson(res, 200, created);
        }

        if (method === 'GET') {
          const err = validateApiVersion(reqRecord, {
            previewOnly: true,
            minPreviewHint: `${profile.maxApiVersion}-preview.${profile.witCommentsResourceVersion}`,
          });
          if (err) {
            return sendJson(res, err.status, err.body);
          }

          if (!getOwn(state.workItems, wiId)) {
            return sendJson(res, 404, {
              message: `Work item ${wiId} does not exist.`,
            });
          }
          const allComments = [...(getOwn(state.workItemComments, wiId) || [])];
          if (restSegments.length === 5) {
            const commentId = Number.parseInt(restSegments[4], 10);
            const single = allComments.find((c) => c.id === commentId);
            if (!single) {
              return sendJson(res, 404, {
                message: `Comment ${commentId} on work item ${wiId} not found.`,
              });
            }
            return sendJson(res, 200, single);
          }
          const order = (getQueryParam(sp, 'order') || '').toLowerCase();
          if (order === 'desc' || order === '1') {
            allComments.reverse();
          }
          const top = parseNonNegativeIntParam(sp, '$top', 100);
          const sliced = allComments.slice(0, top);
          // CommentList shape (NOT { count, value }!)
          return sendJson(res, 200, {
            totalCount: allComments.length,
            count: sliced.length,
            comments: sliced,
            url: `${collectionUrl}/${project}/_apis/wit/workItems/${wiId}/comments`,
          });
        }
      }

      // All remaining WIT routes are GA across 5.0-7.1
      const err = validateApiVersion(reqRecord);
      if (err) {
        return sendJson(res, err.status, err.body);
      }

      // Revisions
      if (
        method === 'GET' &&
        restLower[1] === 'workitems' &&
        restLower[3] === 'revisions'
      ) {
        const wiId = Number.parseInt(restSegments[2], 10);
        const revs = getOwn(state.workItemRevisions, wiId);
        if (!revs) {
          return sendJson(res, 404, {
            message: `Work item ${wiId} not found.`,
          });
        }
        if (restSegments.length === 5) {
          const revNum = Number.parseInt(restSegments[4], 10);
          const found = revs.find((r) => r.rev === revNum);
          if (!found) {
            return sendJson(res, 404, {
              message: `Revision ${revNum} for work item ${wiId} not found.`,
            });
          }
          return sendJson(res, 200, found);
        }
        const skip = parseNonNegativeIntParam(sp, '$skip', 0);
        const top = parseNonNegativeIntParam(sp, '$top', 200);
        const slice = revs.slice(skip, skip + top);
        return sendJson(res, 200, { count: slice.length, value: slice });
      }

      // WIQL
      if (restLower[1] === 'wiql') {
        const items = Object.values(state.workItems);
        const top = parseNonNegativeIntParam(sp, '$top', 200);
        const queryText =
          reqRecord.parsedBody && typeof reqRecord.parsedBody.query === 'string'
            ? reqRecord.parsedBody.query
            : '';
        let filtered = items;
        const stateMatch = /\[System\.State\]\s*=\s*'([^']+)'/i.exec(queryText);
        if (stateMatch) {
          filtered = filtered.filter(
            (wi) =>
              String(wi.fields['System.State'] || '').toLowerCase() ===
              stateMatch[1].toLowerCase(),
          );
        }
        const slice = filtered.slice(0, top);
        return sendJson(res, 200, {
          queryType: 'flat',
          asOf: new Date().toISOString(),
          workItems: slice.map((wi) => ({ id: wi.id, url: wi.url })),
        });
      }

      // Work items batch POST
      if (method === 'POST' && restLower[1] === 'workitemsbatch') {
        const ids = Array.isArray(reqRecord.parsedBody?.ids)
          ? reqRecord.parsedBody.ids
          : [];
        const list = ids
          .map((id) => getOwn(state.workItems, Number(id)))
          .filter(Boolean);
        return sendJson(res, 200, { count: list.length, value: list });
      }

      // Work items CRUD
      if (restLower[1] === 'workitems') {
        // GET ?ids=101,102
        if (method === 'GET' && restSegments.length === 2) {
          const idsStr = getQueryParam(sp, 'ids') || '';
          const ids = idsStr
            .split(',')
            .map((s) => Number.parseInt(s.trim(), 10))
            .filter(Number.isFinite);
          const list = ids
            .map((id) => getOwn(state.workItems, id))
            .filter(Boolean);
          return sendJson(res, 200, { count: list.length, value: list });
        }

        // POST /workitems/$User Story
        if (
          method === 'POST' &&
          restSegments.length === 3 &&
          restSegments[2].startsWith('$')
        ) {
          const wiType = restSegments[2].slice(1);
          const id = state.nextWorkItemId++;
          const baseItem = {
            id,
            rev: 0,
            url: `${collectionUrl}/${project}/_apis/wit/workItems/${id}`,
            fields: {
              'System.Id': id,
              'System.TeamProject': project,
              'System.WorkItemType': wiType,
              'System.State': 'New',
              'System.AreaPath': project,
              'System.IterationPath': project,
              'System.CreatedDate': new Date().toISOString(),
            },
            relations: [],
          };
          const created = applyWorkItemPatch(
            baseItem,
            reqRecord.parsedBody || [],
            project,
          );
          state.workItems[id] = created;
          state.workItemRevisions[id] = [deepClone(created)];
          state.workItemComments[id] = [];
          return sendJson(res, 200, created);
        }

        if (restSegments.length === 3) {
          const wiId = Number.parseInt(restSegments[2], 10);
          const existing = getOwn(state.workItems, wiId);
          if (!existing) {
            return sendJson(res, 404, {
              message: `Work item ${wiId} does not exist.`,
            });
          }

          if (method === 'GET') {
            return sendJson(res, 200, existing);
          }
          if (method === 'PATCH') {
            const updated = applyWorkItemPatch(
              existing,
              reqRecord.parsedBody || [],
              project,
            );
            state.workItems[wiId] = updated;
            state.workItemRevisions[wiId] =
              getOwn(state.workItemRevisions, wiId) || [];
            state.workItemRevisions[wiId].push(deepClone(updated));
            return sendJson(res, 200, updated);
          }
        }
      }

      // Work item types & fields (hidden secondary call from get_work_item!)
      if (method === 'GET' && restLower[1] === 'workitemtypes') {
        if (restSegments.length === 2) {
          return sendJson(res, 200, {
            count: state.workItemTypes.length,
            value: state.workItemTypes,
          });
        }
        if (restLower[3] === 'fields') {
          const fields = [
            {
              name: 'Title',
              referenceName: 'System.Title',
              alwaysRequired: true,
            },
            {
              name: 'State',
              referenceName: 'System.State',
              alwaysRequired: true,
            },
            {
              name: 'Description',
              referenceName: 'System.Description',
              alwaysRequired: false,
            },
          ];
          return sendJson(res, 200, { count: fields.length, value: fields });
        }
      }

      // Classification Nodes (accepts BOTH 'iterations'/'1' and 'areas'/'0', respects $depth!)
      if (method === 'GET' && restLower[1] === 'classificationnodes') {
        const depthRaw = getQueryParam(sp, '$depth');
        const depth = depthRaw !== null ? Number.parseInt(depthRaw, 10) : 0;
        if (!Number.isFinite(depth) || depth < 0) {
          return sendJson(res, 400, {
            message: '$depth must be a non-negative integer.',
          });
        }

        if (restSegments.length === 2) {
          const roots = [
            trimClassificationDepth(state.classificationNodes.areas, depth),
            trimClassificationDepth(
              state.classificationNodes.iterations,
              depth,
            ),
          ];
          return sendJson(res, 200, { count: roots.length, value: roots });
        }

        const groupSeg = restLower[2];
        let rootNode;
        if (groupSeg === 'iterations' || groupSeg === '1') {
          rootNode = state.classificationNodes.iterations;
        } else if (groupSeg === 'areas' || groupSeg === '0') {
          rootNode = state.classificationNodes.areas;
        } else {
          return sendJson(res, 400, {
            message: `Invalid classification structureGroup '${restSegments[2]}'.`,
          });
        }

        let current = rootNode;
        const subSegments = restSegments
          .slice(3)
          .flatMap((s) => s.split('/'))
          .filter(Boolean);
        for (const seg of subSegments) {
          const child = (current.children || []).find(
            (c) => c.name.toLowerCase() === seg.toLowerCase(),
          );
          if (!child) {
            return sendJson(res, 404, {
              message: `Classification node '${seg}' not found.`,
            });
          }
          current = child;
        }
        return sendJson(res, 200, trimClassificationDepth(current, depth));
      }

      // Attachments
      if (restLower[1] === 'attachments') {
        if (method === 'POST') {
          const attId = crypto.randomUUID();
          const fileName = getQueryParam(sp, 'fileName') || 'attachment.bin';
          state.attachments[attId] = {
            id: attId,
            fileName,
            content: rawBodyBuf,
          };
          return sendJson(res, 201, {
            id: attId,
            url: `${collectionUrl}/${project}/_apis/wit/attachments/${attId}`,
          });
        }
        if (method === 'GET' && restSegments.length === 3) {
          const att = getOwn(state.attachments, restSegments[2]);
          if (!att) {
            return sendJson(res, 404, {
              message: `TF401232: Attachment '${restSegments[2]}' does not exist.`,
              typeKey: 'AttachmentNotFoundException',
            });
          }
          return sendText(res, 200, att.content, 'application/octet-stream');
        }
      }
    }

    // 4i. Policy Evaluations
    if (
      method === 'GET' &&
      restLower[0] === 'policy' &&
      restLower[1] === 'evaluations'
    ) {
      const err = validateApiVersion(reqRecord, {
        previewOnly: profile.policyPreviewOnly,
        minPreviewHint: `${profile.maxApiVersion}-preview.1`,
      });
      if (err) {
        return sendJson(res, err.status, err.body);
      }

      const artifactId = getQueryParam(sp, 'artifactId');
      const matches = artifactId
        ? state.policyEvaluations.filter(
            (e) => e.artifactId.toLowerCase() === artifactId.toLowerCase(),
          )
        : state.policyEvaluations;
      return sendJson(res, 200, { count: matches.length, value: matches });
    }

    // 4j. Git (Repositories, Refs, Stats, Items, Blobs, Commits, Pushes, Pull Requests & Reviewers)
    if (restLower[0] === 'git') {
      const err = validateApiVersion(reqRecord);
      if (err) {
        return sendJson(res, err.status, err.body);
      }

      const filterPullRequests = (list) => {
        const statusParam = (getQueryParam(sp, 'searchCriteria.status') || '')
          .trim()
          .toLowerCase();
        if (!statusParam || statusParam === 'all' || statusParam === '4') {
          return list;
        }
        const statusMap = { 1: 'active', 2: 'abandoned', 3: 'completed' };
        const wanted = getOwn(statusMap, statusParam) || statusParam;
        return list.filter(
          (p) => String(p.status || '').toLowerCase() === wanted,
        );
      };

      // Project/org-level PRs: GET /_apis/git/pullrequests and GET /_apis/git/pullrequests/{prId}
      if (method === 'GET' && restLower[1] === 'pullrequests') {
        if (restSegments.length === 2) {
          const allPrs = filterPullRequests(Object.values(state.pullRequests));
          const skip = parseNonNegativeIntParam(sp, '$skip', 0);
          const top = parseNonNegativeIntParam(sp, '$top', 50);
          const slice = allPrs.slice(skip, skip + top);
          return sendJson(res, 200, { count: slice.length, value: slice });
        }
        if (restSegments.length === 3) {
          const prId = Number.parseInt(restSegments[2], 10);
          const pr = getOwn(state.pullRequests, prId);
          if (!pr) {
            return sendJson(res, 404, {
              message: `Pull request ${prId} not found.`,
            });
          }
          return sendJson(res, 200, pr);
        }
      }

      if (restLower[1] === 'repositories') {
        if (method === 'GET' && restSegments.length === 2) {
          return sendJson(res, 200, {
            count: state.repositories.length,
            value: state.repositories,
          });
        }

        const repo = findRepo(restSegments[2]);
        if (!repo) {
          return sendJson(res, 404, {
            message: `Repository '${restSegments[2]}' not found.`,
          });
        }

        if (method === 'GET' && restSegments.length === 3) {
          return sendJson(res, 200, repo);
        }

        // Refs
        if (restLower[3] === 'refs') {
          if (method === 'GET') {
            const filter = getQueryParam(sp, 'filter');
            const filterContains = getQueryParam(sp, 'filterContains');
            const includeMyBranches =
              (getQueryParam(sp, 'includeMyBranches') || '').toLowerCase() ===
              'true';
            const includeStatuses =
              (getQueryParam(sp, 'includeStatuses') || '').toLowerCase() ===
              'true';
            const topRaw = getQueryParam(sp, '$top');
            const continuationToken = getQueryParam(sp, 'continuationToken');

            // STRICT: filter + includeMyBranches=true is mutually exclusive (HTTP 400!)
            if (filter && includeMyBranches) {
              return sendJson(res, 400, {
                message:
                  'The includeMyBranches parameter cannot be combined with the filter parameter.',
                typeKey: 'InvalidArgumentException',
              });
            }

            let top = null;
            if (topRaw !== null) {
              top = Number.parseInt(topRaw, 10);
              if (!Number.isFinite(top) || top < 1 || top > 1000) {
                return sendJson(res, 400, {
                  message: `Invalid $top value '${topRaw}'. Must be an integer between 1 and 1000.`,
                  typeKey: 'InvalidArgumentException',
                });
              }
            }

            let refs = deepClone(state.refs);
            if (filter) {
              const normalizedFilter = filter.startsWith('refs/')
                ? filter
                : `refs/${filter}`;
              refs = refs.filter((r) =>
                r.name.toLowerCase().startsWith(normalizedFilter.toLowerCase()),
              );
            }
            if (filterContains) {
              refs = refs.filter((r) =>
                r.name.toLowerCase().includes(filterContains.toLowerCase()),
              );
            }
            if (includeMyBranches) {
              refs = refs.filter(
                (r) =>
                  r.name.startsWith('refs/heads/') &&
                  r.creator &&
                  r.creator.id === state.authenticatedUser.id,
              );
            }
            if (!includeStatuses) {
              refs = refs.map(({ statuses: _s, ...rest }) => rest);
            }

            const extraHeaders = {};
            if (profile.supportsRefsTopContinuation && top !== null) {
              const parsedOffset = continuationToken
                ? Number.parseInt(continuationToken, 10)
                : 0;
              const offset =
                Number.isInteger(parsedOffset) && parsedOffset >= 0
                  ? parsedOffset
                  : 0;
              const page = refs.slice(offset, offset + top);
              if (offset + top < refs.length) {
                extraHeaders['x-ms-continuationtoken'] = String(offset + top);
              }
              return sendJson(
                res,
                200,
                { count: page.length, value: page },
                extraHeaders,
              );
            }

            return sendJson(res, 200, { count: refs.length, value: refs });
          }

          if (method === 'POST') {
            const updates = Array.isArray(reqRecord.parsedBody)
              ? reqRecord.parsedBody
              : [];
            const results = updates.map((u) => {
              const existingIdx = state.refs.findIndex(
                (r) => r.name === u.name,
              );
              if (existingIdx >= 0) {
                state.refs[existingIdx].objectId = u.newObjectId;
              } else {
                state.refs.push({
                  name: u.name,
                  objectId: u.newObjectId,
                  creator: {
                    id: state.authenticatedUser.id,
                    displayName: state.authenticatedUser.displayName,
                    uniqueName: state.authenticatedUser.uniqueName,
                  },
                  isLocked: false,
                  statuses: [],
                });
              }
              return {
                name: u.name,
                oldObjectId: u.oldObjectId,
                newObjectId: u.newObjectId,
                success: true,
                updateStatus: 'succeeded',
              };
            });
            return sendJson(res, 200, {
              count: results.length,
              value: results,
            });
          }
        }

        // Branch stats
        if (
          method === 'GET' &&
          restLower[3] === 'stats' &&
          restLower[4] === 'branches'
        ) {
          const branchName = getQueryParam(sp, 'name');
          if (branchName) {
            const clean = branchName
              .replace(/^refs\/heads\//, '')
              .toLowerCase();
            const found = state.branchStats.find(
              (b) => b.name.toLowerCase() === clean,
            );
            if (!found) {
              return sendJson(res, 404, {
                message: `Branch '${branchName}' not found.`,
              });
            }
            return sendJson(res, 200, found);
          }
          return sendJson(res, 200, {
            count: state.branchStats.length,
            value: state.branchStats,
          });
        }

        // Items (distinguishes Accept: application/octet-stream vs application/json!)
        if (method === 'GET' && restLower[3] === 'items') {
          const accept = String(req.headers.accept || '').toLowerCase();
          const itemPath = getQueryParam(sp, 'path');
          const scopePath = getQueryParam(sp, 'scopePath');
          const includeContent =
            (getQueryParam(sp, 'includeContent') || '').toLowerCase() ===
            'true';

          if (accept.includes('application/octet-stream')) {
            const target = itemPath || scopePath || '/README.md';
            const normalized = target.startsWith('/') ? target : `/${target}`;
            const file = getOwn(state.repoFiles, normalized);
            if (!file) {
              return sendJson(res, 404, {
                message: `File '${normalized}' not found.`,
              });
            }
            return sendText(res, 200, file.content, 'application/octet-stream');
          }

          if (itemPath === null) {
            const rawPrefix = (scopePath || '/').startsWith('/')
              ? scopePath || '/'
              : `/${scopePath}`;
            const prefix =
              rawPrefix.length > 1 ? rawPrefix.replace(/\/+$/, '') : rawPrefix;
            const dirPrefix = prefix === '/' ? '/' : `${prefix}/`;
            const items = Object.entries(state.repoFiles)
              .filter(
                ([p]) =>
                  prefix === '/' || p === prefix || p.startsWith(dirPrefix),
              )
              .map(([p, meta]) => ({
                path: p,
                objectId: meta.objectId,
                gitObjectType: meta.gitObjectType,
                isFolder: meta.isFolder,
                ...(includeContent ? { content: meta.content } : {}),
              }));
            return sendJson(res, 200, { count: items.length, value: items });
          }

          const target = itemPath || '/README.md';
          const normalized = target.startsWith('/') ? target : `/${target}`;
          const file = getOwn(state.repoFiles, normalized);
          if (!file) {
            return sendJson(res, 404, {
              message: `Item '${normalized}' not found.`,
            });
          }
          return sendJson(res, 200, {
            path: normalized,
            objectId: file.objectId,
            gitObjectType: file.gitObjectType,
            isFolder: file.isFolder,
            ...(includeContent ? { content: file.content } : {}),
          });
        }

        // Blobs
        if (
          method === 'GET' &&
          restLower[3] === 'blobs' &&
          restSegments.length === 5
        ) {
          const content = getOwn(state.blobs, restSegments[4]);
          if (content === undefined) {
            return sendJson(res, 404, {
              message: `Blob '${restSegments[4]}' not found.`,
            });
          }
          return sendText(res, 200, content, 'application/octet-stream');
        }

        // Commits & commit changes
        if (method === 'GET' && restLower[3] === 'commits') {
          if (restSegments.length === 4) {
            return sendJson(res, 200, {
              count: state.commits.length,
              value: state.commits,
            });
          }
          if (restLower[5] === 'changes') {
            return sendJson(res, 200, {
              changes: [
                {
                  changeType: 'edit',
                  item: {
                    path: '/src/app.ts',
                    objectId: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2',
                  },
                },
              ],
            });
          }
          const found = state.commits.find(
            (c) => c.commitId === restSegments[4],
          );
          if (!found) {
            return sendJson(res, 404, {
              message: `Commit '${restSegments[4]}' not found.`,
            });
          }
          return sendJson(res, 200, found);
        }

        // Pushes (GET list, GET single, POST create)
        if (restLower[3] === 'pushes') {
          if (method === 'GET' && restSegments.length === 4) {
            let pushes = [...(state.pushes || [])];
            const refNameFilter = getQueryParam(sp, 'searchCriteria.refName');
            if (refNameFilter) {
              const refLower = refNameFilter.toLowerCase();
              pushes = pushes.filter(
                (p) =>
                  (Array.isArray(p.refUpdates) &&
                    p.refUpdates.some(
                      (u) => String(u.name || '').toLowerCase() === refLower,
                    )) ||
                  (typeof p.refName === 'string' &&
                    p.refName.toLowerCase() === refLower),
              );
            }
            pushes.sort((a, b) => (b.pushId ?? 0) - (a.pushId ?? 0));
            const skip = parseNonNegativeIntParam(sp, '$skip', 0);
            const top = parseNonNegativeIntParam(sp, '$top', 100);
            const slice = pushes.slice(skip, skip + top);
            return sendJson(res, 200, { count: slice.length, value: slice });
          }
          if (method === 'GET' && restSegments.length === 5) {
            const pushId = Number.parseInt(restSegments[4], 10);
            const found = (state.pushes || []).find((p) => p.pushId === pushId);
            if (!found) {
              return sendJson(res, 404, {
                message: `Push '${restSegments[4]}' not found.`,
              });
            }
            return sendJson(res, 200, found);
          }
          if (method === 'POST' && restSegments.length === 4) {
            const newSha = crypto.randomBytes(20).toString('hex');
            const pushId =
              typeof state.nextPushId === 'number'
                ? state.nextPushId++
                : Date.now();
            const projectName =
              prefixSegments[0] || repo.project?.name || 'DemoProject';
            const push = {
              pushId,
              date: new Date().toISOString(),
              pushedBy: {
                id: state.authenticatedUser.id,
                displayName: state.authenticatedUser.displayName,
                uniqueName: state.authenticatedUser.uniqueName,
              },
              refUpdates: reqRecord.parsedBody?.refUpdates || [],
              commits: [
                {
                  commitId: newSha,
                  comment:
                    reqRecord.parsedBody?.commits?.[0]?.comment || 'Commit',
                },
              ],
              repository: repo,
              url: `${collectionUrl}/${projectName}/_apis/git/repositories/${repo.id}/pushes/${pushId}`,
            };
            state.pushes = state.pushes || [];
            state.pushes.push(push);
            return sendJson(res, 201, push);
          }
        }

        // Pull Requests under repository
        if (restLower[3] === 'pullrequests') {
          if (restSegments.length === 4) {
            if (method === 'GET') {
              const allPrs = filterPullRequests(
                Object.values(state.pullRequests),
              );
              const skip = parseNonNegativeIntParam(sp, '$skip', 0);
              const top = parseNonNegativeIntParam(sp, '$top', 50);
              const slice = allPrs.slice(skip, skip + top);
              return sendJson(res, 200, { count: slice.length, value: slice });
            }
            if (method === 'POST') {
              const prId = state.nextPullRequestId++;
              const body = reqRecord.parsedBody || {};
              const created = {
                pullRequestId: prId,
                codeReviewId: prId,
                status: 'active',
                title: body.title || `PR ${prId}`,
                description: body.description || '',
                sourceRefName: body.sourceRefName || 'refs/heads/feature/new',
                targetRefName: body.targetRefName || 'refs/heads/main',
                mergeStatus: 'succeeded',
                isDraft: Boolean(body.isDraft),
                creationDate: new Date().toISOString(),
                createdBy: {
                  id: state.authenticatedUser.id,
                  displayName: state.authenticatedUser.displayName,
                  uniqueName: state.authenticatedUser.uniqueName,
                },
                repository: repo,
                reviewers: Array.isArray(body.reviewers) ? body.reviewers : [],
                labels: [],
                threads: [],
                iterations: [],
                iterationChanges: {},
                statuses: [],
              };
              state.pullRequests[prId] = created;
              return sendJson(res, 201, created);
            }
          }

          const prId = Number.parseInt(restSegments[4], 10);
          const pr = getOwn(state.pullRequests, prId);
          if (!pr) {
            return sendJson(res, 404, {
              message: `Pull request ${prId} not found.`,
            });
          }

          if (restSegments.length === 5) {
            if (method === 'GET') {
              return sendJson(res, 200, pr);
            }
            if (method === 'PATCH') {
              assignSafeOwnProps(pr, reqRecord.parsedBody);
              return sendJson(res, 200, pr);
            }
          }

          // PR Reviewers
          if (restLower[5] === 'reviewers') {
            if (restSegments.length === 6) {
              if (method === 'GET') {
                return sendJson(res, 200, {
                  count: pr.reviewers.length,
                  value: pr.reviewers,
                });
              }
              if (method === 'POST') {
                if (
                  pr.status === 'completed' ||
                  pr.status === 'abandoned' ||
                  pr.status === 3 ||
                  pr.status === 2
                ) {
                  return sendJson(res, 400, {
                    message: `Cannot modify reviewers on a ${pr.status} pull request.`,
                  });
                }
                const list = Array.isArray(reqRecord.parsedBody)
                  ? reqRecord.parsedBody
                  : [];
                const added = [];
                for (const item of list) {
                  if (!item || !UUID_RE.test(String(item.id || ''))) {
                    return sendJson(res, 400, {
                      message: `Invalid reviewer ID '${item?.id}'. Reviewer ID must be a valid UUID.`,
                    });
                  }
                  const identity = state.identities.find(
                    (u) => u.id.toLowerCase() === item.id.toLowerCase(),
                  );
                  const entry = {
                    id: item.id,
                    displayName:
                      identity?.displayName || item.displayName || item.id,
                    uniqueName:
                      identity?.uniqueName ||
                      item.uniqueName ||
                      `${item.id}@example.com`,
                    vote: item.vote ?? 0,
                    isRequired: Boolean(item.isRequired),
                    hasDeclined: Boolean(item.hasDeclined),
                    isFlagged: Boolean(item.isFlagged),
                  };
                  const idx = pr.reviewers.findIndex(
                    (r) => r.id.toLowerCase() === item.id.toLowerCase(),
                  );
                  if (idx >= 0) {
                    pr.reviewers[idx] = entry;
                  } else {
                    pr.reviewers.push(entry);
                  }
                  added.push(entry);
                }
                return sendJson(res, 200, {
                  count: added.length,
                  value: added,
                });
              }
            }

            if (restSegments.length === 7) {
              const reviewerId = restSegments[6];
              if (!UUID_RE.test(reviewerId)) {
                return sendJson(res, 400, {
                  message: `Invalid reviewerId '${reviewerId}'. Reviewer ID must be a valid UUID.`,
                  typeKey: 'InvalidArgumentException',
                });
              }

              const existingIdx = pr.reviewers.findIndex(
                (r) => r.id.toLowerCase() === reviewerId.toLowerCase(),
              );

              if (method === 'GET') {
                if (existingIdx < 0) {
                  return sendJson(res, 404, {
                    message: `Reviewer '${reviewerId}' not found on PR ${prId}.`,
                  });
                }
                return sendJson(res, 200, pr.reviewers[existingIdx]);
              }

              if (method === 'PUT') {
                if (
                  pr.status === 'completed' ||
                  pr.status === 'abandoned' ||
                  pr.status === 3 ||
                  pr.status === 2
                ) {
                  return sendJson(res, 400, {
                    message: `Cannot cast vote or update reviewer on a ${pr.status} pull request.`,
                    typeKey: 'GitPullRequestNotActiveException',
                  });
                }
                const body = reqRecord.parsedBody || {};
                if (body.vote !== undefined && !VALID_PR_VOTES.has(body.vote)) {
                  return sendJson(res, 400, {
                    message: `Invalid vote value '${body.vote}'. Valid values are 10, 5, 0, -5, -10.`,
                    typeKey: 'InvalidArgumentException',
                  });
                }
                const identity = state.identities.find(
                  (u) => u.id.toLowerCase() === reviewerId.toLowerCase(),
                );
                // Real ADO PUT replaces reviewer state: omitting isRequired resets it to false!
                const updatedReviewer = {
                  id: reviewerId,
                  displayName:
                    identity?.displayName ||
                    (existingIdx >= 0
                      ? pr.reviewers[existingIdx].displayName
                      : reviewerId),
                  uniqueName:
                    identity?.uniqueName ||
                    (existingIdx >= 0
                      ? pr.reviewers[existingIdx].uniqueName
                      : `${reviewerId}@example.com`),
                  vote:
                    body.vote !== undefined
                      ? body.vote
                      : existingIdx >= 0
                        ? pr.reviewers[existingIdx].vote
                        : 0,
                  isRequired: Boolean(body.isRequired),
                  hasDeclined: Boolean(body.hasDeclined),
                  isFlagged: Boolean(body.isFlagged),
                  isReapprove: Boolean(body.isReapprove),
                };
                if (existingIdx >= 0) {
                  pr.reviewers[existingIdx] = updatedReviewer;
                } else {
                  pr.reviewers.push(updatedReviewer);
                }
                return sendJson(res, 200, updatedReviewer);
              }

              if (method === 'DELETE') {
                if (existingIdx < 0) {
                  return sendJson(res, 404, {
                    message: `Reviewer '${reviewerId}' not found on PR ${prId}.`,
                  });
                }
                pr.reviewers.splice(existingIdx, 1);
                return sendNoContent(res);
              }
            }
          }

          // PR Threads & Comments
          if (restLower[5] === 'threads') {
            if (restSegments.length === 6) {
              if (method === 'GET') {
                return sendJson(res, 200, {
                  count: pr.threads.length,
                  value: pr.threads,
                });
              }
              if (method === 'POST') {
                const threadId = pr.threads.length + 1;
                const body = reqRecord.parsedBody || {};
                const thread = {
                  id: threadId,
                  status: body.status ?? 'active',
                  publishedDate: new Date().toISOString(),
                  lastUpdatedDate: new Date().toISOString(),
                  threadContext: body.threadContext,
                  comments: (body.comments || []).map((c, idx) => ({
                    id: idx + 1,
                    content: c.content,
                    commentType: c.commentType ?? 'text',
                    author: state.authenticatedUser,
                  })),
                };
                pr.threads.push(thread);
                return sendJson(res, 200, thread);
              }
            }
            const threadId = Number.parseInt(restSegments[6], 10);
            const thread = pr.threads.find((t) => t.id === threadId);
            if (!thread) {
              return sendJson(res, 404, {
                message: `Thread ${threadId} not found.`,
              });
            }

            if (restSegments.length === 7) {
              if (method === 'GET') {
                return sendJson(res, 200, thread);
              }
              if (method === 'PATCH') {
                assignSafeOwnProps(thread, reqRecord.parsedBody);
                thread.lastUpdatedDate = new Date().toISOString();
                return sendJson(res, 200, thread);
              }
            }
            if (method === 'POST' && restLower[7] === 'comments') {
              const comment = {
                id: thread.comments.length + 1,
                content: reqRecord.parsedBody?.content || '',
                commentType: reqRecord.parsedBody?.commentType ?? 'text',
                publishedDate: new Date().toISOString(),
                author: state.authenticatedUser,
              };
              thread.comments.push(comment);
              return sendJson(res, 200, comment);
            }
          }

          // PR Iterations & Changes
          if (method === 'GET' && restLower[5] === 'iterations') {
            if (restSegments.length === 6) {
              return sendJson(res, 200, {
                count: pr.iterations.length,
                value: pr.iterations,
              });
            }
            if (restLower[7] === 'changes') {
              const iterId = Number.parseInt(restSegments[6], 10);
              return sendJson(
                res,
                200,
                getOwn(pr.iterationChanges, iterId) || { changeEntries: [] },
              );
            }
          }

          // PR Statuses
          if (method === 'GET' && restLower[5] === 'statuses') {
            return sendJson(res, 200, {
              count: pr.statuses.length,
              value: pr.statuses,
            });
          }

          // PR Labels
          if (restLower[5] === 'labels') {
            if (method === 'GET') {
              return sendJson(res, 200, {
                count: pr.labels.length,
                value: pr.labels,
              });
            }
            if (method === 'POST') {
              const lbl = {
                id: crypto.randomUUID(),
                name: reqRecord.parsedBody?.name || 'tag',
                active: true,
              };
              pr.labels.push(lbl);
              return sendJson(res, 200, lbl);
            }
            if (method === 'DELETE' && restSegments.length === 7) {
              const needle = restSegments[6].toLowerCase();
              pr.labels = pr.labels.filter(
                (l) =>
                  l.id.toLowerCase() !== needle &&
                  l.name.toLowerCase() !== needle,
              );
              return sendNoContent(res);
            }
          }
        }
      }
    }

    // 4k. Pipelines API (404 on 2019, 6.0-preview.1 on 2020, GA on 2022/Services)
    if (restLower[0] === 'pipelines') {
      const err = validateApiVersion(reqRecord, {
        supported: profile.supportsPipelinesApi,
        previewOnly: profile.pipelinesPreviewOnly,
        minPreviewHint: '6.0-preview.1',
      });
      if (err) {
        return sendJson(res, err.status, err.body);
      }

      // List pipelines
      if (method === 'GET' && restSegments.length === 1) {
        return sendJson(res, 200, {
          count: state.pipelines.length,
          value: state.pipelines,
        });
      }
      // Fallback GET /_apis/pipelines/runs/{runId}
      if (
        method === 'GET' &&
        restLower[1] === 'runs' &&
        restSegments.length === 3
      ) {
        const runId = Number.parseInt(restSegments[2], 10);
        const run = getOwn(state.builds, runId);
        if (!run) {
          return sendJson(res, 404, {
            message: `Pipeline run ${runId} not found.`,
          });
        }
        return sendJson(res, 200, run);
      }

      const pipelineId = Number.parseInt(restSegments[1], 10);
      const pipeline = state.pipelines.find((p) => p.id === pipelineId);
      if (!pipeline) {
        return sendJson(res, 404, {
          message: `Pipeline ${pipelineId} not found.`,
        });
      }

      if (method === 'GET' && restSegments.length === 2) {
        return sendJson(res, 200, pipeline);
      }

      if (restLower[2] === 'runs') {
        if (restSegments.length === 3) {
          if (method === 'GET') {
            const runs = Object.values(state.builds).filter(
              (b) => b.pipeline?.id === pipelineId,
            );
            return sendJson(res, 200, { count: runs.length, value: runs });
          }
          if (method === 'POST') {
            const runId = state.nextBuildId++;
            const newRun = {
              id: runId,
              buildNumber: `20261125.${runId}`,
              name: `20261125.${runId}`,
              state: 'inProgress',
              status: 'inProgress',
              result: null,
              createdDate: new Date().toISOString(),
              definition: { id: pipeline.id, name: pipeline.name },
              pipeline: {
                id: pipeline.id,
                name: pipeline.name,
                revision: pipeline.revision,
              },
              sourceBranch:
                reqRecord.parsedBody?.resources?.repositories?.self?.refName ||
                'refs/heads/main',
              stages: {},
              timeline: { id: `tl-${runId}`, changeId: 1, records: [] },
              logs: {},
              artifacts: [],
            };
            state.builds[runId] = newRun;
            return sendJson(res, 200, newRun);
          }
        }

        const runId = Number.parseInt(restSegments[3], 10);
        const run = getOwn(state.builds, runId);
        if (!run) {
          return sendJson(res, 404, {
            message: `Pipeline run ${runId} not found.`,
          });
        }

        if (method === 'GET' && restSegments.length === 4) {
          return sendJson(res, 200, run);
        }
        if (method === 'GET' && restLower[4] === 'artifacts') {
          const artifactName =
            getQueryParam(sp, 'artifactName') || 'report-zip';
          return sendJson(res, 200, {
            name: artifactName,
            signedContent: {
              url: `${collectionUrl}/_apis/mock-downloads/report.zip`,
              signatureExpires: '2026-12-31T23:59:59Z',
            },
          });
        }
      }
    }

    // 4l. Build API (Definitions, Builds, Timeline, Logs, Artifacts, Stages PATCH)
    if (restLower[0] === 'build') {
      // PATCH /_apis/build/builds/{id}/stages/{stageRefName}
      if (
        method === 'PATCH' &&
        restLower[1] === 'builds' &&
        restLower[3] === 'stages' &&
        restSegments.length === 5
      ) {
        const err = validateApiVersion(reqRecord, {
          supported: profile.supportsBuildStages,
          previewOnly: profile.buildStagesPreviewOnly,
          minPreviewHint: '6.0-preview.1',
        });
        if (err) {
          return sendJson(res, err.status, err.body);
        }

        const buildId = Number.parseInt(restSegments[2], 10);
        const stageRefName = restSegments[4];
        const build = getOwn(state.builds, buildId);
        if (!build) {
          return sendJson(res, 404, { message: `Build ${buildId} not found.` });
        }

        const stageKey = Object.keys(build.stages || {}).find(
          (k) => k.toLowerCase() === stageRefName.toLowerCase(),
        );
        if (!stageKey) {
          return sendJson(res, 400, {
            message: `Stage '${stageRefName}' does not exist in build ${buildId}.`,
            typeKey: 'InvalidArgumentException',
          });
        }
        const stage = build.stages[stageKey];
        const body = reqRecord.parsedBody || {};
        const reqState = body.state;
        const normalizedState =
          reqState === 1 || String(reqState).toLowerCase() === 'retry'
            ? 'retry'
            : reqState === 0 || String(reqState).toLowerCase() === 'cancel'
              ? 'cancel'
              : reqState === 2 || String(reqState).toLowerCase() === 'run'
                ? 'run'
                : null;

        if (!normalizedState) {
          return sendJson(res, 400, {
            message: `Invalid stage update state '${reqState}'. Expected retry (1), cancel (0), or run (2).`,
          });
        }

        if (normalizedState === 'retry') {
          if (stage.state === 'inProgress') {
            return sendJson(res, 400, {
              message: `Stage '${stageRefName}' is currently inProgress and cannot be retried.`,
            });
          }
          if (stage.result === 'succeeded' && body.forceRetryAllJobs !== true) {
            return sendJson(res, 400, {
              message: `Stage '${stageRefName}' succeeded; set forceRetryAllJobs=true to re-run all jobs.`,
            });
          }
          stage.state = 'pending';
          stage.result = null;
          stage.attempt = (stage.attempt || 1) + 1;
          stage.lastForceRetryAllJobs = Boolean(body.forceRetryAllJobs);
        } else if (normalizedState === 'cancel') {
          stage.state = 'canceling';
        } else if (normalizedState === 'run') {
          stage.state = 'inProgress';
        }

        return sendNoContent(res);
      }

      const err = validateApiVersion(reqRecord);
      if (err) {
        return sendJson(res, err.status, err.body);
      }

      if (method === 'GET' && restLower[1] === 'definitions') {
        const nameFilter = (getQueryParam(sp, 'name') || '')
          .replace(/\*/g, '')
          .toLowerCase();
        const defs = state.pipelines.filter(
          (p) => !nameFilter || p.name.toLowerCase().includes(nameFilter),
        );
        return sendJson(res, 200, { count: defs.length, value: defs });
      }

      if (method === 'GET' && restLower[1] === 'builds') {
        if (restSegments.length === 2) {
          const buildNumber = getQueryParam(sp, 'buildNumber');
          let list = Object.values(state.builds);
          if (buildNumber) {
            list = list.filter((b) => b.buildNumber === buildNumber);
          }
          return sendJson(res, 200, { count: list.length, value: list });
        }

        const buildId = Number.parseInt(restSegments[2], 10);
        const build = getOwn(state.builds, buildId);
        if (!build) {
          return sendJson(res, 404, { message: `Build ${buildId} not found.` });
        }

        if (restSegments.length === 3) {
          return sendJson(res, 200, build);
        }
        if (restLower[3] === 'timeline') {
          return sendJson(
            res,
            200,
            build.timeline || { id: `tl-${buildId}`, changeId: 1, records: [] },
          );
        }
        if (restLower[3] === 'artifacts') {
          return sendJson(res, 200, {
            count: build.artifacts.length,
            value: build.artifacts,
          });
        }
        if (restLower[3] === 'logs') {
          if (restSegments.length === 4) {
            const logMeta = Object.keys(build.logs || {}).map((id) => ({
              id: Number(id),
              type: 'Container',
              lineCount: build.logs[id].length,
            }));
            return sendJson(res, 200, {
              count: logMeta.length,
              value: logMeta,
            });
          }
          const logId = Number.parseInt(restSegments[4], 10);
          const lines = getOwn(build.logs, logId);
          if (!lines) {
            return sendJson(res, 404, { message: `Log ${logId} not found.` });
          }
          const startLine = parseNonNegativeIntParam(sp, 'startLine', 0);
          const endLine = parseNonNegativeIntParam(sp, 'endLine', null);
          const sliced =
            endLine !== null
              ? lines.slice(startLine, endLine)
              : lines.slice(startLine);
          return sendJson(res, 200, { count: sliced.length, value: sliced });
        }
      }
    }

    // 4m. Test API (GA across 5.0-7.1)
    if (restLower[0] === 'test') {
      const err = validateApiVersion(reqRecord);
      if (err) {
        return sendJson(res, err.status, err.body);
      }

      if (method === 'GET' && restLower[1] === 'runs') {
        if (restSegments.length === 2) {
          const buildUri = getQueryParam(sp, 'buildUri');
          let runs = [...state.testRuns];
          if (buildUri) {
            runs = runs.filter(
              (r) =>
                (r.buildUri &&
                  r.buildUri.toLowerCase() === buildUri.toLowerCase()) ||
                (r.buildConfiguration?.uri &&
                  r.buildConfiguration.uri.toLowerCase() ===
                    buildUri.toLowerCase()),
            );
          }
          const skip = parseNonNegativeIntParam(sp, '$skip', 0);
          const top = parseNonNegativeIntParam(sp, '$top', 100);
          const slice = runs.slice(skip, skip + top);
          return sendJson(res, 200, { count: slice.length, value: slice });
        }

        const runId = Number.parseInt(restSegments[2], 10);
        const run = state.testRuns.find((r) => r.id === runId);
        if (!run) {
          return sendJson(res, 404, {
            message: `Test run ${runId} not found.`,
          });
        }

        if (restSegments.length === 3) {
          return sendJson(res, 200, run);
        }

        if (restLower[3] === 'results') {
          const detailsToInclude = (
            getQueryParam(sp, 'detailsToInclude') || ''
          ).trim();
          const hasDetails =
            detailsToInclude.length > 0 &&
            detailsToInclude.toLowerCase() !== 'none' &&
            detailsToInclude !== '0';
          const maxTop = hasDetails ? 200 : 1000;
          const topRaw = getQueryParam(sp, '$top');
          let top = maxTop;
          if (topRaw !== null) {
            top = Number.parseInt(topRaw, 10);
            if (!Number.isFinite(top) || top < 1 || top > maxTop) {
              return sendJson(res, 400, {
                message: `$top value '${topRaw}' exceeds the maximum allowed limit of ${maxTop} when detailsToInclude is '${detailsToInclude || 'None'}'.`,
                typeKey: 'InvalidArgumentException',
              });
            }
          }

          let results = [...(getOwn(state.testResults, runId) || [])];
          const outcomesParam = getQueryParam(sp, 'outcomes');
          if (outcomesParam !== null && outcomesParam.trim().length > 0) {
            const tokens = outcomesParam
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            const wanted = new Set();
            for (const token of tokens) {
              const mapped = Object.hasOwn(TEST_OUTCOME_BY_CODE, token)
                ? TEST_OUTCOME_BY_CODE[token].toLowerCase()
                : token.toLowerCase();
              if (!VALID_TEST_OUTCOMES.has(mapped)) {
                return sendJson(res, 400, {
                  message: `Invalid test outcome '${token}'. Valid outcomes: ${Object.values(TEST_OUTCOME_BY_CODE).join(', ')}.`,
                  typeKey: 'InvalidArgumentException',
                });
              }
              wanted.add(mapped);
            }
            results = results.filter((r) =>
              wanted.has(String(r.outcome || '').toLowerCase()),
            );
          }

          const skip = parseNonNegativeIntParam(sp, '$skip', 0);
          const slice = results.slice(skip, skip + top);
          return sendJson(res, 200, { count: slice.length, value: slice });
        }
      }
    }

    // 4n. TestPlan API (404 on 2019, 6.0-preview.1/.3 on 2020, GA on 2022/Services)
    if (restLower[0] === 'testplan') {
      const err = validateApiVersion(reqRecord, {
        supported: profile.supportsTestPlanApi,
        previewOnly: profile.testPlanPreviewOnly,
        minPreviewHint: '6.0-preview.1',
      });
      if (err) {
        return sendJson(res, err.status, err.body);
      }

      if (restLower[1] === 'plans') {
        if (restSegments.length === 2) {
          if (method === 'GET') {
            return sendJson(res, 200, {
              count: state.testPlans.length,
              value: state.testPlans,
            });
          }
          if (method === 'POST') {
            const id = state.testPlans.length + 1;
            const plan = {
              id,
              name: reqRecord.parsedBody?.name || `Test Plan ${id}`,
              state: 'Active',
              rootSuite: {
                id: id * 10,
                name: reqRecord.parsedBody?.name || `Test Plan ${id}`,
              },
            };
            state.testPlans.push(plan);
            state.testSuites[id] = [
              {
                id: id * 10,
                name: plan.name,
                suiteType: 'staticTestSuite',
                testCases: [],
              },
            ];
            return sendJson(res, 200, plan);
          }
        }
        const planId = Number.parseInt(restSegments[2], 10);
        const plan = state.testPlans.find((p) => p.id === planId);
        if (!plan) {
          return sendJson(res, 404, {
            message: `Test plan ${planId} not found.`,
          });
        }

        if (restSegments.length === 3 && method === 'GET') {
          return sendJson(res, 200, plan);
        }

        if (restLower[3] === 'suites') {
          const suites = (state.testSuites[planId] =
            getOwn(state.testSuites, planId) || []);
          if (restSegments.length === 4) {
            if (method === 'GET') {
              return sendJson(res, 200, {
                count: suites.length,
                value: suites,
              });
            }
            if (method === 'POST') {
              const sid = suites.length + 11;
              const suite = {
                id: sid,
                name: reqRecord.parsedBody?.name || `Suite ${sid}`,
                suiteType: reqRecord.parsedBody?.suiteType || 'staticTestSuite',
                testCases: [],
              };
              suites.push(suite);
              return sendJson(res, 200, suite);
            }
          }
          const suiteId = Number.parseInt(restSegments[4], 10);
          const suite = suites.find((s) => s.id === suiteId);
          if (!suite) {
            return sendJson(res, 404, {
              message: `Test suite ${suiteId} not found.`,
            });
          }
          if (restSegments.length === 5 && method === 'GET') {
            return sendJson(res, 200, suite);
          }
          if (restLower[5] === 'testcase') {
            if (method === 'GET') {
              return sendJson(res, 200, {
                count: suite.testCases.length,
                value: suite.testCases,
              });
            }
            if (method === 'POST') {
              const items = Array.isArray(reqRecord.parsedBody)
                ? reqRecord.parsedBody
                : [];
              suite.testCases.push(...items);
              return sendJson(res, 200, { count: items.length, value: items });
            }
            if (method === 'DELETE') {
              return sendNoContent(res);
            }
          }
        }
      }
    }

    // 4o. TestResults API (Cloud Services preview only)
    if (restLower[0] === 'testresults') {
      const err = validateApiVersion(reqRecord, {
        supported: profile.supportsTestResultsApi,
        previewOnly: true,
        minPreviewHint: '7.2-preview.1',
      });
      if (err) {
        return sendJson(res, err.status, err.body);
      }
      return sendJson(res, 200, { resultsForGroup: [] });
    }

    // 4p. Work (Team Settings, Team Field Values, Iterations, Iteration Work Items)
    if (restLower[0] === 'work' && restLower[1] === 'teamsettings') {
      // GET .../work/teamsettings/iterations/{iterationId}/workitems
      if (
        method === 'GET' &&
        restLower[2] === 'iterations' &&
        restLower[4] === 'workitems'
      ) {
        const err = validateApiVersion(reqRecord, {
          previewOnly: profile.iterationWorkItemsPreviewOnly,
          minPreviewHint: `${profile.maxApiVersion}-preview.1`,
        });
        if (err) {
          return sendJson(res, err.status, err.body);
        }

        const iterationId = restSegments[3];
        if (!UUID_RE.test(iterationId)) {
          return sendJson(res, 400, {
            message: `Invalid iterationId '${iterationId}'. Expected a valid iteration GUID (identifier), not an integer ID.`,
            typeKey: 'InvalidArgumentException',
          });
        }
        const iterKey = Object.keys(state.iterationWorkItems || {}).find(
          (k) => k.toLowerCase() === iterationId.toLowerCase(),
        );
        const relations = iterKey ? state.iterationWorkItems[iterKey] : null;
        if (!relations) {
          return sendJson(res, 404, {
            message: `Iteration '${iterationId}' not found for team.`,
          });
        }
        return sendJson(res, 200, {
          workItemRelations: relations,
          url: `${collectionUrl}${relPath}`,
          _links: { self: { href: `${collectionUrl}${relPath}` } },
        });
      }

      const err = validateApiVersion(reqRecord);
      if (err) {
        return sendJson(res, err.status, err.body);
      }

      if (method === 'GET' && restSegments.length === 2) {
        return sendJson(res, 200, state.teamSettings);
      }
      if (
        method === 'GET' &&
        restSegments.length === 3 &&
        restLower[2] === 'teamfieldvalues'
      ) {
        return sendJson(res, 200, state.teamFieldValues);
      }
      if (method === 'GET' && restLower[2] === 'iterations') {
        if (restSegments.length === 4) {
          const iter = state.teamIterations.find(
            (i) => i.id.toLowerCase() === restSegments[3].toLowerCase(),
          );
          if (!iter) {
            return sendJson(res, 404, {
              message: `Team iteration '${restSegments[3]}' not found.`,
            });
          }
          return sendJson(res, 200, iter);
        }

        // STRICT: $timeframe ONLY accepts 'current' (passing 'past' or 'future' fails with 400!)
        const timeframe = getQueryParam(sp, '$timeframe');
        if (timeframe !== null && timeframe.trim().length > 0) {
          if (timeframe.trim().toLowerCase() !== 'current') {
            return sendJson(res, 400, {
              message: `Invalid $timeframe '${timeframe}'. Only 'Current' is supported by Azure DevOps REST API.`,
              typeKey: 'InvalidArgumentException',
            });
          }
          const currentOnly = state.teamIterations.filter(
            (i) =>
              String(i.attributes?.timeFrame || '').toLowerCase() === 'current',
          );
          return sendJson(res, 200, {
            count: currentOnly.length,
            value: currentOnly,
          });
        }
        return sendJson(res, 200, {
          count: state.teamIterations.length,
          value: state.teamIterations,
        });
      }
    }

    // 4q. Search API (5.0-preview.1 on 2019, 6.0-preview.1 on 2020, GA 7.0/7.1 on 2022/Services)
    if (method === 'POST' && restLower[0] === 'search') {
      const err = validateApiVersion(reqRecord, {
        previewOnly: profile.searchPreviewOnly,
        minPreviewHint: profile.searchVersion,
      });
      if (err) {
        return sendJson(res, err.status, err.body);
      }

      const searchText = reqRecord.parsedBody?.searchText || '';
      if (restLower[1] === 'codesearchresults') {
        return sendJson(res, 200, {
          count: 1,
          infoCode: 0,
          facets: {},
          results: [
            {
              fileName: 'app.ts',
              path: '/src/app.ts',
              repository: {
                id: state.repositories[0].id,
                name: state.repositories[0].name,
              },
              project: {
                id: state.projects[0].id,
                name: state.projects[0].name,
              },
              versions: [
                {
                  branchName: 'main',
                  changeId: '3333333333333333333333333333333333333333',
                },
              ],
              matches: {
                content: [{ charOffset: 0, length: searchText.length }],
              },
            },
          ],
        });
      }
      if (restLower[1] === 'wikisearchresults') {
        return sendJson(res, 200, {
          count: 1,
          infoCode: 0,
          facets: {},
          results: [
            {
              fileName: 'Home.md',
              path: '/Home',
              wiki: { id: state.wikis[0].id, name: state.wikis[0].name },
              project: {
                id: state.projects[0].id,
                name: state.projects[0].name,
              },
              hits: [{ highlights: [searchText || 'Demo'] }],
            },
          ],
        });
      }
      if (restLower[1] === 'workitemsearchresults') {
        return sendJson(res, 200, {
          count: 1,
          infoCode: 0,
          facets: {},
          results: [
            {
              project: {
                id: state.projects[0].id,
                name: state.projects[0].name,
              },
              fields: {
                'system.id': '101',
                'system.title':
                  state.workItems[101]?.fields['System.Title'] || 'Work Item',
                'system.state':
                  state.workItems[101]?.fields['System.State'] || 'Active',
                'system.workitemtype': 'User Story',
              },
            },
          ],
        });
      }
    }

    // 4r. Wiki API (wikis, pages with ETag/If-Match, pagesbatch profile-gated)
    if (restLower[0] === 'wiki' && restLower[1] === 'wikis') {
      // pagesbatch (404 on 2019, 6.0-preview.1 on 2020, GA on 2022/Services)
      if (method === 'POST' && restLower[3] === 'pagesbatch') {
        const err = validateApiVersion(reqRecord, {
          supported: profile.supportsWikiPagesBatch,
          previewOnly: profile.wikiPagesBatchPreviewOnly,
          minPreviewHint: '6.0-preview.1',
        });
        if (err) {
          return sendJson(res, err.status, err.body);
        }

        const wiki = findWiki(restSegments[2]);
        if (!wiki) {
          return sendJson(res, 404, {
            message: `Wiki '${restSegments[2]}' not found.`,
          });
        }
        const pagesMap = getOwn(state.wikiPages, wiki.id) || {};
        const allPages = Object.values(pagesMap).map(
          ({ id, path: p, order }) => ({
            id,
            path: p,
            order,
          }),
        );
        const rawTop = reqRecord.parsedBody?.top;
        const parsedTop =
          rawTop === undefined ||
          rawTop === null ||
          String(rawTop).trim() === ''
            ? 100
            : Number.parseInt(String(rawTop).trim(), 10);
        const top =
          Number.isInteger(parsedTop) && parsedTop >= 0 ? parsedTop : 100;
        const rawOffset = reqRecord.parsedBody?.continuationToken;
        const parsedOffset =
          rawOffset !== undefined && rawOffset !== null
            ? Number.parseInt(String(rawOffset).trim(), 10)
            : 0;
        const offset =
          Number.isInteger(parsedOffset) && parsedOffset >= 0
            ? parsedOffset
            : 0;
        const slice = allPages.slice(offset, offset + top);
        const extraHeaders = {};
        if (top > 0 && offset + top < allPages.length) {
          extraHeaders['x-ms-continuationtoken'] = String(offset + top);
        }
        return sendJson(res, 200, { value: slice }, extraHeaders);
      }

      const err = validateApiVersion(reqRecord);
      if (err) {
        return sendJson(res, err.status, err.body);
      }

      if (restSegments.length === 2) {
        if (method === 'GET') {
          return sendJson(res, 200, {
            count: state.wikis.length,
            value: state.wikis,
          });
        }
        if (method === 'POST') {
          const newId = crypto.randomUUID();
          const created = {
            id: newId,
            name: reqRecord.parsedBody?.name || 'NewWiki',
            type: reqRecord.parsedBody?.type || 'projectWiki',
            projectId: reqRecord.parsedBody?.projectId || state.projects[0].id,
          };
          state.wikis.push(created);
          state.wikiPages[newId] = {};
          return sendJson(res, 201, created);
        }
      }

      const wiki = findWiki(restSegments[2]);
      if (!wiki) {
        return sendJson(res, 404, {
          message: `Wiki '${restSegments[2]}' not found.`,
        });
      }

      if (method === 'GET' && restSegments.length === 3) {
        return sendJson(res, 200, wiki);
      }

      if (restLower[3] === 'pages') {
        const pagePathRaw = getQueryParam(sp, 'path') || '/Home';
        const pagePath = pagePathRaw.startsWith('/')
          ? pagePathRaw
          : `/${pagePathRaw}`;
        const pagesMap = (state.wikiPages[wiki.id] =
          getOwn(state.wikiPages, wiki.id) || {});

        if (method === 'GET') {
          const page = getOwn(pagesMap, pagePath);
          if (!page) {
            return sendJson(res, 404, {
              message: `Wiki page '${pagePath}' not found.`,
            });
          }
          const accept = String(req.headers.accept || '').toLowerCase();
          const headers = { ETag: `"${page.etag}"` };
          if (accept.includes('text/plain')) {
            return sendText(
              res,
              200,
              page.content,
              'text/plain; charset=utf-8',
              headers,
            );
          }
          return sendJson(res, 200, page, headers);
        }

        if (method === 'PUT') {
          const existing = getOwn(pagesMap, pagePath);
          const ifMatch = req.headers['if-match'];
          if (existing && ifMatch) {
            const cleaned = String(ifMatch)
              .replace(/^W\//, '')
              .replace(/"/g, '')
              .trim();
            if (cleaned !== '*' && cleaned !== existing.etag) {
              return sendJson(res, 412, {
                message: `ETag mismatch for page '${pagePath}'. Expected '${existing.etag}', got '${cleaned}'.`,
              });
            }
          }
          const newEtag = `v${etagSeq++}`;
          const content =
            reqRecord.parsedBody &&
            typeof reqRecord.parsedBody.content === 'string'
              ? reqRecord.parsedBody.content
              : '';
          const status = existing ? 200 : 201;
          const saved = {
            id: existing ? existing.id : Object.keys(pagesMap).length + 1,
            path: pagePath,
            order: existing ? existing.order : Object.keys(pagesMap).length,
            etag: newEtag,
            content,
          };
          pagesMap[pagePath] = saved;
          return sendJson(
            res,
            status,
            { path: saved.path, content: saved.content },
            { ETag: `"${newEtag}"` },
          );
        }
      }
    }

    return sendJson(res, 404, {
      message: `Mock ADO route not found: ${method} ${relPath}`,
    });
  }

  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        await handleRequest(req, res);
      } catch (err) {
        if (!res.headersSent) {
          sendJson(res, 500, {
            message: `Mock ADO server internal error: ${err instanceof Error ? err.message : String(err)}`,
          });
        } else {
          res.end();
        }
      }
    })();
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error(
      'Failed to bind Mock ADO Server to ephemeral loopback port',
    );
  }
  const port = addr.port;
  baseUrl = `http://127.0.0.1:${port}`;
  collectionUrl = `${baseUrl}${normalizedCollectionPath}`;
  initStateInPlace();

  let closed = false;

  return {
    url: collectionUrl,
    baseUrl,
    collectionUrl,
    port,
    profile,
    state,
    requests,
    clearRequests() {
      requests.length = 0;
    },
    resetState() {
      injectedErrors.length = 0;
      injectedNextLink = null;
      initStateInPlace();
    },
    mutateState(fn) {
      return fn(state);
    },
    setNextError(matcher, response) {
      injectedErrors.push({
        matcher,
        response: { once: true, ...(response || {}) },
      });
    },
    injectNextLink(nextUrl) {
      injectedNextLink = nextUrl ?? null;
    },
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      const closePromise = new Promise((resolve) => {
        server.close(() => resolve());
      });
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await closePromise;
    },
  };
}
