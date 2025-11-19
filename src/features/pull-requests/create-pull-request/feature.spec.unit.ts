import { createPullRequest } from './feature';
import { AzureDevOpsError } from '../../../shared/errors';

describe('createPullRequest unit', () => {
  // Test for required fields validation
  test('should throw error when title is not provided', async () => {
    // Arrange - mock connection, never used due to validation error
    const mockConnection: any = {
      getGitApi: jest.fn(),
    };

    // Act & Assert
    await expect(
      createPullRequest(mockConnection, 'TestProject', 'TestRepo', {
        title: '',
        sourceRefName: 'refs/heads/feature-branch',
        targetRefName: 'refs/heads/main',
      }),
    ).rejects.toThrow('Title is required');
  });

  test('should throw error when source branch is not provided', async () => {
    // Arrange - mock connection, never used due to validation error
    const mockConnection: any = {
      getGitApi: jest.fn(),
    };

    // Act & Assert
    await expect(
      createPullRequest(mockConnection, 'TestProject', 'TestRepo', {
        title: 'Test PR',
        sourceRefName: '',
        targetRefName: 'refs/heads/main',
      }),
    ).rejects.toThrow('Source branch is required');
  });

  test('should throw error when target branch is not provided', async () => {
    // Arrange - mock connection, never used due to validation error
    const mockConnection: any = {
      getGitApi: jest.fn(),
    };

    // Act & Assert
    await expect(
      createPullRequest(mockConnection, 'TestProject', 'TestRepo', {
        title: 'Test PR',
        sourceRefName: 'refs/heads/feature-branch',
        targetRefName: '',
      }),
    ).rejects.toThrow('Target branch is required');
  });

  // Test for error propagation
  test('should propagate custom errors when thrown internally', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: jest.fn().mockImplementation(() => {
        throw new AzureDevOpsError('Custom error');
      }),
    };

    // Act & Assert
    await expect(
      createPullRequest(mockConnection, 'TestProject', 'TestRepo', {
        title: 'Test PR',
        sourceRefName: 'refs/heads/feature-branch',
        targetRefName: 'refs/heads/main',
      }),
    ).rejects.toThrow(AzureDevOpsError);

    await expect(
      createPullRequest(mockConnection, 'TestProject', 'TestRepo', {
        title: 'Test PR',
        sourceRefName: 'refs/heads/feature-branch',
        targetRefName: 'refs/heads/main',
      }),
    ).rejects.toThrow('Custom error');
  });

  test('should wrap unexpected errors in a friendly error message', async () => {
    // Arrange
    const mockConnection: any = {
      getGitApi: jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      }),
    };

    // Act & Assert
    await expect(
      createPullRequest(mockConnection, 'TestProject', 'TestRepo', {
        title: 'Test PR',
        sourceRefName: 'refs/heads/feature-branch',
        targetRefName: 'refs/heads/main',
      }),
    ).rejects.toThrow('Failed to create pull request: Unexpected error');
  });

  test('should apply unique trimmed tags to the pull request', async () => {
    const createPullRequestMock = jest.fn().mockResolvedValue({
      pullRequestId: 99,
      labels: [{ name: 'existing' }],
    });
    const createPullRequestLabelMock = jest
      .fn()
      .mockImplementation(async (label: { name: string }) => ({
        name: label.name,
      }));

    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue({
        createPullRequest: createPullRequestMock,
        createPullRequestLabel: createPullRequestLabelMock,
      }),
    };

    const result = await createPullRequest(
      mockConnection,
      'TestProject',
      'TestRepo',
      {
        title: 'Test PR',
        sourceRefName: 'refs/heads/feature-branch',
        targetRefName: 'refs/heads/main',
        tags: ['Tag-One', 'tag-one', ' Tag-Two ', ''],
      },
    );

    expect(createPullRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: [{ name: 'Tag-One' }, { name: 'Tag-Two' }],
      }),
      'TestRepo',
      'TestProject',
    );
    expect(createPullRequestLabelMock).toHaveBeenCalledTimes(2);
    expect(createPullRequestLabelMock).toHaveBeenCalledWith(
      { name: 'Tag-One' },
      'TestRepo',
      99,
      'TestProject',
    );
    expect(createPullRequestLabelMock).toHaveBeenCalledWith(
      { name: 'Tag-Two' },
      'TestRepo',
      99,
      'TestProject',
    );
    expect(result.labels).toEqual([
      { name: 'existing' },
      { name: 'Tag-One' },
      { name: 'Tag-Two' },
    ]);
  });
});
