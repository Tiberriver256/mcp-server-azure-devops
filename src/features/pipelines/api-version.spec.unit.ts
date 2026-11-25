import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { AuthenticationMethod } from '../../shared/auth/index.ts';
import { resolveAzureDevOpsBaseUrls } from '../../shared/azure-devops-url.ts';
import { AzureDevOpsValidationError } from '../../shared/errors/index.ts';
import { createHttpClient } from '../../shared/http/http-client.ts';
import type { ToolContext } from '../../shared/session/azure-devops-session.ts';
import {
  BUILD_LOGS_LOCATION_ID,
  BUILD_TIMELINE_LOCATION_ID,
  PIPELINES_LOCATION_ID,
  PIPELINE_RUNS_LOCATION_ID,
  clearPipelineApiVersionCache,
  negotiateVersionFromLocation,
} from './api-version.ts';
import { getPipeline } from './get-pipeline/feature.ts';
import { getPipelineLog } from './get-pipeline-log/feature.ts';
import { getPipelineRun } from './get-pipeline-run/feature.ts';
import { listPipelineRuns } from './list-pipeline-runs/feature.ts';
import { listPipelines } from './list-pipelines/feature.ts';
import { getPipelineTimeline } from './pipeline-timeline/feature.ts';
import { triggerPipeline } from './trigger-pipeline/feature.ts';

interface ServerProfile {
  readonly name: string;
  readonly baseUrl: string;
  readonly maxVersion: string;
  readonly supportsPipelines: boolean;
  readonly pipelinesPreviewOnly: boolean;
  readonly expectedPipelinesVersion?: string;
  readonly expectedBuildVersion: string;
}

const PROFILES: readonly ServerProfile[] = [
  {
    name: 'server-2019-rtm',
    baseUrl: 'https://ado2019.local/tfs/DefaultCollection',
    maxVersion: '5.0',
    supportsPipelines: false,
    pipelinesPreviewOnly: false,
    expectedBuildVersion: '5.0',
  },
  {
    name: 'server-2020',
    baseUrl: 'https://ado2020.local/tfs/DefaultCollection',
    maxVersion: '6.0',
    supportsPipelines: true,
    pipelinesPreviewOnly: true,
    expectedPipelinesVersion: '6.0-preview.1',
    expectedBuildVersion: '6.0',
  },
  {
    name: 'server-2022',
    baseUrl: 'https://ado2022.local/tfs/DefaultCollection',
    maxVersion: '7.0',
    supportsPipelines: true,
    pipelinesPreviewOnly: false,
    expectedPipelinesVersion: '7.0',
    expectedBuildVersion: '7.0',
  },
  {
    name: 'services',
    baseUrl: 'https://dev.azure.com/demo-org',
    maxVersion: '7.1',
    supportsPipelines: true,
    pipelinesPreviewOnly: false,
    expectedPipelinesVersion: '7.1',
    expectedBuildVersion: '7.1',
  },
];

function makeOptionsCatalog(profile: ServerProfile, url: string) {
  if (url.endsWith('/_apis/pipelines')) {
    if (!profile.supportsPipelines) {
      return { statusCode: 200, result: { count: 0, value: [] } };
    }
    const released = profile.pipelinesPreviewOnly ? '0.0' : profile.maxVersion;
    return {
      statusCode: 200,
      result: {
        count: 2,
        value: [
          {
            id: PIPELINES_LOCATION_ID,
            area: 'pipelines',
            resourceName: 'pipelines',
            resourceVersion: 1,
            minVersion: '6.0',
            maxVersion: profile.maxVersion,
            releasedVersion: released,
          },
          {
            id: PIPELINE_RUNS_LOCATION_ID,
            area: 'pipelines',
            resourceName: 'runs',
            resourceVersion: 1,
            minVersion: '6.0',
            maxVersion: profile.maxVersion,
            releasedVersion: released,
          },
        ],
      },
    };
  }

  return {
    statusCode: 200,
    result: {
      count: 2,
      value: [
        {
          id: BUILD_TIMELINE_LOCATION_ID,
          area: 'build',
          resourceName: 'timeline',
          resourceVersion: 3,
          minVersion: '1.0',
          maxVersion: profile.maxVersion,
          releasedVersion: profile.maxVersion,
        },
        {
          id: BUILD_LOGS_LOCATION_ID,
          area: 'build',
          resourceName: 'logs',
          resourceVersion: 2,
          minVersion: '1.0',
          maxVersion: profile.maxVersion,
          releasedVersion: profile.maxVersion,
        },
      ],
    },
  };
}

