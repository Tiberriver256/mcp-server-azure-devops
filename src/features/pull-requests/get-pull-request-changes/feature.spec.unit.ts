import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import { Readable } from 'stream';
import type { WebApi } from 'azure-devops-node-api';
import { getPullRequestChanges } from './feature.ts';
import { AzureDevOpsError } from '../../../shared/errors/index.ts';

void describe('getPullRequestChanges unit', () => {
  void test('should retrieve changes, evaluations, and patches', async () => {
    const mockGitApi = {
      getPullRequest: mock.fn((..._args: unknown[]) =>
        Promise.resolve({
          sourceRefName: 'refs/heads/feature',
          targetRefName: 'refs/heads/main',
        }),
      ),
      getPullRequestIterations: mock.fn(() => Promise.resolve([{ id: 1 }])),
      getPullRequestIterationChanges: mock.fn(() =>
        Promise.resolve({
          changeEntries: [
            {
              item: {
                path: '/file.txt',
                objectId: 'new',
                originalObjectId: 'old',
              },
            },
          ],
        }),
      ),
      getBlobContent: mock.fn((_repo: string, sha: string) => {
        const content = sha === 'new' ? 'new content\n' : 'old content\n';
        const stream = new Readable();
        stream.push(content);
        stream.push(null);
        return Promise.resolve(stream);
      }),
    };
    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
      getPolicyApi: mock.fn(() =>
        Promise.resolve({
          getPolicyEvaluations: mock.fn(() => Promise.resolve([{ id: '1' }])),
        }),
      ),
    } as unknown as WebApi;

    const result = await getPullRequestChanges(mockConnection, {
      projectId: 'p',
      repositoryId: 'r',
      pullRequestId: 1,
    });

    assert.deepStrictEqual(result.changes, {
      changeEntries: [
        {
          item: { path: '/file.txt', objectId: 'new', originalObjectId: 'old' },
        },
      ],
    });
    assert.strictEqual(result.evaluations.length, 1);
    assert.strictEqual(result.files.length, 1);
    assert.strictEqual(result.files[0].path, '/file.txt');
    assert.ok(result.files[0].patch.includes('-old content'));
    assert.ok(result.files[0].patch.includes('+new content'));
    assert.strictEqual(result.sourceRefName, 'refs/heads/feature');
    assert.strictEqual(result.targetRefName, 'refs/heads/main');
    assert.strictEqual(mockGitApi.getPullRequest.mock.callCount(), 1);
    assert.deepStrictEqual(mockGitApi.getPullRequest.mock.calls[0]?.arguments, [
      'r',
      1,
      'p',
    ]);
  });

  void test('uses project GUID from pullRequest metadata in policy artifactId and propagates non-size-limit stream errors', async () => {
    const getPolicyEvaluations = mock.fn((..._args: unknown[]) =>
      Promise.resolve([]),
    );
    const mockGitApi = {
      getPullRequest: mock.fn(() =>
        Promise.resolve({
          sourceRefName: 'refs/heads/feature',
          targetRefName: 'refs/heads/main',
          repository: { project: { id: 'guid-1111-2222' } },
        }),
      ),
      getPullRequestIterations: mock.fn(() => Promise.resolve([{ id: 1 }])),
      getPullRequestIterationChanges: mock.fn(() =>
        Promise.resolve({
          changeEntries: [{ item: { path: '/broken.txt', objectId: 'obj-1' } }],
        }),
      ),
      getBlobContent: mock.fn(
        () =>
          new Readable({
            read() {
              this.destroy(new Error('network timeout while reading blob'));
            },
          }),
      ),
    };
    const mockConnection = {
      getGitApi: mock.fn(() => Promise.resolve(mockGitApi)),
      getPolicyApi: mock.fn(() => Promise.resolve({ getPolicyEvaluations })),
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        getPullRequestChanges(mockConnection, {
          projectId: 'MyProjectName',
          repositoryId: 'r',
          pullRequestId: 9,
        }),
      /network timeout while reading blob/,
    );

    assert.strictEqual(getPolicyEvaluations.mock.callCount(), 1);
    assert.deepStrictEqual(getPolicyEvaluations.mock.calls[0]?.arguments, [
      'MyProjectName',
      'vstfs:///CodeReview/CodeReviewId/guid-1111-2222/9',
    ]);
  });

  void test('should throw when no iterations found', async () => {
    const mockConnection = {
      getGitApi: mock.fn(() =>
        Promise.resolve({
          getPullRequest: mock.fn(() =>
            Promise.resolve({
              sourceRefName: 'refs/heads/source',
              targetRefName: 'refs/heads/target',
            }),
          ),
          getPullRequestIterations: mock.fn(() => Promise.resolve([])),
        }),
      ),
    } as unknown as WebApi;

    await assert.rejects(
      () =>
        getPullRequestChanges(mockConnection, {
          projectId: 'p',
          repositoryId: 'r',
          pullRequestId: 1,
        }),
      AzureDevOpsError,
    );
  });
});
