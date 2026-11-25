import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { VsoClient } from 'azure-devops-node-api/VsoClient.js';
import type { ApiResourceLocation } from 'azure-devops-node-api/interfaces/common/VsoBaseInterfaces.js';
import type * as restm from 'typed-rest-client/RestClient.js';
import {
  buildODataBaseUrl,
  validateAnalyticsQuery,
  validateEntitySet,
  validateSameOriginNextLink,
} from '../../src/features/analytics/odata-guardrails.ts';
import {
  ALLOWED_ENTITY_SETS,
  ODATA_VERSIONS,
  SNAPSHOT_ENTITY_SETS,
} from '../../src/features/analytics/types.ts';
import type { ODataVersion } from '../../src/features/analytics/types.ts';
import {
  isAzureDevOpsServicesUrl,
  resolveAzureDevOpsBaseUrls,
} from '../../src/shared/azure-devops-url.ts';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../src/shared/errors/index.ts';
import {
  createHttpClient,
  mapHttpErrorToAzureDevOpsError,
} from '../../src/shared/http/http-client.ts';

interface ResourceLocationFixture {
  readonly id: string;
  readonly area: string;
  readonly resourceName: string;
  readonly routeTemplate: string;
  readonly resourceVersion: number;
  readonly minVersion: string;
  readonly maxVersion: string;
  readonly releasedVersion: string;
}

interface ServerProfileFixture {
  readonly schemaVersion: string;
  readonly name: string;
  readonly mockProfileId: string;
  readonly label: string;
  readonly deploymentType: 'server' | 'services';
  readonly connectionDeploymentType: 'onPremises' | 'hosted';
  readonly apiVersions: {
    readonly maxGa: string;
    readonly maxPreview: string;
    readonly maxMajorMinor: readonly [number, number];
    readonly maxPreviewMajorMinor: readonly [number, number];
  };
  readonly hosts: {
    readonly multiHost: boolean;
    readonly exampleOrgUrls: readonly string[];
    readonly coreHost: string | null;
    readonly searchHost: string | null;
    readonly identityHost: string | null;
    readonly analyticsHost: string | null;
    readonly resourceAreasResponseMode: 'empty-onprem' | 'populated-services';
  };
  readonly capabilities: {
    readonly supportsPipelinesApi: boolean;
    readonly supportsTestPlanApi: boolean;
    readonly supportsTestResultsApi: boolean;
    readonly supportsWitCommentsCrud: boolean;
    readonly supportsWitCommentMarkdown: boolean;
    readonly supportsBuildStages: boolean;
    readonly supportsWikiPagesBatch: boolean;
    readonly supportsExpandIdentity: boolean;
    readonly supportsRefsTopContinuation: boolean;
    readonly supportsCloudProfileApis: boolean;
  };
  readonly missingEndpoints: readonly string[];
  readonly directHttpVersions: Readonly<Record<string, string | null>>;
  readonly queryParamConstraints: {
    readonly 'core/teams': { readonly disallowedOnProfile: readonly string[] };
    readonly 'git/refs': { readonly disallowedOnProfile: readonly string[] };
    readonly 'wit/comments': {
      readonly allowedFormats: readonly string[];
      readonly readOnlyLegacyLocation: boolean;
    };
    readonly 'work/iterations': {
      readonly allowedTimeframes: readonly string[];
    };
  };
  readonly analyticsOData: {
    readonly enabledByDefault: boolean;
    readonly requiresAnalyticsExtension: boolean;
    readonly supportedVersions: readonly ODataVersion[];
    readonly unsupportedVersions: readonly ODataVersion[];
    readonly defaultRecommendedVersion: ODataVersion;
    readonly urlPattern: string;
    readonly blockedRulesCount: number;
    readonly entitySetsByVersion: Readonly<Record<string, readonly string[]>>;
  };
  readonly resourceLocations: Readonly<
    Record<string, readonly ResourceLocationFixture[]>
  >;
}

const PROFILES_DIR = path.resolve(
  process.cwd(),
  'tests/fixtures/ado-server-profiles',
);

