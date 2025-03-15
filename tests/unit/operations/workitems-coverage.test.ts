import { WebApi } from 'azure-devops-node-api';
import { WorkItem, WorkItemQueryResult, QueryType, WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { AzureDevOpsAuthenticationError, AzureDevOpsResourceNotFoundError } from '../../../src/common/errors';
import * as workitems from '../../../src/operations/workitems';

describe('Work Items Operations Coverage Tests', () => {
  let mockConnection: WebApi;
  let mockWorkItemTrackingApi: any;
  let mockCoreApi: any;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock APIs
    mockWorkItemTrackingApi = {
      getWorkItem: jest.fn(),
      getWorkItems: jest.fn(),
      queryById: jest.fn(),
      queryByWiql: jest.fn(),
      getQueries: jest.fn(),
      createWorkItem: jest.fn(),
    };
    
    mockCoreApi = {
      getTeams: jest.fn(),
    };
    
    // Setup the mock connection
    mockConnection = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue(mockWorkItemTrackingApi),
      getCoreApi: jest.fn().mockResolvedValue(mockCoreApi),
    } as unknown as WebApi;
  });
  
  describe('listWorkItems', () => {
    it('should handle pagination with top and skip parameters', async () => {
      // Import the actual module
      const { listWorkItems } = require('../../../src/operations/workitems');
      
      // Mock query result with work item references
      const mockQueryResult: WorkItemQueryResult = {
        queryType: QueryType.Flat,
        asOf: new Date(),
        columns: [],
        workItems: [
          { id: 123, url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/123' },
          { id: 456, url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/456' },
          { id: 789, url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/789' },
        ],
      };
      
      // Mock work items response
      const mockWorkItems: WorkItem[] = [
        {
          id: 456,
          fields: {
            'System.Title': 'Test Work Item 2',
            'System.State': 'Closed',
          },
          url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/456',
        },
        {
          id: 789,
          fields: {
            'System.Title': 'Test Work Item 3',
            'System.State': 'Active',
          },
          url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/789',
        },
      ];
      
      mockWorkItemTrackingApi.queryByWiql.mockResolvedValueOnce(mockQueryResult);
      mockWorkItemTrackingApi.getWorkItems.mockResolvedValueOnce(mockWorkItems);
      
      // Call listWorkItems with pagination parameters
      const result = await listWorkItems(mockConnection, {
        projectId: 'test-project',
        wiql: 'SELECT * FROM WorkItems',
        top: 2,
        skip: 1
      });
      
      // Verify the result
      expect(result).toEqual(mockWorkItems);
      expect(mockWorkItemTrackingApi.queryByWiql).toHaveBeenCalledWith(
        { query: 'SELECT * FROM WorkItems' },
        { project: 'test-project', team: undefined }
      );
    });
    
    it('should handle empty work items array from getWorkItems', async () => {
      // Import the actual module
      const { listWorkItems } = require('../../../src/operations/workitems');
      
      // Mock query result with work item references
      const mockQueryResult: WorkItemQueryResult = {
        queryType: QueryType.Flat,
        asOf: new Date(),
        columns: [],
        workItems: [
          { id: 123, url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/123' },
        ],
      };
      
      mockWorkItemTrackingApi.queryByWiql.mockResolvedValueOnce(mockQueryResult);
      mockWorkItemTrackingApi.getWorkItems.mockResolvedValueOnce([]);
      
      // Call listWorkItems
      const result = await listWorkItems(mockConnection, {
        projectId: 'test-project',
        wiql: 'SELECT * FROM WorkItems'
      });
      
      // Verify the result
      expect(result).toEqual([]);
    });
    
    it('should handle error in getWorkItems', async () => {
      // Import the actual module
      const { listWorkItems } = require('../../../src/operations/workitems');
      
      // Mock query result with work item references
      const mockQueryResult: WorkItemQueryResult = {
        queryType: QueryType.Flat,
        asOf: new Date(),
        columns: [],
        workItems: [
          { id: 123, url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/123' },
        ],
      };
      
      mockWorkItemTrackingApi.queryByWiql.mockResolvedValueOnce(mockQueryResult);
      mockWorkItemTrackingApi.getWorkItems.mockRejectedValueOnce(new Error('Failed to get work items'));
      
      // Call listWorkItems
      await expect(listWorkItems(mockConnection, {
        projectId: 'test-project',
        wiql: 'SELECT * FROM WorkItems'
      })).rejects.toThrow('Failed to get work items');
    });

    it('should throw AzureDevOpsAuthenticationError when authentication fails', async () => {
      // Import the actual module
      const { listWorkItems } = require('../../../src/operations/workitems');
      
      mockWorkItemTrackingApi.queryByWiql.mockRejectedValueOnce(new AzureDevOpsAuthenticationError('Authentication failed'));
      
      // Call listWorkItems
      await expect(listWorkItems(mockConnection, {
        projectId: 'test-project',
        wiql: 'SELECT * FROM WorkItems'
      })).rejects.toThrow(AzureDevOpsAuthenticationError);
    });

    it('should throw AzureDevOpsResourceNotFoundError when project is not found', async () => {
      // Import the actual module
      const { listWorkItems } = require('../../../src/operations/workitems');
      
      mockWorkItemTrackingApi.queryByWiql.mockRejectedValueOnce(new AzureDevOpsResourceNotFoundError('Project not found'));
      
      // Call listWorkItems
      await expect(listWorkItems(mockConnection, {
        projectId: 'non-existent-project',
        wiql: 'SELECT * FROM WorkItems'
      })).rejects.toThrow(AzureDevOpsResourceNotFoundError);
    });
  });
  
  describe('getWorkItem', () => {
    it('should expand work item fields when expand parameter is provided', async () => {
      // Import the actual module
      const { getWorkItem } = require('../../../src/operations/workitems');
      
      // Mock work item response
      const mockWorkItem: WorkItem = {
        id: 123,
        fields: {
          'System.Title': 'Test Work Item',
          'System.Description': 'This is a test work item',
          'System.State': 'Active',
        },
        url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/123',
      };
      
      mockWorkItemTrackingApi.getWorkItem.mockResolvedValueOnce(mockWorkItem);
      
      // Call getWorkItem with expand parameter
      await getWorkItem(mockConnection, 123, WorkItemExpand.All);
      
      // Verify that the API was called with the expand parameter
      expect(mockWorkItemTrackingApi.getWorkItem).toHaveBeenCalledWith(
        123,
        [
          'System.Id',
          'System.Title',
          'System.State',
          'System.AssignedTo',
        ],
        undefined,
        WorkItemExpand.All
      );
    });
    
    it('should handle error in getWorkItem', async () => {
      // Import the actual module
      const { getWorkItem } = require('../../../src/operations/workitems');
      
      mockWorkItemTrackingApi.getWorkItem.mockRejectedValueOnce(new Error('Failed to get work item'));
      
      // Call getWorkItem
      await expect(getWorkItem(mockConnection, 123)).rejects.toThrow('Failed to get work item');
    });

    it('should throw AzureDevOpsResourceNotFoundError when work item is not found', async () => {
      // Import the actual module
      const { getWorkItem } = require('../../../src/operations/workitems');
      
      mockWorkItemTrackingApi.getWorkItem.mockRejectedValueOnce(new AzureDevOpsResourceNotFoundError('Work item not found'));
      
      // Call getWorkItem
      await expect(getWorkItem(mockConnection, 999)).rejects.toThrow(AzureDevOpsResourceNotFoundError);
    });

    it('should throw AzureDevOpsAuthenticationError when authentication fails', async () => {
      // Import the actual module
      const { getWorkItem } = require('../../../src/operations/workitems');
      
      mockWorkItemTrackingApi.getWorkItem.mockRejectedValueOnce(new AzureDevOpsAuthenticationError('Authentication failed'));
      
      // Call getWorkItem
      await expect(getWorkItem(mockConnection, 123)).rejects.toThrow(AzureDevOpsAuthenticationError);
    });
  });

  describe('createWorkItem', () => {
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
      
      // Call createWorkItem
      const result = await workitems.createWorkItem(
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
      const document = mockWorkItemTrackingApi.createWorkItem.mock.calls[0][0];
      expect(document).toBeInstanceOf(Array);
      
      // Verify title operation
      const titleOperation = document.find((op: any) => op.path === '/fields/System.Title');
      expect(titleOperation).toBeDefined();
      expect(titleOperation?.op).toBe('add');
      expect(titleOperation?.value).toBe('Test Work Item');
      
      // Verify description operation
      const descriptionOperation = document.find((op: any) => op.path === '/fields/System.Description');
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
      
      // Call createWorkItem with all fields
      const result = await workitems.createWorkItem(
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
      const document = mockWorkItemTrackingApi.createWorkItem.mock.calls[0][0];
      expect(document).toBeInstanceOf(Array);
      
      // Verify all operations
      const titleOperation = document.find((op: any) => op.path === '/fields/System.Title');
      expect(titleOperation?.value).toBe('Test Work Item');
      
      const descriptionOperation = document.find((op: any) => op.path === '/fields/System.Description');
      expect(descriptionOperation?.value).toBe('This is a test work item');
      
      const assignedToOperation = document.find((op: any) => op.path === '/fields/System.AssignedTo');
      expect(assignedToOperation?.value).toBe('user@example.com');
      
      const areaPathOperation = document.find((op: any) => op.path === '/fields/System.AreaPath');
      expect(areaPathOperation?.value).toBe('testproject\\Team A');
      
      const iterationPathOperation = document.find((op: any) => op.path === '/fields/System.IterationPath');
      expect(iterationPathOperation?.value).toBe('testproject\\Sprint 1');
      
      const priorityOperation = document.find((op: any) => op.path === '/fields/Microsoft.VSTS.Common.Priority');
      expect(priorityOperation?.value).toBe(1);
      
      const customFieldOperation = document.find((op: any) => op.path === '/fields/Custom.Field');
      expect(customFieldOperation?.value).toBe('Custom Value');
    });
    
    it('should throw error when title is missing', async () => {
      // Call createWorkItem with missing title
      await expect(workitems.createWorkItem(
        mockConnection,
        'testproject',
        'Task',
        {
          description: 'This is a test work item',
        } as any // Type assertion to bypass TypeScript check
      )).rejects.toThrow('Title is required');
    });
    
    it('should throw error when createWorkItem API call fails', async () => {
      // Setup mock to throw an error
      mockWorkItemTrackingApi.createWorkItem.mockRejectedValueOnce(new Error('API call failed'));
      
      // Call createWorkItem and expect it to throw
      await expect(workitems.createWorkItem(
        mockConnection,
        'testproject',
        'Task',
        {
          title: 'Test Work Item',
          description: 'This is a test work item',
        }
      )).rejects.toThrow('Failed to create work item');
    });
    
    it('should throw error when work item is null', async () => {
      // Setup mock to return null
      mockWorkItemTrackingApi.createWorkItem.mockResolvedValueOnce(null);
      
      // Call createWorkItem and expect it to throw
      await expect(workitems.createWorkItem(
        mockConnection,
        'testproject',
        'Task',
        {
          title: 'Test Work Item',
          description: 'This is a test work item',
        }
      )).rejects.toThrow('Failed to create work item');
    });
  });
}); 