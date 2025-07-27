import { WebApi } from 'azure-devops-node-api';
import { getWorkItemComments } from './feature';
import {
  CommentList,
  CommentSortOrder,
  CommentExpandOptions,
  CommentReactionType,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi';

describe('getWorkItemComments', () => {
  const mockConnection = {
    getWorkItemTrackingApi: jest.fn(),
  } as unknown as jest.Mocked<WebApi>;

  const mockWorkItemTrackingApi = {
    getComments: jest.fn(),
  } as unknown as jest.Mocked<IWorkItemTrackingApi>;

  beforeEach(() => {
    jest.clearAllMocks();
    (mockConnection.getWorkItemTrackingApi as jest.Mock).mockResolvedValue(
      mockWorkItemTrackingApi,
    );
  });

  it('should get comments for a work item', async () => {
    const mockComments: CommentList = {
      totalCount: 1,
      count: 1,
      comments: [
        {
          id: 1,
          workItemId: 100,
          text: 'Test comment',
          url: 'http://test.com',
          createdBy: {
            id: 'user1',
            displayName: 'User 1',
          },
          createdDate: new Date(),
        },
      ],
    };

    mockWorkItemTrackingApi.getComments.mockResolvedValue(mockComments);

    const result = await getWorkItemComments(mockConnection, 100);

    expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalled();
    expect(mockWorkItemTrackingApi.getComments).toHaveBeenCalledWith(
      '',
      100,
      200,
      undefined,
      false,
      undefined,
      CommentSortOrder.Asc,
    );
    expect(result).toEqual(mockComments);
  });

  it('should throw AzureDevOpsResourceNotFoundError when comments are not found', async () => {
    mockWorkItemTrackingApi.getComments.mockResolvedValue(
      undefined as unknown as CommentList,
    );

    await expect(getWorkItemComments(mockConnection, 100)).rejects.toThrow(
      AzureDevOpsResourceNotFoundError,
    );
  });

  it('should throw AzureDevOpsError when API call fails', async () => {
    const error = new Error('API error');
    mockWorkItemTrackingApi.getComments.mockRejectedValue(error);

    await expect(getWorkItemComments(mockConnection, 100)).rejects.toThrow(
      AzureDevOpsError,
    );
  });

  it('should use provided parameters', async () => {
    const mockComments: CommentList = {
      totalCount: 1,
      count: 1,
      comments: [],
    };

    mockWorkItemTrackingApi.getComments.mockResolvedValue(mockComments);

    await getWorkItemComments(
      mockConnection,
      100,
      'project1',
      50,
      'token1',
      true,
      CommentExpandOptions.All,
      CommentSortOrder.Desc,
    );

    expect(mockWorkItemTrackingApi.getComments).toHaveBeenCalledWith(
      'project1',
      100,
      50,
      'token1',
      true,
      CommentExpandOptions.All,
      CommentSortOrder.Desc,
    );
  });

  it('should handle empty comments array', async () => {
    const mockComments: CommentList = {
      totalCount: 0,
      count: 0,
      comments: [],
    };

    mockWorkItemTrackingApi.getComments.mockResolvedValue(mockComments);

    const result = await getWorkItemComments(mockConnection, 100);
    expect(result.comments).toHaveLength(0);
  });

  it('should handle pagination with continuation token', async () => {
    const mockComments: CommentList = {
      totalCount: 2,
      count: 1,
      comments: [
        {
          id: 1,
          workItemId: 100,
          text: 'Test comment',
          url: 'http://test.com',
          createdBy: {
            id: 'user1',
            displayName: 'User 1',
          },
          createdDate: new Date(),
        },
      ],
      continuationToken: 'next-page',
    };

    mockWorkItemTrackingApi.getComments.mockResolvedValue(mockComments);

    const result = await getWorkItemComments(mockConnection, 100, undefined, 1);
    expect(result.continuationToken).toBe('next-page');
  });

  it('should handle expand options', async () => {
    const mockComments: CommentList = {
      totalCount: 1,
      count: 1,
      comments: [
        {
          id: 1,
          workItemId: 100,
          text: 'Test comment',
          url: 'http://test.com',
          createdBy: {
            id: 'user1',
            displayName: 'User 1',
          },
          createdDate: new Date(),
          reactions: [
            {
              type: CommentReactionType.Like,
              count: 1,
            },
          ],
        },
      ],
    };

    mockWorkItemTrackingApi.getComments.mockResolvedValue(mockComments);

    const result = await getWorkItemComments(
      mockConnection,
      100,
      undefined,
      undefined,
      undefined,
      undefined,
      CommentExpandOptions.All,
    );

    const comments = result.comments || [];
    expect(comments[0]?.reactions).toBeDefined();
  });
});
