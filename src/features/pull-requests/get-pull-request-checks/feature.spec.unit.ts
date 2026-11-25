import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { getPullRequestChecks } from './feature.ts';
import { GitStatusState } from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import { PolicyEvaluationStatus } from 'azure-devops-node-api/interfaces/PolicyInterfaces.js';
import { AzureDevOpsError } from '../../../shared/errors/index.ts';

void describe('getPullRequestChecks', () => {
  void it('returns status checks and policy evaluations with pipeline references', async () => {
    const statusRecords: unknown[] = [
      {
        id: 10,
        state: GitStatusState.Failed,
        description: 'CI build',
        context: { name: 'CI', genre: 'continuous-integration' },
        targetUrl:
          'https://dev.azure.com/org/project/_apis/pipelines/55/runs/123?view=results',
        creationDate: new Date('2024-01-01T00:00:00Z'),
        updatedDate: new Date('2024-01-01T01:00:00Z'),
      },
      {
        id: 11,
        state: GitStatusState.Succeeded,
        description: 'Lint checks',
        context: { name: 'Lint', genre: 'validation' },
        targetUrl:
          'https://dev.azure.com/org/project/_build/results?buildId=456&definitionId=789',
        creationDate: new Date('2024-02-01T00:00:00Z'),
        updatedDate: new Date('2024-02-01T01:00:00Z'),
      },
    ];

    const evaluationRecords: unknown[] = [
      {
        evaluationId: 'eval-1',
        status: PolicyEvaluationStatus.Rejected,
        configuration: {
          id: 7,
          revision: 3,
          isBlocking: true,
          isEnabled: true,
          type: {
            id: 'policy-guid',
            displayName: 'Build',
          },
          settings: {
            displayName: 'CI Build',
            buildDefinitionId: 987,
          },
        },
        context: {
          buildId: 456,
          targetUrl:
            'https://dev.azure.com/org/project/_build/results?buildId=456',
          message: 'Build failed',
        },
      },
    ];

    const gitApi = {
      getPullRequestStatuses: mock.fn((..._args: unknown[]) =>
        Promise.resolve(statusRecords),
      ),
    };
    const policyApi = {
      getPolicyEvaluations: mock.fn((..._args: unknown[]) =>
        Promise.resolve(evaluationRecords),
      ),
    };
    const getProject = mock.fn((..._args: unknown[]) =>
      Promise.resolve({ id: 'project-guid', name: 'project' }),
    );

    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(gitApi)),
      getPolicyApi: mock.fn(() => Promise.resolve(policyApi)),
      getCoreApi: mock.fn(() => Promise.resolve({ getProject })),
    } as unknown as WebApi;

    const result = await getPullRequestChecks(mockConnection, {
      projectId: 'project',
      repositoryId: 'repo',
      pullRequestId: 42,
    });

    assert.strictEqual(result.statuses.length, 2);
    assert.strictEqual(result.statuses[0].state, 'failed');
    assert.strictEqual(result.statuses[0].pipeline?.pipelineId, 55);
    assert.strictEqual(result.statuses[0].pipeline?.runId, 123);
    assert.strictEqual(result.statuses[1].pipeline?.buildId, 456);
    assert.strictEqual(result.statuses[1].pipeline?.definitionId, 789);

    assert.strictEqual(result.policyEvaluations.length, 1);
    assert.strictEqual(result.policyEvaluations[0].status, 'rejected');
    assert.strictEqual(result.policyEvaluations[0].pipeline?.definitionId, 987);
    assert.strictEqual(result.policyEvaluations[0].pipeline?.buildId, 456);
    assert.ok(result.policyEvaluations[0].targetUrl?.includes('buildId=456'));

    assert.strictEqual(getProject.mock.callCount(), 1);
    assert.deepStrictEqual(getProject.mock.calls[0]?.arguments, ['project']);
    assert.strictEqual(gitApi.getPullRequestStatuses.mock.callCount(), 1);
    assert.deepStrictEqual(
      gitApi.getPullRequestStatuses.mock.calls[0]?.arguments,
      ['repo', 42, 'project-guid'],
    );
    assert.strictEqual(policyApi.getPolicyEvaluations.mock.callCount(), 1);
    assert.deepStrictEqual(
      policyApi.getPolicyEvaluations.mock.calls[0]?.arguments,
      ['project-guid', 'vstfs:///CodeReview/CodeReviewId/project-guid/42'],
    );
  });

  void it('re-throws Azure DevOps errors', async () => {
    const azureError = new AzureDevOpsError('Azure failure');
    const mockConnection = {
      getGitApi: mock.fn(() => Promise.reject(azureError)),
      getPolicyApi: mock.fn(),
      getCoreApi: mock.fn(() =>
        Promise.resolve({
          getProject: mock.fn(() => Promise.resolve({ id: 'project-guid' })),
        }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        getPullRequestChecks(mockConnection, {
          projectId: 'project',
          repositoryId: 'repo',
          pullRequestId: 1,
        }),
      (err: unknown) => {
        assert.strictEqual(err, azureError);
        return true;
      },
    );
  });

  void it('wraps unexpected errors', async () => {
    const mockConnection = {
      getGitApi: mock.fn(() => Promise.reject(new Error('boom'))),
      getPolicyApi: mock.fn(),
      getCoreApi: mock.fn(() =>
        Promise.resolve({
          getProject: mock.fn(() => Promise.resolve({ id: 'project-guid' })),
        }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        getPullRequestChecks(mockConnection, {
          projectId: 'project',
          repositoryId: 'repo',
          pullRequestId: 1,
        }),
      /Failed to get pull request checks: boom/,
    );
  });

  void it('uses the provided project GUID without fetching project metadata', async () => {
    const mockConnection = {
      getGitApi: mock.fn(() =>
        Promise.resolve({
          getPullRequestStatuses: mock.fn(() => Promise.resolve([])),
        }),
      ),
      getPolicyApi: mock.fn(() =>
        Promise.resolve({
          getPolicyEvaluations: mock.fn(() => Promise.resolve([])),
        }),
      ),
      getCoreApi: mock.fn(() => {
        throw new Error('should not fetch project');
      }),
    };

    const result = await getPullRequestChecks(
      mockConnection as unknown as WebApi,
      {
        projectId: '12345678-1234-1234-1234-1234567890ab',
        repositoryId: 'repo',
        pullRequestId: 1,
      },
    );

    assert.deepStrictEqual(result, { statuses: [], policyEvaluations: [] });
    assert.strictEqual(mockConnection.getGitApi.mock.callCount(), 1);
    assert.strictEqual(mockConnection.getPolicyApi.mock.callCount(), 1);
  });
});
