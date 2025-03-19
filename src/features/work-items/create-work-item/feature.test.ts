import { WebApi } from 'azure-devops-node-api';
import { WorkItem } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { AzureDevOpsError } from '../../../shared/errors';
import { createWorkItem } from './feature';
import { CreateWorkItemOptions } from '../types';

// Mock WebApi
jest.mock('azure-devops-node-api');

describe('createWorkItem', () => {
  let mockConnection: jest.Mocked<WebApi>;
  let mockWitApi: any;

  const mockWorkItem: WorkItem = {
    id: 123,
    rev: 1,
    fields: {
      'System.Id': 123,
      'System.Title': 'Test Work Item',
      'System.State': 'New',
    },
    url: 'https://dev.azure.com/test/project/_apis/wit/workItems/123',
  };

  const defaultOptions: CreateWorkItemOptions = {
    title: 'Test Work Item',
  };

  beforeEach(() => {
    mockWitApi = {
      createWorkItem: jest.fn(),
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

  it('should create a work item with required fields', async () => {
    mockWitApi.createWorkItem.mockResolvedValue(mockWorkItem);

    const workItem = await createWorkItem(
      mockConnection,
      'TestProject',
      'Task',
      defaultOptions,
    );

    expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalled();
    expect(mockWitApi.createWorkItem).toHaveBeenCalledWith(
      [
        {
          op: 'add',
          path: '/fields/System.Title',
          value: 'Test Work Item',
        },
      ],
      {},
      'TestProject',
      'Task',
    );

    expect(workItem).toEqual(mockWorkItem);
  });

  it('should include optional fields when provided', async () => {
    mockWitApi.createWorkItem.mockResolvedValue(mockWorkItem);

    const options: CreateWorkItemOptions = {
      title: 'Test Work Item',
      description: 'Test Description',
      assignedTo: 'user@example.com',
      areaPath: 'TestProject\\Area',
      iterationPath: 'TestProject\\Iteration1',
      priority: 1,
      additionalFields: {
        'Custom.Field': 'Custom Value',
      },
    };

    await createWorkItem(mockConnection, 'TestProject', 'Task', options);

    const expectedDocument = [
      {
        op: 'add',
        path: '/fields/System.Title',
        value: 'Test Work Item',
      },
      {
        op: 'add',
        path: '/fields/System.Description',
        value: 'Test Description',
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
        path: '/fields/Custom.Field',
        value: 'Custom Value',
      },
    ];

    expect(mockWitApi.createWorkItem).toHaveBeenCalledWith(
      expectedDocument,
      {},
      'TestProject',
      'Task',
    );
  });

  it('should throw an error when title is missing', async () => {
    await expect(
      createWorkItem(mockConnection, 'TestProject', 'Task', {
        title: '',
      } as CreateWorkItemOptions),
    ).rejects.toThrow('Title is required');
  });

  it('should throw an error when the API call fails', async () => {
    const error = new Error('API error');
    mockWitApi.createWorkItem.mockRejectedValue(error);

    await expect(
      createWorkItem(mockConnection, 'TestProject', 'Task', defaultOptions),
    ).rejects.toThrow('Failed to create work item: API error');
  });

  it('should pass through AzureDevOpsError', async () => {
    const error = new AzureDevOpsError('Custom error');
    mockWitApi.createWorkItem.mockRejectedValue(error);

    await expect(
      createWorkItem(mockConnection, 'TestProject', 'Task', defaultOptions),
    ).rejects.toThrow(error);
  });

  it('should throw an error when work item creation fails', async () => {
    mockWitApi.createWorkItem.mockResolvedValue(null);

    await expect(
      createWorkItem(mockConnection, 'TestProject', 'Task', defaultOptions),
    ).rejects.toThrow('Failed to create work item');
  });
});