const EXPECTED_PROFILE_FILES = [
  'server-2019-rtm.json',
  'server-2020.json',
  'server-2022.json',
  'services-cloud.json',
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const API_VERSION_RE = /^(\d+)\.(\d+)(?:-preview(?:\.(\d+))?)?$/;

function loadProfileFixture(fileName: string): ServerProfileFixture {
  const fullPath = path.join(PROFILES_DIR, fileName);
  const raw = fs.readFileSync(fullPath, 'utf8');
  return JSON.parse(raw) as ServerProfileFixture;
}

function loadAllProfiles(): readonly ServerProfileFixture[] {
  return EXPECTED_PROFILE_FILES.map((fileName) => loadProfileFixture(fileName));
}

function parseApiVersion(version: string): {
  major: number;
  minor: number;
  isPreview: boolean;
  previewRevision?: number;
} {
  const match = API_VERSION_RE.exec(version);
  if (!match) {
    throw new Error(`Invalid api-version syntax: "${version}"`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    isPreview: version.includes('-preview'),
    previewRevision: match[3] ? Number(match[3]) : undefined,
  };
}

function compareMajorMinor(
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  if (a[0] !== b[0]) {
    return a[0] - b[0];
  }
  return a[1] - b[1];
}

function findLocation(
  profile: ServerProfileFixture,
  area: string,
  locationId: string,
): ResourceLocationFixture | undefined {
  const entries = profile.resourceLocations[area];
  if (!entries) {
    return undefined;
  }
  const target = locationId.toLowerCase();
  return entries.find((loc) => loc.id.toLowerCase() === target);
}

/**
 * Exposes VsoClient's protected `autoNegotiateApiVersion` for zero-network
 * verification against the checked-in OPTIONS /_apis/{area} catalogs.
 */
class NegotiatingVsoClient extends VsoClient {
  constructor() {
    super(
      'https://ado.example.invalid/DefaultCollection',
      {} as restm.RestClient,
    );
  }

  negotiate(
    location: ResourceLocationFixture,
    requestedVersion: string,
  ): string {
    const sdkLocation: ApiResourceLocation = {
      id: location.id,
      area: location.area,
      resourceName: location.resourceName,
      routeTemplate: location.routeTemplate,
      resourceVersion: location.resourceVersion,
      minVersion: location.minVersion,
      maxVersion: location.maxVersion,
      releasedVersion: location.releasedVersion,
    };
    return this.autoNegotiateApiVersion(sdkLocation, requestedVersion);
  }
}

/**
 * Pure in-process contract evaluator enforcing Azure DevOps REST `api-version`
 * range and preview-suffix rules against a declarative server profile.
 */
function evaluateDirectHttpRequest(
  profile: ServerProfileFixture,
  area: string,
  locationId: string,
  requestedApiVersion: string,
): { status: number; typeKey?: string; message?: string } {
  const loc = findLocation(profile, area, locationId);
  if (!loc) {
    return {
      status: 404,
      typeKey: 'ResourceNotFound',
      message: `API location ${area}/${locationId} does not exist on ${profile.label}`,
    };
  }

  const req = parseApiVersion(requestedApiVersion);
  const max = parseApiVersion(loc.maxVersion);
  const min = parseApiVersion(loc.minVersion);

  if (
    compareMajorMinor([req.major, req.minor], [max.major, max.minor]) > 0 ||
    compareMajorMinor([req.major, req.minor], [min.major, min.minor]) < 0
  ) {
    return {
      status: 400,
      typeKey: 'VssVersionOutOfRangeException',
      message: `The requested REST API version of ${requestedApiVersion} is out of range for ${profile.label} (max ${loc.maxVersion}).`,
    };
  }

  const isPreviewOnly = loc.releasedVersion === '0.0';
  if (isPreviewOnly && !req.isPreview) {
    return {
      status: 400,
      typeKey: 'VssInvalidPreviewVersionException',
      message: `Endpoint ${area}/${loc.resourceName} is preview-only on ${profile.label}; requested ${requestedApiVersion} requires -preview.${loc.resourceVersion}.`,
    };
  }

  if (
    req.previewRevision !== undefined &&
    req.previewRevision > loc.resourceVersion
  ) {
    return {
      status: 400,
      typeKey: 'VssVersionOutOfRangeException',
      message: `Requested preview revision ${req.previewRevision} exceeds resourceVersion ${loc.resourceVersion} on ${profile.label}.`,
    };
  }

  return { status: 200 };
}

const ALL_PROFILES = loadAllProfiles();
const VSO_CLIENT = new NegotiatingVsoClient();

void describe('On-Prem & Services Compatibility Matrix — Profile Fixture Invariants', () => {
  void it('loads all 4 checked-in JSON server profiles from tests/fixtures/ado-server-profiles/', () => {
    const files = fs
      .readdirSync(PROFILES_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort();

    assert.deepEqual(files, [...EXPECTED_PROFILE_FILES].sort());
    assert.equal(ALL_PROFILES.length, 4);
  });

  void it('maintains strictly increasing max GA API versions across 2019 -> 2020 -> 2022 -> Services', () => {
    const [p2019, p2020, p2022, pServices] = ALL_PROFILES;

    assert.equal(p2019.apiVersions.maxGa, '5.0');
    assert.equal(p2020.apiVersions.maxGa, '6.0');
    assert.equal(p2022.apiVersions.maxGa, '7.0');
    assert.equal(pServices.apiVersions.maxGa, '7.1');
    assert.equal(pServices.apiVersions.maxPreview, '7.2-preview');

    for (let i = 1; i < ALL_PROFILES.length; i += 1) {
      const prev = ALL_PROFILES[i - 1];
      const curr = ALL_PROFILES[i];
      assert.ok(
        compareMajorMinor(
          prev.apiVersions.maxMajorMinor,
          curr.apiVersions.maxMajorMinor,
        ) < 0,
        `Expected ${prev.name} < ${curr.name}`,
      );
    }
  });

  for (const profile of ALL_PROFILES) {
    void describe(`Profile invariants: ${profile.name} (${profile.label})`, () => {
      void it('has valid OPTIONS /_apis/{area} ApiResourceLocation catalog invariants', () => {
        const areaNames = Object.keys(profile.resourceLocations);
        assert.ok(
          areaNames.length >= 12,
          `Expected >= 12 resource areas in ${profile.name}`,
        );

        const seenIds = new Set<string>();
        for (const areaName of areaNames) {
          const entries = profile.resourceLocations[areaName];
          assert.ok(
            entries.length > 0,
            `Area "${areaName}" in ${profile.name} must be non-empty`,
          );
          for (const loc of entries) {
            assert.match(
              loc.id,
              UUID_RE,
              `Location id "${loc.id}" in ${profile.name}/${areaName} must be a lowercase UUID`,
            );
            assert.equal(
              seenIds.has(loc.id),
              false,
              `Duplicate location id "${loc.id}" in ${profile.name}`,
            );
            seenIds.add(loc.id);

            assert.equal(
              loc.area,
              areaName,
              `Location area "${loc.area}" must match enclosing key "${areaName}"`,
            );
            assert.ok(
              Number.isInteger(loc.resourceVersion) && loc.resourceVersion >= 1,
              `resourceVersion must be positive integer on ${loc.id}`,
            );

            const min = parseApiVersion(loc.minVersion);
            const max = parseApiVersion(loc.maxVersion);
            assert.ok(
              compareMajorMinor(
                [min.major, min.minor],
                [max.major, max.minor],
              ) <= 0,
              `minVersion (${loc.minVersion}) must be <= maxVersion (${loc.maxVersion})`,
            );

            // VsoClient checks exact string equality `location.maxVersion === location.releasedVersion` for GA.
            assert.ok(
              loc.releasedVersion === '0.0' ||
                loc.releasedVersion === loc.maxVersion,
              `releasedVersion ("${loc.releasedVersion}") must be "0.0" (preview-only) or equal to maxVersion ("${loc.maxVersion}")`,
            );
          }
        }
      });

      void it('aligns capabilities with presence/absence of conditional resource areas & locations', () => {
        assert.equal(
          Boolean(profile.resourceLocations.pipelines),
          profile.capabilities.supportsPipelinesApi,
        );
        assert.equal(
          Boolean(profile.resourceLocations.testplan),
          profile.capabilities.supportsTestPlanApi,
        );
        assert.equal(
          Boolean(profile.resourceLocations.testresults),
          profile.capabilities.supportsTestResultsApi,
        );

        const crudCommentsLoc = findLocation(
          profile,
          'wit',
          '608aac0a-32e1-4493-a863-b9cf4566d257',
        );
        const legacyCommentsLoc = findLocation(
          profile,
          'wit',
          '19335ae7-22f7-4308-93d8-261f9384b7cf',
        );
        assert.equal(
          Boolean(crudCommentsLoc),
          profile.capabilities.supportsWitCommentsCrud,
        );
        assert.equal(
          Boolean(legacyCommentsLoc),
          !profile.capabilities.supportsWitCommentsCrud,
        );

        const buildStagesLoc = findLocation(
          profile,
          'build',
          'b8aac6c9-744b-46e1-88fc-3550969f9313',
        );
        assert.equal(
          Boolean(buildStagesLoc),
          profile.capabilities.supportsBuildStages,
        );

        const wikiBatchLoc = findLocation(
          profile,
          'wiki',
          '32e4214e-09a0-4673-a10d-619091005a33',
        );
        assert.equal(
          Boolean(wikiBatchLoc),
          profile.capabilities.supportsWikiPagesBatch,
        );
      });

      void it('enforces query parameter constraints per Server/Services version', () => {
        if (profile.name === 'server-2019-rtm') {
          assert.ok(
            profile.queryParamConstraints[
              'core/teams'
            ].disallowedOnProfile.includes('$expandIdentity'),
          );
          assert.deepEqual(
            profile.queryParamConstraints['git/refs'].disallowedOnProfile,
            ['$top', 'continuationToken'],
          );
          assert.equal(
            profile.queryParamConstraints['wit/comments']
              .readOnlyLegacyLocation,
            true,
          );
        } else {
          assert.deepEqual(
            profile.queryParamConstraints['core/teams'].disallowedOnProfile,
            [],
          );
          assert.deepEqual(
            profile.queryParamConstraints['git/refs'].disallowedOnProfile,
            [],
          );
          assert.equal(
            profile.queryParamConstraints['wit/comments']
              .readOnlyLegacyLocation,
            false,
          );
        }

        assert.equal(
          profile.queryParamConstraints['wit/comments'].allowedFormats.includes(
            'markdown',
          ),
          profile.capabilities.supportsWitCommentMarkdown,
        );
        assert.deepEqual(
          profile.queryParamConstraints['work/iterations'].allowedTimeframes,
          ['current'],
        );
      });
    });
  }
});

void describe('On-Prem & Services Compatibility Matrix — URL Routing (Zero Host Leakage)', () => {
  const urlCases = [
    {
      label: 'Services modern dev.azure.com',
      orgUrl: 'https://dev.azure.com/contoso',
      expectedType: 'services' as const,
      expectedCore: 'https://dev.azure.com/contoso',
      expectedSearch: 'https://almsearch.dev.azure.com/contoso',
      expectedIdentity: 'https://vssps.dev.azure.com/contoso',
      expectedAnalytics: 'https://analytics.dev.azure.com/contoso',
    },
    {
      label: 'Services legacy *.visualstudio.com',
      orgUrl: 'https://contoso.visualstudio.com',
      expectedType: 'services' as const,
      expectedCore: 'https://dev.azure.com/contoso',
      expectedSearch: 'https://almsearch.dev.azure.com/contoso',
      expectedIdentity: 'https://vssps.dev.azure.com/contoso',
      expectedAnalytics: 'https://analytics.dev.azure.com/contoso',
    },
    {
      label: 'On-Prem Server with /tfs virtual directory',
      orgUrl: 'https://ado.corp:8080/tfs/DefaultCollection',
      expectedType: 'server' as const,
      expectedCore: 'https://ado.corp:8080/tfs/DefaultCollection',
      expectedSearch: 'https://ado.corp:8080/tfs/DefaultCollection',
      expectedIdentity: 'https://ado.corp:8080/tfs/DefaultCollection',
      expectedAnalytics: 'https://ado.corp:8080/tfs/DefaultCollection',
    },
    {
      label: 'On-Prem Server without /tfs virtual directory',
      orgUrl: 'https://ado.corp/DefaultCollection',
      expectedType: 'server' as const,
      expectedCore: 'https://ado.corp/DefaultCollection',
      expectedSearch: 'https://ado.corp/DefaultCollection',
      expectedIdentity: 'https://ado.corp/DefaultCollection',
      expectedAnalytics: 'https://ado.corp/DefaultCollection',
    },
  ];

  for (const tc of urlCases) {
    void it(`resolves all 4 service base URLs cleanly for ${tc.label}`, () => {
      const resolved = resolveAzureDevOpsBaseUrls(tc.orgUrl);
      assert.equal(resolved.type, tc.expectedType);
      assert.equal(
        isAzureDevOpsServicesUrl(tc.orgUrl),
        tc.expectedType === 'services',
      );
      assert.equal(resolved.coreBaseUrl, tc.expectedCore);
      assert.equal(resolved.searchBaseUrl, tc.expectedSearch);
      assert.equal(resolved.identityBaseUrl, tc.expectedIdentity);
      assert.equal(resolved.analyticsBaseUrl, tc.expectedAnalytics);

      if (tc.expectedType === 'server') {
        for (const baseUrl of [
          resolved.coreBaseUrl,
          resolved.searchBaseUrl,
          resolved.identityBaseUrl,
          resolved.analyticsBaseUrl,
        ]) {
          const hostname = new URL(baseUrl).hostname.toLowerCase();
          assert.equal(
            hostname === 'dev.azure.com' || hostname.endsWith('.dev.azure.com'),
            false,
            `On-prem URL must never leak Cloud dev.azure.com host: ${baseUrl}`,
          );
          assert.equal(
            hostname.startsWith('almsearch.'),
            false,
            `On-prem URL must never leak almsearch host: ${baseUrl}`,
          );
          assert.equal(
            hostname === 'analytics.dev.azure.com',
            false,
            `On-prem URL must never leak analytics.dev.azure.com host: ${baseUrl}`,
          );
        }
      }
    });
  }

  for (const profile of ALL_PROFILES) {
    void it(`routes all exampleOrgUrls declared in ${profile.name} without host leakage`, () => {
      for (const exampleUrl of profile.hosts.exampleOrgUrls) {
        const resolved = resolveAzureDevOpsBaseUrls(exampleUrl);
        assert.equal(resolved.type, profile.deploymentType);
        if (profile.hosts.multiHost) {
          assert.equal(
            new URL(resolved.coreBaseUrl).hostname,
            profile.hosts.coreHost,
          );
          assert.equal(
            new URL(resolved.searchBaseUrl).hostname,
            profile.hosts.searchHost,
          );
          assert.equal(
            new URL(resolved.identityBaseUrl).hostname,
            profile.hosts.identityHost,
          );
          assert.equal(
            new URL(resolved.analyticsBaseUrl).hostname,
            profile.hosts.analyticsHost,
          );
        } else {
          assert.equal(resolved.searchBaseUrl, resolved.coreBaseUrl);
          assert.equal(resolved.identityBaseUrl, resolved.coreBaseUrl);
          assert.equal(resolved.analyticsBaseUrl, resolved.coreBaseUrl);
          if (!exampleUrl.includes('/tfs/')) {
            assert.equal(
              resolved.coreBaseUrl.includes('/tfs/'),
              false,
              `Non-/tfs collection URL must not gain /tfs/: ${resolved.coreBaseUrl}`,
            );
          }
        }
      }
    });
  }
});

void describe('On-Prem & Services Compatibility Matrix — VsoClient & Direct-HTTP api-version Negotiation', () => {
  const highRiskEndpoints = [
    {
      key: 'search/codesearchresults',
      area: 'search',
      locationId: 'e7f29993-5b82-4fca-9386-f5cfe683d524',
      sdkRequested: '7.1',
    },
    {
      key: 'pipelines/pipelines',
      area: 'pipelines',
      locationId: '28e1305e-2afe-47bf-abaf-cbb0e6a91988',
      sdkRequested: '7.1',
    },
    {
      key: 'pipelines/runs',
      area: 'pipelines',
      locationId: '7859261e-d2e9-4a68-b820-a5d84cc5bb3d',
      sdkRequested: '7.1',
    },
    {
      key: 'build/timeline',
      area: 'build',
      locationId: '8baac422-4c6e-4de5-8532-db96d92acffa',
      sdkRequested: '7.1',
    },
    {
      key: 'build/logs',
      area: 'build',
      locationId: '35a80daf-7f30-45fc-86e8-6b813d9c90df',
      sdkRequested: '7.1',
    },
    {
      key: 'build/stages',
      area: 'build',
      locationId: 'b8aac6c9-744b-46e1-88fc-3550969f9313',
      sdkRequested: '7.1',
    },
    {
      key: 'wiki/wikis',
      area: 'wiki',
      locationId: '288d122c-dbd4-451d-aa5f-7dbbba070728',
      sdkRequested: '7.1',
    },
    {
      key: 'wiki/pages',
      area: 'wiki',
      locationId: '25d3fbc7-fe3d-46cb-b5a5-0b6f79caf27b',
      sdkRequested: '7.1',
    },
    {
      key: 'wiki/pagesbatch',
      area: 'wiki',
      locationId: '32e4214e-09a0-4673-a10d-619091005a33',
      sdkRequested: '7.1',
    },
    {
      key: 'testplan/plans',
      area: 'testplan',
      locationId: '0e292477-a0c2-47f3-a9b6-34f153d627f4',
      sdkRequested: '7.2-preview.1',
    },
    {
      key: 'core/teams',
      area: 'core',
      locationId: '7a4d9ee9-3433-4347-b47a-7a80f1cf307e',
      sdkRequested: '7.1-preview.3',
    },
    {
      key: 'work/iterations/workitems',
      area: 'work',
      locationId: '5b3ef1a6-d3ab-44cd-bafd-c7f45db850fa',
      sdkRequested: '7.1',
    },
    {
      key: 'git/refs',
      area: 'git',
      locationId: '2d874a60-a811-4f62-9c9f-963a6ea0a55b',
      sdkRequested: '7.1',
    },
  ] as const;

  for (const profile of ALL_PROFILES) {
    void describe(`Negotiation & direct-HTTP contract: ${profile.name}`, () => {
      void it('VsoClient.autoNegotiateApiVersion downgrades to the exact profile-supported version for every catalog endpoint', () => {
        for (const ep of highRiskEndpoints) {
          const expected = profile.directHttpVersions[ep.key];
          const loc = findLocation(profile, ep.area, ep.locationId);

          if (expected === null) {
            assert.equal(
              loc,
              undefined,
              `Expected ${ep.key} to be absent on ${profile.name}`,
            );
            continue;
          }

          assert.ok(
            loc,
            `Expected ${ep.key} location (${ep.locationId}) to exist on ${profile.name}`,
          );
          const negotiated = VSO_CLIENT.negotiate(loc, ep.sdkRequested);
          assert.equal(
            negotiated,
            expected,
            `${profile.name} ${ep.key}: VsoClient negotiated "${negotiated}", expected "${expected}"`,
          );

          const directOutcome = evaluateDirectHttpRequest(
            profile,
            ep.area,
            ep.locationId,
            negotiated,
          );
          assert.equal(
            directOutcome.status,
            200,
            `Negotiated version "${negotiated}" must be accepted by ${profile.name} on ${ep.key}: ${directOutcome.message ?? ''}`,
          );
        }
      });

      void it('negotiates WIT comments location across legacy 2019 read-only vs 2020/2022/Services CRUD', () => {
        const expected = profile.directHttpVersions['wit/comments'];
        assert.ok(expected);
        const commentsLoc = profile.capabilities.supportsWitCommentsCrud
          ? findLocation(profile, 'wit', '608aac0a-32e1-4493-a863-b9cf4566d257')
          : findLocation(
              profile,
              'wit',
              '19335ae7-22f7-4308-93d8-261f9384b7cf',
            );
        assert.ok(commentsLoc);
        const negotiated = VSO_CLIENT.negotiate(commentsLoc, '7.1-preview.4');
        assert.equal(negotiated, expected);
      });

      void it('rejects out-of-range api-versions and missing -preview suffixes with authentic 400/404 contracts', () => {
        // Out-of-range check for all on-prem servers when Cloud default 7.1 is sent blindly
        if (profile.deploymentType === 'server') {
          const overMaxOutcome = evaluateDirectHttpRequest(
            profile,
            'build',
            '8baac422-4c6e-4de5-8532-db96d92acffa',
            '7.1',
          );
          assert.equal(overMaxOutcome.status, 400);
          assert.equal(overMaxOutcome.typeKey, 'VssVersionOutOfRangeException');
        }

        // Preview-only bare GA rejection check on Server 2019 (5.0) & Server 2020 (6.0)
        if (
          profile.name === 'server-2019-rtm' ||
          profile.name === 'server-2020'
        ) {
          const bareSearchOutcome = evaluateDirectHttpRequest(
            profile,
            'search',
            'e7f29993-5b82-4fca-9386-f5cfe683d524',
            profile.apiVersions.maxGa,
          );
          assert.equal(bareSearchOutcome.status, 400);
          assert.equal(
            bareSearchOutcome.typeKey,
            'VssInvalidPreviewVersionException',
          );
        }

        // Server 2020 pipelines & wiki/pagesbatch reject bare 6.0 without -preview.1
        if (profile.name === 'server-2020') {
          for (const [area, locId] of [
            ['pipelines', '28e1305e-2afe-47bf-abaf-cbb0e6a91988'],
            ['wiki', '32e4214e-09a0-4673-a10d-619091005a33'],
            ['build', 'b8aac6c9-744b-46e1-88fc-3550969f9313'],
          ] as const) {
            const outcome = evaluateDirectHttpRequest(
              profile,
              area,
              locId,
              '6.0',
            );
            assert.equal(outcome.status, 400);
            assert.equal(outcome.typeKey, 'VssInvalidPreviewVersionException');
          }
        }

        // Server 2019 missing endpoints return 404
        if (profile.name === 'server-2019-rtm') {
          for (const [area, locId] of [
            ['pipelines', '28e1305e-2afe-47bf-abaf-cbb0e6a91988'],
            ['testplan', '0e292477-a0c2-47f3-a9b6-34f153d627f4'],
            ['wiki', '32e4214e-09a0-4673-a10d-619091005a33'],
            ['build', 'b8aac6c9-744b-46e1-88fc-3550969f9313'],
          ] as const) {
            const outcome = evaluateDirectHttpRequest(
              profile,
              area,
              locId,
              '5.0',
            );
            assert.equal(outcome.status, 404);
          }
        }
      });

      void it('maps direct-HTTP 400/404/203 wire errors via createHttpClient + mapHttpErrorToAzureDevOpsError (zero network)', async () => {
        const scenarios = [
          {
            status: 400,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              typeKey: 'VssVersionOutOfRangeException',
              message: `The requested REST API version of 7.9 is out of range for ${profile.label}.`,
            }),
            expectedError: AzureDevOpsValidationError,
          },
          {
            status: 404,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ message: 'Endpoint not found' }),
            expectedError: AzureDevOpsResourceNotFoundError,
          },
          {
            status: 203,
            headers: { 'content-type': 'text/html; charset=utf-8' },
            body: '<html><title>Sign In</title></html>',
            expectedError: AzureDevOpsAuthenticationError,
          },
        ] as const;

        for (const sc of scenarios) {
          const http = createHttpClient({
            fetchFn: async () =>
              new Response(sc.body, {
                status: sc.status,
                headers: sc.headers,
              }),
          });

          await assert.rejects(async () => {
            try {
              await http.get(
                `${profile.hosts.exampleOrgUrls[0]}/DemoProject/_apis/build/builds`,
                { query: { 'api-version': profile.apiVersions.maxGa } },
              );
            } catch (err) {
              throw mapHttpErrorToAzureDevOpsError(
                err,
                `calling ${profile.name}`,
              );
            }
          }, sc.expectedError);
        }
      });
    });
  }
});

