import assert from 'node:assert/strict';
import { beforeEach, describe, mock, test } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import type { UpdateStageParameters } from 'azure-devops-node-api/interfaces/BuildInterfaces.js';
import { StageUpdateType } from 'azure-devops-node-api/interfaces/BuildInterfaces.js';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import { retryPipelineStage } from './feature.ts';
import { RetryPipelineStageSchema } from './schema.ts';

type UpdateStageFn = (
  updateParameters: UpdateStageParameters,
  buildId: number,
  stageRefName: string,
  project?: string,
) => Promise<void>;

void describe('retryPipelineStage unit', () => {
  let mockConnection: WebApi;
  let mockGetBuildApi: Mock<() => Promise<unknown>>;
  let mockUpdateStage: Mock<UpdateStageFn>;

  beforeEach(() => {
    mockUpdateStage = mock.fn<UpdateStageFn>(() =>
      Promise.reject(new Error('Unexpected updateStage call')),
    );
    const mockBuildApi = {
      updateStage: mockUpdateStage,
    };

    mockGetBuildApi = mock.fn(() => Promise.resolve(mockBuildApi));
    mockConnection = {
      serverUrl: 'https://dev.azure.com/testorg',
      getBuildApi: mockGetBuildApi,
    } as unknown as WebApi;
  });

  void test('retries a stage with defaults (state=retry, forceRetryAllJobs=false) and handles 204 void response', async () => {
    mockUpdateStage.mock.mockImplementation(() => Promise.resolve(undefined));

    const result = await retryPipelineStage(mockConnection, {
      projectId: 'DemoProject',
      runId: 500,
      stageRefName: 'Test',
    });

    assert.strictEqual(mockGetBuildApi.mock.callCount(), 1);
    assert.strictEqual(mockUpdateStage.mock.callCount(), 1);
    const args = mockUpdateStage.mock.calls[0]?.arguments;
    assert.ok(args);
    assert.deepStrictEqual(args[0], {
      state: StageUpdateType.Retry,
      forceRetryAllJobs: false,
    });
    assert.strictEqual('retryDependencies' in args[0], false);
    assert.strictEqual(args[1], 500);
    assert.strictEqual(args[2], 'Test');
    assert.strictEqual(args[3], 'DemoProject');

    assert.deepStrictEqual(result, {
      buildId: 500,
      stageRefName: 'Test',
      state: 'retry',
      forceRetryAllJobs: false,
      status: 'accepted',
    });
  });

  void test('forwards forceRetryAllJobs=true and explicit retryDependencies when provided', async () => {
    mockUpdateStage.mock.mockImplementation(() => Promise.resolve(undefined));

    const result = await retryPipelineStage(mockConnection, {
      projectId: 'DemoProject',
      runId: 500,
      stageRefName: 'Build',
      state: 'retry',
      forceRetryAllJobs: true,
      retryDependencies: true,
    });

    const args = mockUpdateStage.mock.calls[0]?.arguments;
    assert.deepStrictEqual(args?.[0], {
      state: StageUpdateType.Retry,
      forceRetryAllJobs: true,
      retryDependencies: true,
    });
    assert.deepStrictEqual(result, {
      buildId: 500,
      stageRefName: 'Build',
      state: 'retry',
      forceRetryAllJobs: true,
      retryDependencies: true,
      status: 'accepted',
    });
  });

  void test('supports cancel (StageUpdateType.Cancel=0) and run (StageUpdateType.Run=2) states', async () => {
    mockUpdateStage.mock.mockImplementation(() => Promise.resolve(undefined));

    const cancelRes = await retryPipelineStage(mockConnection, {
      projectId: 'DemoProject',
      runId: 500,
      stageRefName: 'Deploy',
      state: 'cancel',
    });
    assert.strictEqual(
      mockUpdateStage.mock.calls[0]?.arguments[0].state,
      StageUpdateType.Cancel,
    );
    assert.strictEqual(cancelRes.state, 'cancel');

    const runRes = await retryPipelineStage(mockConnection, {
      projectId: 'DemoProject',
      runId: 500,
      stageRefName: 'ManualStage',
      state: 'run',
    });
    assert.strictEqual(
      mockUpdateStage.mock.calls[1]?.arguments[0].state,
      StageUpdateType.Run,
    );
    assert.strictEqual(runRes.state, 'run');
  });

  void test('maps missing API location / Server 2019 (5.0) error to actionable Server 2020+/Services message', async () => {
    mockUpdateStage.mock.mockImplementation(() =>
      Promise.reject(
        new Error(
          'Failed to find api location for area: build id: b8aac6c9-744b-46e1-88fc-3550969f9313',
        ),
      ),
    );

    await assert.rejects(
      () =>
        retryPipelineStage(mockConnection, {
          projectId: 'DemoProject',
          runId: 500,
          stageRefName: 'Test',
        }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsValidationError);
        assert.match(err.message, /2020/);
        assert.match(err.message, /6\.0/);
        assert.match(err.message, /Azure DevOps Services/i);
        return true;
      },
    );
  });

  void test('maps 400 validation errors (inProgress, succeeded without forceRetryAllJobs, missing stage) cleanly', async () => {
    const serverMessages = [
      "Stage 'Deploy' is currently inProgress and cannot be retried.",
      "Stage 'Build' succeeded; set forceRetryAllJobs=true to re-run all jobs.",
      "Stage 'NonExistentStage' does not exist in build 500.",
    ];

    for (const msg of serverMessages) {
      const err = Object.assign(new Error(msg), { statusCode: 400 });
      mockUpdateStage.mock.mockImplementation(() => Promise.reject(err));

      await assert.rejects(
        () =>
          retryPipelineStage(mockConnection, {
            projectId: 'DemoProject',
            runId: 500,
            stageRefName: 'Deploy',
          }),
        (caught: unknown) => {
          assert.ok(caught instanceof AzureDevOpsValidationError);
          assert.strictEqual(caught.message, msg);
          return true;
        },
      );
    }
  });

  void test('maps 401, 403, 404, and 500 errors to typed AzureDevOpsError subclasses', async () => {
    const cases = [
      {
        statusCode: 401,
        msg: 'Unauthorized',
        cls: AzureDevOpsAuthenticationError,
      },
      { statusCode: 403, msg: 'Forbidden', cls: AzureDevOpsPermissionError },
      {
        statusCode: 404,
        msg: 'Build 999 not found',
        cls: AzureDevOpsResourceNotFoundError,
      },
      { statusCode: 500, msg: 'Internal error', cls: AzureDevOpsError },
    ] as const;

    for (const c of cases) {
      const err = Object.assign(new Error(c.msg), { statusCode: c.statusCode });
      mockUpdateStage.mock.mockImplementation(() => Promise.reject(err));

      await assert.rejects(
        () =>
          retryPipelineStage(mockConnection, {
            projectId: 'DemoProject',
            runId: 500,
            stageRefName: 'Test',
          }),
        c.cls,
      );
    }
  });

  void test('validates schema inputs cleanly', () => {
    assert.strictEqual(
      RetryPipelineStageSchema.safeParse({
        runId: 500,
        stageRefName: 'Test',
      }).success,
      true,
    );
    assert.strictEqual(
      RetryPipelineStageSchema.safeParse({
        pipelineName: 'CI-Main',
        buildNumber: '20261125.1',
        stageRefName: 'Deploy',
        state: 'cancel',
      }).success,
      true,
    );
    assert.strictEqual(
      RetryPipelineStageSchema.safeParse({
        runId: 500,
        stageRefName: '   ',
      }).success,
      false,
    );
    assert.strictEqual(
      RetryPipelineStageSchema.safeParse({
        stageRefName: 'Test',
      }).success,
      false,
    );
  });
});
