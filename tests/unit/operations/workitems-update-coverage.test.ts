import { WebApi } from 'azure-devops-node-api';
import { WorkItem, WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { updateWorkItem } from '../../../src/operations/workitems';
import { AzureDevOpsResourceNotFoundError } from '../../../src/common/errors';
import { getPersonalAccessTokenHandler } from 'azure-devops-node-api';

// Mock the azure-devops-node-api
jest.mock('azure-devops-node-api');

describe('updateWorkItem', () => {
  let mockConnection: jest.Mocked<WebApi>;
  let mockWitApi: any;

  beforeEach(() => {
    // Create mock objects
    mockWitApi = {
      updateWorkItem: jest.fn(),
    };

    // Create a mock handler and WebApi
    const mockHandler = getPersonalAccessTokenHandler('fake-token');
    mockConnection = new WebApi('https://dev.azure.com/organization', mockHandler) as jest.Mocked<WebApi>;
    mockConnection.getWorkItemTrackingApi = jest.fn().mockResolvedValue(mockWitApi);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should update a work item with minimal fields', async () => {
    // Arrange
    const mockWorkItem: WorkItem = {
      id: 123,
      fields: {
        'System.Title': 'Updated Title',
      },
    };
    mockWitApi.updateWorkItem.mockResolvedValueOnce(mockWorkItem);

    // Act
    const result = await updateWorkItem(mockConnection, 123, {
      title: 'Updated Title',
    });

    // Assert
    expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalledTimes(1);
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    
    // Verify the document structure
    const document = mockWitApi.updateWorkItem.mock.calls[0][1];
    expect(document).toHaveLength(1);
    expect(document[0]).toEqual({
      op: 'add',
      path: '/fields/System.Title',
      value: 'Updated Title',
    });
    
    expect(result).toEqual(mockWorkItem);
  });

  it('should update a work item with all standard fields', async () => {
    // Arrange
    const mockWorkItem: WorkItem = {
      id: 123,
      fields: {
        'System.Title': 'Updated Title',
        'System.Description': 'Updated Description',
        'System.AssignedTo': 'user@example.com',
        'System.AreaPath': 'Project\\Area',
        'System.IterationPath': 'Project\\Iteration',
        'Microsoft.VSTS.Common.Priority': 1,
        'System.State': 'Active',
      },
    };
    mockWitApi.updateWorkItem.mockResolvedValueOnce(mockWorkItem);

    // Act
    const result = await updateWorkItem(mockConnection, 123, {
      title: 'Updated Title',
      description: 'Updated Description',
      assignedTo: 'user@example.com',
      areaPath: 'Project\\Area',
      iterationPath: 'Project\\Iteration',
      priority: 1,
      state: 'Active',
    });

    // Assert
    expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalledTimes(1);
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    
    // Verify the document structure
    const document = mockWitApi.updateWorkItem.mock.calls[0][1];
    expect(document).toHaveLength(7);
    
    // Check that all fields are included
    expect(document).toContainEqual({
      op: 'add',
      path: '/fields/System.Title',
      value: 'Updated Title',
    });
    expect(document).toContainEqual({
      op: 'add',
      path: '/fields/System.Description',
      value: 'Updated Description',
    });
    expect(document).toContainEqual({
      op: 'add',
      path: '/fields/System.AssignedTo',
      value: 'user@example.com',
    });
    expect(document).toContainEqual({
      op: 'add',
      path: '/fields/System.AreaPath',
      value: 'Project\\Area',
    });
    expect(document).toContainEqual({
      op: 'add',
      path: '/fields/System.IterationPath',
      value: 'Project\\Iteration',
    });
    expect(document).toContainEqual({
      op: 'add',
      path: '/fields/Microsoft.VSTS.Common.Priority',
      value: 1,
    });
    expect(document).toContainEqual({
      op: 'add',
      path: '/fields/System.State',
      value: 'Active',
    });
    
    expect(result).toEqual(mockWorkItem);
  });

  it('should update a work item with additional fields', async () => {
    // Arrange
    const mockWorkItem: WorkItem = {
      id: 123,
      fields: {
        'System.Title': 'Updated Title',
        'Custom.Field1': 'Custom Value 1',
        'Custom.Field2': 42,
      },
    };
    mockWitApi.updateWorkItem.mockResolvedValueOnce(mockWorkItem);

    // Act
    const result = await updateWorkItem(mockConnection, 123, {
      title: 'Updated Title',
      additionalFields: {
        'Custom.Field1': 'Custom Value 1',
        'Custom.Field2': 42,
      },
    });

    // Assert
    expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalledTimes(1);
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    
    // Verify the document structure
    const document = mockWitApi.updateWorkItem.mock.calls[0][1];
    expect(document).toHaveLength(3);
    
    // Check that all fields are included
    expect(document).toContainEqual({
      op: 'add',
      path: '/fields/System.Title',
      value: 'Updated Title',
    });
    expect(document).toContainEqual({
      op: 'add',
      path: '/fields/Custom.Field1',
      value: 'Custom Value 1',
    });
    expect(document).toContainEqual({
      op: 'add',
      path: '/fields/Custom.Field2',
      value: 42,
    });
    
    expect(result).toEqual(mockWorkItem);
  });

  it('should throw an error when no fields are provided', async () => {
    // Act & Assert
    await expect(updateWorkItem(mockConnection, 123, {})).rejects.toThrow(
      'At least one field must be provided for update'
    );
    
    expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalledTimes(1);
    expect(mockWitApi.updateWorkItem).not.toHaveBeenCalled();
  });

  it('should throw AzureDevOpsResourceNotFoundError when work item is not found', async () => {
    // Arrange
    mockWitApi.updateWorkItem.mockResolvedValueOnce(undefined);

    // Act & Assert
    await expect(updateWorkItem(mockConnection, 999, { title: 'Updated Title' })).rejects.toThrow(
      AzureDevOpsResourceNotFoundError
    );
    
    expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalledTimes(1);
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
  });

  it('should throw an error when API call fails', async () => {
    // Arrange
    mockWitApi.updateWorkItem.mockRejectedValueOnce(new Error('API error'));

    // Act & Assert
    await expect(updateWorkItem(mockConnection, 123, { title: 'Updated Title' })).rejects.toThrow(
      'Failed to update work item: API error'
    );
    
    expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalledTimes(1);
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
  });

  it('should verify the correct parameters are passed to updateWorkItem', async () => {
    // Arrange
    const mockWorkItem: WorkItem = {
      id: 123,
      fields: {
        'System.Title': 'Updated Title',
      },
    };
    mockWitApi.updateWorkItem.mockResolvedValueOnce(mockWorkItem);

    // Act
    await updateWorkItem(mockConnection, 123, {
      title: 'Updated Title',
    });

    // Assert
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledWith(
      {}, // customHeaders
      expect.any(Array), // document
      123, // workItemId
      undefined, // project
      false, // validateOnly
      false, // bypassRules
      false, // suppressNotifications
      WorkItemExpand.All // expand
    );
  });
}); 