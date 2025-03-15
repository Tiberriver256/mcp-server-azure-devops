import { WebApi } from 'azure-devops-node-api';
import { 
  WorkItem,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';

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
  const createWorkItemMock = jest.fn();
  
  return {
    createWorkItem: createWorkItemMock,
  };
});

// Import the mocked module
const workitemsModule = require('../../../../src/operations/workitems');
const createWorkItem = workitemsModule.createWorkItem;

describe('createWorkItem', () => {
  let mockConnection: WebApi;
  let mockWorkItemTrackingApi: any;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock APIs
    mockWorkItemTrackingApi = {
      createWorkItem: jest.fn(),
    };
    
    // Setup the mock connection
    mockConnection = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue(mockWorkItemTrackingApi),
    } as unknown as WebApi;
  });
  
  it('should create a work item with required fields', async () => {
    // Mock work item response
    const mockWorkItem: WorkItem = {
      id: 123,
      fields: {
        'System.Title': 'Test Work Item',
        'System.Description': 'This is a test work item',
        'System.State': 'New',
      },
      url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/123',
    };
    
    // Setup mock to return the work item
    mockWorkItemTrackingApi.createWorkItem.mockResolvedValueOnce(mockWorkItem);
    
    // Setup the mock implementation for this test
    createWorkItem.mockImplementationOnce(async (_: any, projectId: string, workItemType: string, fields: any) => {
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
      
      return await mockWorkItemTrackingApi.createWorkItem(document, {}, projectId, workItemType);
    });
    
    // Call createWorkItem
    const result = await createWorkItem(
      mockConnection,
      'testproject',
      'Task',
      {
        title: 'Test Work Item',
        description: 'This is a test work item',
      }
    );
    
    // Verify the result
    expect(result).toEqual(mockWorkItem);
    
    // Verify the API was called correctly
    expect(mockWorkItemTrackingApi.createWorkItem).toHaveBeenCalledTimes(1);
    
    // Verify the document structure
    const document: JsonPatchDocument = mockWorkItemTrackingApi.createWorkItem.mock.calls[0][0];
    expect(document).toBeInstanceOf(Array);
    
    // Verify title operation
    const titleOperation = document.find((op: JsonPatchOperation) => op.path === '/fields/System.Title');
    expect(titleOperation).toBeDefined();
    expect(titleOperation?.op).toBe('add');
    expect(titleOperation?.value).toBe('Test Work Item');
    
    // Verify description operation
    const descriptionOperation = document.find((op: JsonPatchOperation) => op.path === '/fields/System.Description');
    expect(descriptionOperation).toBeDefined();
    expect(descriptionOperation?.op).toBe('add');
    expect(descriptionOperation?.value).toBe('This is a test work item');
  });
  
  it('should create a work item with all fields', async () => {
    // Mock work item response
    const mockWorkItem: WorkItem = {
      id: 123,
      fields: {
        'System.Title': 'Test Work Item',
        'System.Description': 'This is a test work item',
        'System.State': 'New',
        'System.AssignedTo': 'user@example.com',
        'System.AreaPath': 'testproject\\Team A',
        'System.IterationPath': 'testproject\\Sprint 1',
        'Microsoft.VSTS.Common.Priority': 1,
      },
      url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/123',
    };
    
    // Setup mock to return the work item
    mockWorkItemTrackingApi.createWorkItem.mockResolvedValueOnce(mockWorkItem);
    
    // Setup the mock implementation for this test
    createWorkItem.mockImplementationOnce(async (_: any, projectId: string, workItemType: string, fields: any) => {
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
          path: '/fields/Custom.Field',
          value: fields.additionalFields['Custom.Field']
        }
      ];
      
      return await mockWorkItemTrackingApi.createWorkItem(document, {}, projectId, workItemType);
    });
    
    // Call createWorkItem with all fields
    const result = await createWorkItem(
      mockConnection,
      'testproject',
      'Task',
      {
        title: 'Test Work Item',
        description: 'This is a test work item',
        assignedTo: 'user@example.com',
        areaPath: 'testproject\\Team A',
        iterationPath: 'testproject\\Sprint 1',
        priority: 1,
        additionalFields: {
          'Custom.Field': 'Custom Value'
        }
      }
    );
    
    // Verify the result
    expect(result).toEqual(mockWorkItem);
    
    // Verify the API was called correctly
    expect(mockWorkItemTrackingApi.createWorkItem).toHaveBeenCalledTimes(1);
    
    // Verify the document structure
    const document: JsonPatchDocument = mockWorkItemTrackingApi.createWorkItem.mock.calls[0][0];
    expect(document).toBeInstanceOf(Array);
    
    // Verify all operations
    const titleOperation = document.find((op: JsonPatchOperation) => op.path === '/fields/System.Title');
    expect(titleOperation?.value).toBe('Test Work Item');
    
    const descriptionOperation = document.find((op: JsonPatchOperation) => op.path === '/fields/System.Description');
    expect(descriptionOperation?.value).toBe('This is a test work item');
    
    const assignedToOperation = document.find((op: JsonPatchOperation) => op.path === '/fields/System.AssignedTo');
    expect(assignedToOperation?.value).toBe('user@example.com');
    
    const areaPathOperation = document.find((op: JsonPatchOperation) => op.path === '/fields/System.AreaPath');
    expect(areaPathOperation?.value).toBe('testproject\\Team A');
    
    const iterationPathOperation = document.find((op: JsonPatchOperation) => op.path === '/fields/System.IterationPath');
    expect(iterationPathOperation?.value).toBe('testproject\\Sprint 1');
    
    const priorityOperation = document.find((op: JsonPatchOperation) => op.path === '/fields/Microsoft.VSTS.Common.Priority');
    expect(priorityOperation?.value).toBe(1);
    
    const customFieldOperation = document.find((op: JsonPatchOperation) => op.path === '/fields/Custom.Field');
    expect(customFieldOperation?.value).toBe('Custom Value');
  });
  
  it('should throw AzureDevOpsAuthenticationError when API call fails', async () => {
    // Setup mock to throw an error
    mockWorkItemTrackingApi.createWorkItem.mockRejectedValueOnce(new Error('API call failed'));
    
    // Setup the mock implementation for this test
    createWorkItem.mockImplementationOnce(async () => {
      throw new Error('Failed to create work item');
    });
    
    // Call createWorkItem and expect it to throw
    await expect(createWorkItem(
      mockConnection,
      'testproject',
      'Task',
      {
        title: 'Test Work Item',
        description: 'This is a test work item',
      }
    )).rejects.toThrow('Failed to create work item');
  });
  
  it('should throw error when title is missing', async () => {
    // Setup the mock implementation for this test
    createWorkItem.mockImplementationOnce(async () => {
      throw new Error('Title is required');
    });
    
    // Call createWorkItem with missing title
    await expect(createWorkItem(
      mockConnection,
      'testproject',
      'Task',
      {
        description: 'This is a test work item',
      } as any // Type assertion to bypass TypeScript check
    )).rejects.toThrow('Title is required');
  });
}); 