void describe('On-Prem & Services Compatibility Matrix — Analytics OData (v1.0 -> v4.0-preview)', () => {
  const allowedSet = new Set<string>(ALLOWED_ENTITY_SETS);

  for (const profile of ALL_PROFILES) {
    void describe(`Analytics OData compatibility: ${profile.name}`, () => {
      void it('declares accurate OData version support and monotonic entity-set progression', () => {
        const odata = profile.analyticsOData;
        assert.equal(odata.defaultRecommendedVersion, 'v3.0-preview');
        assert.equal(odata.blockedRulesCount, 7);

        // v1.0, v2.0, v3.0-preview exist on all 4 profiles (Server 2019 requires Analytics extension)
        for (const ver of ['v1.0', 'v2.0', 'v3.0-preview'] as const) {
          assert.ok(
            odata.supportedVersions.includes(ver),
            `${profile.name} should list ${ver} in supportedVersions`,
          );
        }

        // v4.0-preview is Server 2022+ and Services only
        const expectsV4 =
          profile.name === 'server-2022' || profile.name === 'services-cloud';
        assert.equal(
          odata.supportedVersions.includes('v4.0-preview'),
          expectsV4,
        );
        assert.equal(
          odata.unsupportedVersions.includes('v4.0-preview'),
          !expectsV4,
        );

        // Server 2019 RTM does not enable Analytics by default (requires Analytics extension)
        assert.equal(
          odata.enabledByDefault,
          profile.name !== 'server-2019-rtm',
        );

        // Monotonic entity-set inclusion: v1.0 ⊂ v2.0 ⊂ v3.0-preview (⊂ v4.0-preview)
        const v1 = new Set(odata.entitySetsByVersion['v1.0']);
        const v2 = new Set(odata.entitySetsByVersion['v2.0']);
        const v3 = new Set(odata.entitySetsByVersion['v3.0-preview']);

        assert.equal(v1.has('Processes'), false);
        assert.equal(v2.has('Processes'), true);
        assert.equal(v2.has('PipelineRuns'), false);
        assert.equal(v3.has('PipelineRuns'), true);
        assert.equal(v3.has('TestResultsDaily'), true);

        for (const es of v1) {
          assert.ok(v2.has(es), `v2.0 missing v1.0 entity set ${es}`);
          assert.ok(allowedSet.has(es), `Unknown entity set ${es}`);
        }
        for (const es of v2) {
          assert.ok(v3.has(es), `v3.0-preview missing v2.0 entity set ${es}`);
          assert.ok(allowedSet.has(es), `Unknown entity set ${es}`);
        }

        if (expectsV4) {
          const v4 = new Set(odata.entitySetsByVersion['v4.0-preview']);
          assert.ok(v4.has('ParallelPipelineJobsSnapshot'));
          assert.ok(v4.has('TaskAgentPoolSizeSnapshots'));
          assert.ok(v4.has('TaskAgentRequestSnapshots'));
          for (const es of v3) {
            assert.ok(
              v4.has(es),
              `v4.0-preview missing v3.0-preview entity set ${es}`,
            );
            assert.ok(allowedSet.has(es), `Unknown entity set ${es}`);
          }
        }
      });

      void it('builds project-scoped and org/collection-scoped OData URLs cleanly for all profile org URLs', () => {
        for (const orgUrl of profile.hosts.exampleOrgUrls) {
          const urls = resolveAzureDevOpsBaseUrls(orgUrl);
          for (const ver of profile.analyticsOData.supportedVersions) {
            assert.ok(ODATA_VERSIONS.includes(ver));

            const projectUrl = buildODataBaseUrl({
              analyticsBaseUrl: urls.analyticsBaseUrl,
              scope: 'project',
              projectId: 'DemoProject',
              version: ver,
            });
            const orgScopedUrl = buildODataBaseUrl({
              analyticsBaseUrl: urls.analyticsBaseUrl,
              scope: 'organization',
              version: ver,
            });

            assert.equal(
              projectUrl,
              `${urls.analyticsBaseUrl}/DemoProject/_odata/${ver}`,
            );
            assert.equal(
              orgScopedUrl,
              `${urls.analyticsBaseUrl}/_odata/${ver}`,
            );

            // Same-origin nextLink passes; cross-origin nextLink is blocked (SSRF safeguard)
            assert.equal(
              validateSameOriginNextLink(
                `${projectUrl}/WorkItems?$skiptoken=abc`,
                urls.analyticsBaseUrl,
              ),
              `${projectUrl}/WorkItems?$skiptoken=abc`,
            );
            assert.throws(
              () =>
                validateSameOriginNextLink(
                  'https://evil.example.invalid/steal',
                  urls.analyticsBaseUrl,
                ),
              AzureDevOpsValidationError,
            );
          }
        }
      });

      void it('enforces OData [BLOCKED] rules consistently across every profile', () => {
        // Rule 1: Snapshot entity sets require $apply with aggregate(...)
        for (const snapshot of SNAPSHOT_ENTITY_SETS) {
          assert.throws(
            () =>
              validateAnalyticsQuery({
                entitySet: snapshot,
                select: ['DateSK'],
              }),
            AzureDevOpsValidationError,
            `Expected ${snapshot} without $apply to fail`,
          );
          const validSnapshot = validateAnalyticsQuery({
            entitySet: snapshot,
            apply: 'groupby((DateSK), aggregate($count as Count))',
          });
          assert.equal(validSnapshot.entitySet, snapshot);
        }

        // Rule 2: Entity key / property path addressing blocked (VS403483)
        assert.throws(
          () => validateEntitySet('WorkItems(123)'),
          AzureDevOpsValidationError,
        );
        assert.throws(
          () => validateEntitySet('WorkItems(123)/AssignedTo'),
          AzureDevOpsValidationError,
        );

        // Rule 3: $expand=Revisions blocked on WorkItems
        assert.throws(
          () =>
            validateAnalyticsQuery({
              entitySet: 'WorkItems',
              select: ['WorkItemId', 'Title'],
              expand: 'Revisions',
            }),
          AzureDevOpsValidationError,
        );

        // Rule 4: High-cardinality groupby blocked (VS403522)
        assert.throws(
          () =>
            validateAnalyticsQuery({
              entitySet: 'WorkItems',
              apply: 'groupby((WorkItemId), aggregate($count as Count))',
            }),
          AzureDevOpsValidationError,
        );

        // Rule 5: countdistinct operator blocked
        assert.throws(
          () =>
            validateAnalyticsQuery({
              entitySet: 'WorkItems',
              apply:
                'groupby((State), aggregate(WorkItemId with countdistinct as DistinctCount))',
            }),
          AzureDevOpsValidationError,
        );
      });
    });
  }
});
