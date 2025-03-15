import { WebApi } from 'azure-devops-node-api';
import { WorkItem, WorkItemQueryResult, QueryType, WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { AzureDevOpsAuthenticationError, AzureDevOpsResourceNotFoundError } from '../../../src/common/errors';

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
}); 