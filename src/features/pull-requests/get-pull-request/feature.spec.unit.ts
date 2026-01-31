import { WebApi } from 'azure-devops-node-api';
import { getPullRequest } from './feature';
import { AzureDevOpsResourceNotFoundError } from '../../../shared/errors';

describe('getPullRequest', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('should return pull request by id', async () => {
    const mockPullRequest = { pullRequestId: 42, title: 'PR 42' };

    const mockGitApi = {
      getPullRequestById: jest.fn().mockResolvedValue(mockPullRequest),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    const result = await getPullRequest(mockConnection as WebApi, {
      projectId: 'test-project',
      pullRequestId: 42,
    });

    expect(result).toEqual(mockPullRequest);
    expect(mockGitApi.getPullRequestById).toHaveBeenCalledWith(
      42,
      'test-project',
    );
  });

  test('should throw resource not found error when pull request is not found', async () => {
    const mockGitApi = {
      getPullRequestById: jest.fn().mockResolvedValue(undefined),
    };

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    };

    await expect(
      getPullRequest(mockConnection as WebApi, {
        projectId: 'test-project',
        pullRequestId: 42,
      }),
    ).rejects.toBeInstanceOf(AzureDevOpsResourceNotFoundError);
  });
});
