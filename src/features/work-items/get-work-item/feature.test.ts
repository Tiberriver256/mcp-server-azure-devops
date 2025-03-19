import { WebApi } from 'azure-devops-node-api';
import {
  WorkItem,
  WorkItemExpand,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
} from '../../../shared/errors';
import { getWorkItem } from './feature';

// Mock WebApi
jest.mock('azure-devops-node-api');

describe('getWorkItem', () => {
  let mockConnection: jest.Mocked<WebApi>;
  let mockWorkItemTrackingApi: any;

  const mockWorkItem: WorkItem = {
    id: 123,
    fields: {
      'System.Title': 'Test Work Item',
      'System.Description': 'A test work item',
      'System.State': 'Active',
    },
    url: 'https://dev.azure.com/test/project1/_apis/wit/workItems/123',
  };

  beforeEach(() => {
    mockWorkItemTrackingApi = {
      getWorkItem: jest.fn(),
    };

    // @ts-ignore - Ignoring type checking for the mock
    mockConnection = new WebApi('', {});
    mockConnection.getWorkItemTrackingApi = jest
      .fn()
      .mockResolvedValue(mockWorkItemTrackingApi);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should get a work item by id', async () => {
    mockWorkItemTrackingApi.getWorkItem.mockResolvedValue(mockWorkItem);

    const workItem = await getWorkItem(mockConnection, 123);

    expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalled();
    expect(mockWorkItemTrackingApi.getWorkItem).toHaveBeenCalled();
    expect(workItem).toEqual(mockWorkItem);
  });

  it('should pass expansion options when provided', async () => {
    mockWorkItemTrackingApi.getWorkItem.mockResolvedValue(mockWorkItem);

    await getWorkItem(mockConnection, 123, WorkItemExpand.All);

    expect(mockWorkItemTrackingApi.getWorkItem).toHaveBeenCalledWith(
      123,
      expect.any(Array),
      undefined,
      WorkItemExpand.All,
    );
  });

  it('should throw AzureDevOpsResourceNotFoundError when work item is not found', async () => {
    mockWorkItemTrackingApi.getWorkItem.mockResolvedValue(null);

    await expect(getWorkItem(mockConnection, 999)).rejects.toThrow(
      AzureDevOpsResourceNotFoundError,
    );
  });

  it('should throw an error when the API call fails', async () => {
    const error = new Error('API error');
    mockWorkItemTrackingApi.getWorkItem.mockRejectedValue(error);

    await expect(getWorkItem(mockConnection, 123)).rejects.toThrow(
      'Failed to get work item: API error',
    );
  });

  it('should pass through AzureDevOpsError', async () => {
    const error = new AzureDevOpsError('Custom error');
    mockWorkItemTrackingApi.getWorkItem.mockRejectedValue(error);

    await expect(getWorkItem(mockConnection, 123)).rejects.toThrow(error);
  });

  // Additional tests from coverage.test.ts
  it('should throw AzureDevOpsAuthenticationError when authentication fails', async () => {
    mockWorkItemTrackingApi.getWorkItem.mockRejectedValue(
      new AzureDevOpsAuthenticationError('Authentication failed'),
    );

    await expect(getWorkItem(mockConnection, 123)).rejects.toThrow(
      AzureDevOpsAuthenticationError,
    );
  });
});
