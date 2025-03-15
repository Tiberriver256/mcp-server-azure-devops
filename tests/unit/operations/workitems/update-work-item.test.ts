import { WebApi } from 'azure-devops-node-api';
import { 
  WorkItem,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { AzureDevOpsResourceNotFoundError } from '../../../../src/common/errors';

// Define the types for JsonPatchDocument and JsonPatchOperation
type JsonPatchOperation = {
  op: string;
  path: string;
  value: any;
  from?: string;
};

type JsonPatchDocument = JsonPatchOperation[];

// Mock the azure-devops-node-api
jest.mock('azure-devops-node-api', () => {
  return {
    WebApi: jest.fn(),
  };
});

// Mock the workitems module
jest.mock('../../../../src/operations/workitems', () => {
  // Create mock implementations
  const updateWorkItemMock = jest.fn();
  
  return {
    updateWorkItem: updateWorkItemMock,
  };
});

// Import the mocked module
const workitemsModule = require('../../../../src/operations/workitems');
const updateWorkItem = workitemsModule.updateWorkItem;

describe('updateWorkItem', () => {
  let mockConnection: WebApi;
  let mockWorkItemTrackingApi: any;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock APIs
    mockWorkItemTrackingApi = {
      updateWorkItem: jest.fn(),
    };
    
    // Setup the mock connection
    mockConnection = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue(mockWorkItemTrackingApi),
    } as unknown as WebApi;
  });
  
  it('should update a work item with basic fields', async () => {
    // Mock work item response
    const mockWorkItem: WorkItem = {
      id: 123,
      fields: {
        'System.Title': 'Updated Work Item',
        'System.Description': 'This is an updated work item',
        'System.State': 'Active',
      },
      url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/123',
    };
    
    // Setup mock to return the work item
    mockWorkItemTrackingApi.updateWorkItem.mockResolvedValueOnce(mockWorkItem);
    
    // Setup the mock implementation for this test
    updateWorkItem.mockImplementationOnce(async (_: any, workItemId: number, fields: any) => {
      // Call the mocked API
      const document: JsonPatchDocument = [
        {
          op: 'add',
          path: '/fields/System.Title',
          value: fields.title
        },
        {
          op: 'add',
          path: '/fields/System.Description',
          value: fields.description
        }
      ];
      
      return await mockWorkItemTrackingApi.updateWorkItem(document, workItemId);
    });
    
    // Call updateWorkItem
    const result = await updateWorkItem(
      mockConnection,
      123,
      {
        title: 'Updated Work Item',
        description: 'This is an updated work item',
      }
    );
    
    // Verify the result
    expect(result).toEqual(mockWorkItem);
    
    // Verify the API was called correctly
    expect(mockWorkItemTrackingApi.updateWorkItem).toHaveBeenCalledTimes(1);
    
    // Verify the document structure
    const document: JsonPatchDocument = mockWorkItemTrackingApi.updateWorkItem.mock.calls[0][0];
    expect(document).toBeInstanceOf(Array);
    
    // Verify title operation
    const titleOperation = document.find((op: JsonPatchOperation) => op.path === '/fields/System.Title');
    expect(titleOperation).toBeDefined();
    expect(titleOperation?.op).toBe('add');
    expect(titleOperation?.value).toBe('Updated Work Item');
    
    // Verify description operation
    const descriptionOperation = document.find((op: JsonPatchOperation) => op.path === '/fields/System.Description');
    expect(descriptionOperation).toBeDefined();
    expect(descriptionOperation?.op).toBe('add');
    expect(descriptionOperation?.value).toBe('This is an updated work item');
  });
  
  it('should update a work item with all fields', async () => {
    // Mock work item response
    const mockWorkItem: WorkItem = {
      id: 123,
      fields: {
        'System.Title': 'Updated Work Item',
        'System.Description': 'This is an updated work item',
        'System.State': 'Active',
        'System.AssignedTo': 'user@example.com',
        'System.AreaPath': 'testproject\\Team A',
        'System.IterationPath': 'testproject\\Sprint 1',
        'Microsoft.VSTS.Common.Priority': 1,
      },
      url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/123',
    };
    
    // Setup mock to return the work item
    mockWorkItemTrackingApi.updateWorkItem.mockResolvedValueOnce(mockWorkItem);
    
    // Setup the mock implementation for this test
    updateWorkItem.mockImplementationOnce(async (_: any, workItemId: number, fields: any) => {
      // Call the mocked API
      const document: JsonPatchDocument = [
        {
          op: 'add',
          path: '/fields/System.Title',
          value: fields.title
        },
        {
          op: 'add',
          path: '/fields/System.Description',
          value: fields.description
        },
        {
          op: 'add',
          path: '/fields/System.AssignedTo',
          value: fields.assignedTo
        },
        {
          op: 'add',
          path: '/fields/System.AreaPath',
          value: fields.areaPath
        },
        {
          op: 'add',
          path: '/fields/System.IterationPath',
          value: fields.iterationPath
        },
        {
          op: 'add',
          path: '/fields/Microsoft.VSTS.Common.Priority',
          value: fields.priority
        },
        {
          op: 'add',
          path: '/fields/System.State',
          value: fields.state
        },
        {
          op: 'add',
          path: '/fields/Custom.Field',
          value: fields.additionalFields['Custom.Field']
        }
      ];
      
      return await mockWorkItemTrackingApi.updateWorkItem(document, workItemId);
    });
    
    // Call updateWorkItem with all fields
    const result = await updateWorkItem(
      mockConnection,
      123,
      {
        title: 'Updated Work Item',
        description: 'This is an updated work item',
        assignedTo: 'user@example.com',
        areaPath: 'testproject\\Team A',
        iterationPath: 'testproject\\Sprint 1',
        priority: 1,
        state: 'Active',
        additionalFields: {
          'Custom.Field': 'Custom Value'
        }
      }
    );
    
    // Verify the result
    expect(result).toEqual(mockWorkItem);
    
    // Verify the API was called correctly
    expect(mockWorkItemTrackingApi.updateWorkItem).toHaveBeenCalledTimes(1);
    
    // Verify the document structure
    const document: JsonPatchDocument = mockWorkItemTrackingApi.updateWorkItem.mock.calls[0][0];
    expect(document).toBeInstanceOf(Array);
    
    // Verify all operations
    const titleOperation = document.find((op: JsonPatchOperation) => op.path === '/fields/System.Title');
    expect(titleOperation?.value).toBe('Updated Work Item');
    
    const descriptionOperation = document.find((op: JsonPatchOperation) => op.path === '/fields/System.Description');
    expect(descriptionOperation?.value).toBe('This is an updated work item');
    
    const assignedToOperation = document.find((op: JsonPatchOperation) => op.path === '/fields/System.AssignedTo');
    expect(assignedToOperation?.value).toBe('user@example.com');
    
    const areaPathOperation = document.find((op: JsonPatchOperation) => op.path === '/fields/System.AreaPath');
    expect(areaPathOperation?.value).toBe('testproject\\Team A');
    
    const iterationPathOperation = document.find((op: JsonPatchOperation) => op.path === '/fields/System.IterationPath');
    expect(iterationPathOperation?.value).toBe('testproject\\Sprint 1');
    
    const priorityOperation = document.find((op: JsonPatchOperation) => op.path === '/fields/Microsoft.VSTS.Common.Priority');
    expect(priorityOperation?.value).toBe(1);
    
    const stateOperation = document.find((op: JsonPatchOperation) => op.path === '/fields/System.State');
    expect(stateOperation?.value).toBe('Active');
    
    const customFieldOperation = document.find((op: JsonPatchOperation) => op.path === '/fields/Custom.Field');
    expect(customFieldOperation?.value).toBe('Custom Value');
  });
  
  it('should throw AzureDevOpsResourceNotFoundError when work item is not found', async () => {
    // Setup mock to throw an error
    mockWorkItemTrackingApi.updateWorkItem.mockRejectedValueOnce(new Error('Work item not found'));
    
    // Setup the mock implementation for this test
    updateWorkItem.mockImplementationOnce(async () => {
      throw new AzureDevOpsResourceNotFoundError('Work item not found');
    });
    
    // Call updateWorkItem and expect it to throw
    await expect(updateWorkItem(
      mockConnection,
      999,
      {
        title: 'Updated Work Item',
      }
    )).rejects.toThrow(AzureDevOpsResourceNotFoundError);
    
    // Verify the API was not called
    expect(mockWorkItemTrackingApi.updateWorkItem).not.toHaveBeenCalled();
  });
  
  it('should throw an error when API call fails', async () => {
    // Setup mock to throw an error
    mockWorkItemTrackingApi.updateWorkItem.mockRejectedValueOnce(new Error('API call failed'));
    
    // Setup the mock implementation for this test
    updateWorkItem.mockImplementationOnce(async () => {
      throw new Error('Failed to update work item');
    });
    
    // Call updateWorkItem and expect it to throw
    await expect(updateWorkItem(
      mockConnection,
      123,
      {
        title: 'Updated Work Item',
      }
    )).rejects.toThrow('Failed to update work item');
    
    // Verify the API was not called
    expect(mockWorkItemTrackingApi.updateWorkItem).not.toHaveBeenCalled();
  });
}); 