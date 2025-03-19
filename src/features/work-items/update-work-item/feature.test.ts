import { WebApi } from 'azure-devops-node-api';
import {
  WorkItem,
  WorkItemExpand,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsError,
} from '../../../shared/errors';
import { updateWorkItem } from './feature';
import { UpdateWorkItemOptions } from '../types';

// Mock WebApi
jest.mock('azure-devops-node-api');

describe('updateWorkItem', () => {
  let mockConnection: jest.Mocked<WebApi>;
  let mockWitApi: any;

  const mockWorkItem: WorkItem = {
    id: 123,
    rev: 2,
    fields: {
      'System.Id': 123,
      'System.Title': 'Updated Work Item',
      'System.State': 'Active',
    },
    url: 'https://dev.azure.com/test/project/_apis/wit/workItems/123',
  };

  beforeEach(() => {
    mockWitApi = {
      updateWorkItem: jest.fn(),
    };

    // @ts-ignore - Ignoring type checking for the mock
    mockConnection = new WebApi('', {});
    mockConnection.getWorkItemTrackingApi = jest
      .fn()
      .mockResolvedValue(mockWitApi);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should update a work item with the provided fields', async () => {
    mockWitApi.updateWorkItem.mockResolvedValue(mockWorkItem);

    const options: UpdateWorkItemOptions = {
      title: 'Updated Work Item',
      state: 'Active',
    };

    const workItem = await updateWorkItem(mockConnection, 123, options);

    expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalled();
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledWith(
      {},
      [
        {
          op: 'add',
          path: '/fields/System.Title',
          value: 'Updated Work Item',
        },
        {
          op: 'add',
          path: '/fields/System.State',
          value: 'Active',
        },
      ],
      123,
      undefined,
      false,
      false,
      false,
      WorkItemExpand.All,
    );

    expect(workItem).toEqual(mockWorkItem);
  });

  it('should include all optional fields when provided', async () => {
    mockWitApi.updateWorkItem.mockResolvedValue(mockWorkItem);

    const options: UpdateWorkItemOptions = {
      title: 'Updated Work Item',
      description: 'Updated Description',
      assignedTo: 'user@example.com',
      areaPath: 'TestProject\\Area',
      iterationPath: 'TestProject\\Iteration1',
      priority: 1,
      state: 'Active',
      additionalFields: {
        'Custom.Field': 'Custom Value',
      },
    };

    await updateWorkItem(mockConnection, 123, options);

    const expectedDocument = [
      {
        op: 'add',
        path: '/fields/System.Title',
        value: 'Updated Work Item',
      },
      {
        op: 'add',
        path: '/fields/System.Description',
        value: 'Updated Description',
      },
      {
        op: 'add',
        path: '/fields/System.AssignedTo',
        value: 'user@example.com',
      },
      {
        op: 'add',
        path: '/fields/System.AreaPath',
        value: 'TestProject\\Area',
      },
      {
        op: 'add',
        path: '/fields/System.IterationPath',
        value: 'TestProject\\Iteration1',
      },
      {
        op: 'add',
        path: '/fields/Microsoft.VSTS.Common.Priority',
        value: 1,
      },
      {
        op: 'add',
        path: '/fields/System.State',
        value: 'Active',
      },
      {
        op: 'add',
        path: '/fields/Custom.Field',
        value: 'Custom Value',
      },
    ];

    expect(mockWitApi.updateWorkItem).toHaveBeenCalledWith(
      {},
      expectedDocument,
      123,
      undefined,
      false,
      false,
      false,
      WorkItemExpand.All,
    );
  });

  it('should throw an error when no fields are provided for update', async () => {
    await expect(updateWorkItem(mockConnection, 123, {})).rejects.toThrow(
      'At least one field must be provided for update',
    );
  });

  it('should throw AzureDevOpsResourceNotFoundError when work item is not found', async () => {
    mockWitApi.updateWorkItem.mockResolvedValue(null);

    await expect(
      updateWorkItem(mockConnection, 123, { title: 'Updated Work Item' }),
    ).rejects.toThrow(
      new AzureDevOpsResourceNotFoundError("Work item '123' not found"),
    );
  });

  it('should throw an error when the API call fails', async () => {
    const error = new Error('API error');
    mockWitApi.updateWorkItem.mockRejectedValue(error);

    await expect(
      updateWorkItem(mockConnection, 123, { title: 'Updated Work Item' }),
    ).rejects.toThrow('Failed to update work item: API error');
  });

  it('should pass through AzureDevOpsError', async () => {
    const error = new AzureDevOpsError('Custom error');
    mockWitApi.updateWorkItem.mockRejectedValue(error);

    await expect(
      updateWorkItem(mockConnection, 123, { title: 'Updated Work Item' }),
    ).rejects.toThrow(error);
  });
});
