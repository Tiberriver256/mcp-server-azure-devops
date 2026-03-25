import {
  getWorkItemComments,
  addWorkItemComment,
  updateWorkItemComment,
} from './feature';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';

describe('getWorkItemComments unit', () => {
  test('should return empty array when work item has no comments', async () => {
    // Arrange
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getComments: jest.fn().mockResolvedValue({ comments: [] }),
      }),
    };

    // Act
    const result = await getWorkItemComments(mockConnection, {
      projectId: 'test-project',
      workItemId: 42,
    });

    // Assert
    expect(result).toEqual([]);
  });

  test('should return comments when the work item has comments', async () => {
    // Arrange
    const mockComments = [
      {
        commentId: 1,
        text: 'First comment',
        createdBy: { displayName: 'Alice' },
      },
      {
        commentId: 2,
        text: 'Second comment',
        createdBy: { displayName: 'Bob' },
      },
    ];

    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getComments: jest.fn().mockResolvedValue({ comments: mockComments }),
      }),
    };

    // Act
    const result = await getWorkItemComments(mockConnection, {
      projectId: 'test-project',
      workItemId: 42,
    });

    // Assert
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('First comment');
    expect(result[1].text).toBe('Second comment');
  });

  test('should pass top and order options through to the API', async () => {
    // Arrange
    const mockGetComments = jest.fn().mockResolvedValue({ comments: [] });

    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getComments: mockGetComments,
      }),
    };

    // Act
    await getWorkItemComments(mockConnection, {
      projectId: 'test-project',
      workItemId: 99,
      top: 5,
      order: 'desc',
    });

    // Assert: verify API was called with the right parameters
    // order 'desc' maps to CommentSortOrder.Desc = 2
    expect(mockGetComments).toHaveBeenCalledWith(
      'test-project',
      99,
      5,
      undefined,
      undefined,
      undefined,
      2, // CommentSortOrder.Desc
    );
  });

  test('should pass includeDeleted option through to the API', async () => {
    // Arrange
    const mockGetComments = jest.fn().mockResolvedValue({ comments: [] });

    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getComments: mockGetComments,
      }),
    };

    // Act
    await getWorkItemComments(mockConnection, {
      projectId: 'test-project',
      workItemId: 99,
      includeDeleted: true,
    });

    // Assert
    // includeDeleted=true, order defaults to CommentSortOrder.Asc = 1
    expect(mockGetComments).toHaveBeenCalledWith(
      'test-project',
      99,
      undefined,
      undefined,
      true,
      undefined,
      1, // CommentSortOrder.Asc
    );
  });

  test('should throw AzureDevOpsResourceNotFoundError when API returns null', async () => {
    // Arrange
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getComments: jest.fn().mockResolvedValue(null),
      }),
    };

    // Act & Assert
    await expect(
      getWorkItemComments(mockConnection, {
        projectId: 'test-project',
        workItemId: 999,
      }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
  });

  test('should wrap unexpected errors with AzureDevOpsError', async () => {
    // Arrange
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        getComments: jest.fn().mockRejectedValue(new Error('Network failure')),
      }),
    };

    // Act & Assert
    await expect(
      getWorkItemComments(mockConnection, {
        projectId: 'test-project',
        workItemId: 42,
      }),
    ).rejects.toThrow(AzureDevOpsError);

    await expect(
      getWorkItemComments(mockConnection, {
        projectId: 'test-project',
        workItemId: 42,
      }),
    ).rejects.toThrow('Failed to get work item comments: Network failure');
  });
});

describe('addWorkItemComment unit', () => {
  test('should return the created comment', async () => {
    const mockComment = { commentId: 7, text: 'Hello world' };
    const mockAddComment = jest.fn().mockResolvedValue(mockComment);
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        addComment: mockAddComment,
      }),
    };

    const result = await addWorkItemComment(mockConnection, {
      projectId: 'test-project',
      workItemId: 42,
      text: 'Hello world',
    });

    expect(result).toEqual(mockComment);
    expect(mockAddComment).toHaveBeenCalledWith(
      { text: 'Hello world' },
      'test-project',
      42,
    );
  });

  test('should throw AzureDevOpsResourceNotFoundError when API returns null', async () => {
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        addComment: jest.fn().mockResolvedValue(null),
      }),
    };

    await expect(
      addWorkItemComment(mockConnection, {
        projectId: 'test-project',
        workItemId: 42,
        text: 'Hello world',
      }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
  });

  test('should wrap unexpected errors with AzureDevOpsError', async () => {
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        addComment: jest.fn().mockRejectedValue(new Error('Network failure')),
      }),
    };

    await expect(
      addWorkItemComment(mockConnection, {
        projectId: 'test-project',
        workItemId: 42,
        text: 'Hello world',
      }),
    ).rejects.toThrow(AzureDevOpsError);
  });
});

describe('updateWorkItemComment unit', () => {
  test('should return the updated comment with correct commentId', async () => {
    const mockComment = { commentId: 3, text: 'Updated text' };
    const mockUpdateComment = jest.fn().mockResolvedValue(mockComment);
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        updateComment: mockUpdateComment,
      }),
    };

    const result = await updateWorkItemComment(mockConnection, {
      projectId: 'test-project',
      workItemId: 42,
      commentId: 3,
      text: 'Updated text',
    });

    expect(result).toEqual(mockComment);
    expect(mockUpdateComment).toHaveBeenCalledWith(
      { text: 'Updated text' },
      'test-project',
      42,
      3,
    );
  });

  test('should throw AzureDevOpsResourceNotFoundError when API returns null', async () => {
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        updateComment: jest.fn().mockResolvedValue(null),
      }),
    };

    await expect(
      updateWorkItemComment(mockConnection, {
        projectId: 'test-project',
        workItemId: 42,
        commentId: 3,
        text: 'Updated text',
      }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
  });

  test('should wrap unexpected errors with AzureDevOpsError', async () => {
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        updateComment: jest
          .fn()
          .mockRejectedValue(new Error('Network failure')),
      }),
    };

    await expect(
      updateWorkItemComment(mockConnection, {
        projectId: 'test-project',
        workItemId: 42,
        commentId: 3,
        text: 'Updated text',
      }),
    ).rejects.toThrow(AzureDevOpsError);
  });
});
