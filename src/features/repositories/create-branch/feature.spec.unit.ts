import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import { createBranch } from './feature.ts';
import { AzureDevOpsError } from '../../../shared/errors/index.ts';

void describe('createBranch unit', () => {
  void test('should create branch when source exists', async () => {
    const updateRefs = mock.fn(() => Promise.resolve([{ success: true }]));
    const mockConnection: any = {
      getGitApi: mock.fn(() =>
        Promise.resolve({
          getBranch: mock.fn(() =>
            Promise.resolve({ commit: { commitId: 'abc' } }),
          ),
          updateRefs,
        }),
      ),
    };

    await createBranch(mockConnection, {
      projectId: 'p',
      repositoryId: 'r',
      sourceBranch: 'main',
      newBranch: 'feature',
    });

    assert.strictEqual(updateRefs.mock.callCount(), 1);
  });

  void test('should throw error when source branch missing', async () => {
    const mockConnection: any = {
      getGitApi: mock.fn(() =>
        Promise.resolve({
          getBranch: mock.fn(() => Promise.resolve(null)),
        }),
      ),
    };

    await assert.rejects(
      () =>
        createBranch(mockConnection, {
          projectId: 'p',
          repositoryId: 'r',
          sourceBranch: 'missing',
          newBranch: 'feature',
        }),
      AzureDevOpsError,
    );
  });
});
