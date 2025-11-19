import { createBranch } from './feature';
import { AzureDevOpsError } from '../../../shared/errors';

describe('createBranch unit', () => {
  test('should create branch when source exists', async () => {
    const updateRefs = jest.fn().mockResolvedValue([{ success: true }]);
    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue({
        getBranch: jest.fn().mockResolvedValue({ commit: { commitId: 'abc' } }),
        updateRefs,
      }),
    };

    await createBranch(mockConnection, {
      projectId: 'p',
      repositoryId: 'r',
      sourceBranch: 'main',
      newBranch: 'feature',
    });

    expect(updateRefs).toHaveBeenCalled();
  });

  test('should throw error when source branch missing', async () => {
    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue({
        getBranch: jest.fn().mockResolvedValue(null),
      }),
    };

    await expect(
      createBranch(mockConnection, {
        projectId: 'p',
        repositoryId: 'r',
        sourceBranch: 'missing',
        newBranch: 'feature',
      }),
    ).rejects.toThrow(AzureDevOpsError);
  });
});