void describe('pipelines per-area api-version negotiation', () => {
  beforeEach(() => {
    clearPipelineApiVersionCache();
  });

  afterEach(() => {
    clearPipelineApiVersionCache();
  });

  void it('negotiates GA and preview-only locations accurately across versions', () => {
    assert.strictEqual(
      negotiateVersionFromLocation(
        { maxVersion: '6.0', releasedVersion: '0.0', resourceVersion: 1 },
        '7.1',
      ),
      '6.0-preview.1',
    );
    assert.strictEqual(
      negotiateVersionFromLocation(
        { maxVersion: '6.0', releasedVersion: '0.0', resourceVersion: 1 },
        '6.0',
      ),
      '6.0-preview.1',
    );
    assert.strictEqual(
      negotiateVersionFromLocation(
        { maxVersion: '5.0', releasedVersion: '5.0', resourceVersion: 3 },
        '7.1',
      ),
      '5.0',
    );
    assert.strictEqual(
      negotiateVersionFromLocation(
        { maxVersion: '7.0', releasedVersion: '7.0', resourceVersion: 1 },
        '7.1',
      ),
      '7.0',
    );
    assert.strictEqual(
      negotiateVersionFromLocation(
        { maxVersion: '7.1', releasedVersion: '7.1', resourceVersion: 1 },
        '7.1',
      ),
      '7.1',
    );
  });

  for (const profile of PROFILES) {
    void it(`negotiates pipelines and build versions on ${profile.name} with default 7.1 config and caches OPTIONS per area`, async () => {
      const optionsMock = mock.fn(async (url: string) =>
        makeOptionsCatalog(profile, url),
      );
      const restGet = mock.fn(async (url: string) => {
        if (url.includes('/_apis/pipelines/')) {
          return {
            statusCode: 200,
            result: url.includes('/runs/500')
              ? { id: 500, name: '20261125.1', pipeline: { id: 10 } }
              : { value: [{ id: 500, name: '20261125.1' }] },
            headers: {},
          };
        }
        if (url.includes('/timeline')) {
          return {
            statusCode: 200,
            result: { records: [{ id: '1', name: 'Test Stage' }] },
            headers: {},
          };
        }
        return {
          statusCode: 200,
          result: { count: 1, value: ['line 1'] },
          headers: {},
        };
      });

      const vsoClient = { restClient: { options: optionsMock } };
      const pipelinesApi = {
        vsoClient,
        rest: { get: restGet },
        createRequestOptions: mock.fn((_ct: string, ver: string) => ({
          acceptHeader: `application/json;api-version=${ver}`,
        })),
        formatResponse: mock.fn(
          (res: unknown, _ti: unknown, isArray: boolean) =>
            isArray ? ((res as { value?: unknown[] }).value ?? []) : res,
        ),
      };
      const buildApi = {
        vsoClient,
        rest: { get: restGet },
        getArtifacts: mock.fn(() => Promise.resolve([])),
        createRequestOptions: mock.fn((_ct: string, ver: string) => ({
          acceptHeader: `application/json;api-version=${ver}`,
        })),
      };

      const connection = {
        serverUrl: profile.baseUrl,
        getPipelinesApi: mock.fn(() => Promise.resolve(pipelinesApi)),
        getBuildApi: mock.fn(() => Promise.resolve(buildApi)),
      } as unknown as WebApi;

      const baseUrls = resolveAzureDevOpsBaseUrls(profile.baseUrl, {
        projectId: 'DemoProject',
      });
      const ctx: ToolContext = {
        config: {
          organizationUrl: profile.baseUrl,
          authMethod: AuthenticationMethod.PersonalAccessToken,
          personalAccessToken: 'test-pat',
          defaultProject: 'DemoProject',
          apiVersion: '7.1',
          readOnly: false,
          spotlighting: true,
        },
        baseUrls,
        http: createHttpClient(),
        getWebApi: async () => connection,
        getAuthHeader: async () => 'Basic dGVzdC1wYXQ=',
        requestAzureDevOps: async () => {
          throw new Error('Unexpected requestAzureDevOps');
        },
        resolveBaseUrls: (opts) =>
          resolveAzureDevOpsBaseUrls(profile.baseUrl, opts),
        resolveProjectId: (explicit) => explicit ?? 'DemoProject',
        resolveOptionalProjectId: (explicit) => explicit ?? 'DemoProject',
      };

      if (!profile.supportsPipelines) {
        await assert.rejects(
          () =>
            listPipelineRuns(
              connection,
              { projectId: 'DemoProject', pipelineId: 10 },
              ctx,
            ),
          (error: unknown) => {
            assert.ok(error instanceof AzureDevOpsValidationError);
            assert.match(error.message, /2019|2020|6\.0-preview\.1/i);
            return true;
          },
        );
        await assert.rejects(
          () =>
            getPipelineRun(
              connection,
              { projectId: 'DemoProject', pipelineId: 10, runId: 500 },
              ctx,
            ),
          AzureDevOpsValidationError,
        );
      } else {
        await listPipelineRuns(
          connection,
          { projectId: 'DemoProject', pipelineId: 10 },
          ctx,
        );
        await getPipelineRun(
          connection,
          { projectId: 'DemoProject', pipelineId: 10, runId: 500 },
          ctx,
        );

        const pipeUrls = restGet.mock.calls
          .map((c) => c.arguments[0])
          .filter((u) => u.includes('/_apis/pipelines/'));
        assert.strictEqual(pipeUrls.length, 2);
        for (const u of pipeUrls) {
          assert.strictEqual(
            new URL(u).searchParams.get('api-version'),
            profile.expectedPipelinesVersion,
          );
        }
      }

      // Build timeline & JSON log must negotiate cleanly on ALL 4 profiles (including Server 2019!)
      await getPipelineTimeline(
        connection,
        { projectId: 'DemoProject', runId: 500 },
        ctx,
      );
      await getPipelineLog(
        connection,
        { projectId: 'DemoProject', runId: 500, logId: 1, format: 'json' },
        ctx,
      );

      const buildUrls = restGet.mock.calls
        .map((c) => c.arguments[0])
        .filter((u) => u.includes('/_apis/build/'));
      assert.strictEqual(buildUrls.length, 2);
      for (const u of buildUrls) {
        assert.strictEqual(
          new URL(u).searchParams.get('api-version'),
          profile.expectedBuildVersion,
        );
      }

      // OPTIONS must be called at most once per area ('pipelines' once + 'build' once = 2 total)
      assert.strictEqual(optionsMock.mock.callCount(), 2);
    });
  }

  void it('maps SDK VsoClient missing pipelines location error on Server 2019 for listPipelines, getPipeline, and triggerPipeline', async () => {
    const missingErr = new Error(
      `Failed to find api location for area: pipelines id: ${PIPELINES_LOCATION_ID}`,
    );
    const mockPipelinesApi = {
      listPipelines: mock.fn(() => Promise.reject(missingErr)),
      getPipeline: mock.fn(() => Promise.reject(missingErr)),
      runPipeline: mock.fn(() => Promise.reject(missingErr)),
    };
    const connection = {
      serverUrl: 'https://ado2019.local/tfs/DefaultCollection',
      getPipelinesApi: mock.fn(() => Promise.resolve(mockPipelinesApi)),
    } as unknown as WebApi;

    for (const fn of [
      () => listPipelines(connection, { projectId: 'DemoProject' }),
      () =>
        getPipeline(connection, { projectId: 'DemoProject', pipelineId: 10 }),
      () =>
        triggerPipeline(connection, {
          projectId: 'DemoProject',
          pipelineId: 10,
        }),
    ]) {
      await assert.rejects(fn, (error: unknown) => {
        assert.ok(error instanceof AzureDevOpsValidationError);
        assert.match(error.message, /Server 2020|6\.0-preview\.1/i);
        return true;
      });
    }
  });

  void it('falls back to configured apiVersion when OPTIONS fails transiently and retries on subsequent calls', async () => {
    let attempt = 0;
    const optionsMock = mock.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error('ECONNRESET');
      }
      return makeOptionsCatalog(PROFILES[1], '/_apis/build');
    });
    const restGet = mock.fn(async (_url: string) => ({
      statusCode: 200,
      result: { records: [] },
      headers: {},
    }));
    const buildApi = {
      vsoClient: { restClient: { options: optionsMock } },
      rest: { get: restGet },
      createRequestOptions: mock.fn(() => ({})),
    };
    const connection = {
      serverUrl: 'https://transient.local/tfs/DefaultCollection',
      getBuildApi: mock.fn(() => Promise.resolve(buildApi)),
    } as unknown as WebApi;

    await getPipelineTimeline(connection, {
      projectId: 'DemoProject',
      runId: 500,
    });
    assert.strictEqual(
      new URL(restGet.mock.calls[0].arguments[0]).searchParams.get(
        'api-version',
      ),
      '7.1',
    );

    await getPipelineTimeline(connection, {
      projectId: 'DemoProject',
      runId: 500,
    });
    assert.strictEqual(
      new URL(restGet.mock.calls[1].arguments[0]).searchParams.get(
        'api-version',
      ),
      '6.0',
    );
    assert.strictEqual(optionsMock.mock.callCount(), 2);
  });
});
