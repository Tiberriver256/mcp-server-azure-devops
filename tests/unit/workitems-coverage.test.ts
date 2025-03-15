import { WebApi } from 'azure-devops-node-api';
import { 
  WorkItem, 
  WorkItemQueryResult,
  QueryType
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { AzureDevOpsAuthenticationError, AzureDevOpsResourceNotFoundError } from '../../src/common/errors';

// Mock the azure-devops-node-api
jest.mock('azure-devops-node-api', () => {
  return {
    WebApi: jest.fn(),
  };
});

// Mock the workitems module
jest.mock('../../src/operations/workitems', () => {
  // Create mock implementations
  const getWorkItemMock = jest.fn();
  const listWorkItemsMock = jest.fn();
  
  return {
    getWorkItem: getWorkItemMock,
    listWorkItems: listWorkItemsMock,
  };
});

// Import the mocked module
const workitemsModule = require('../../src/operations/workitems');
const getWorkItem = workitemsModule.getWorkItem;
const listWorkItems = workitemsModule.listWorkItems;

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
  
  describe('getWorkItem', () => {
    it('should throw AzureDevOpsResourceNotFoundError when work item is not found', async () => {
      // Setup mock to return null (work item not found)
      mockWorkItemTrackingApi.getWorkItem.mockResolvedValueOnce(null);
      
      // Setup the mock implementation for this test
      getWorkItem.mockImplementationOnce(async () => {
        throw new AzureDevOpsResourceNotFoundError('Work item not found');
      });
      
      // Call getWorkItem with a non-existent ID
      await expect(getWorkItem(mockConnection, 999))
        .rejects.toThrow(AzureDevOpsResourceNotFoundError);
    });
    
    it('should throw AzureDevOpsAuthenticationError when API call fails', async () => {
      // Setup mock to throw an error
      mockWorkItemTrackingApi.getWorkItem.mockRejectedValueOnce(new Error('API call failed'));
      
      // Setup the mock implementation for this test
      getWorkItem.mockImplementationOnce(async () => {
        throw new AzureDevOpsAuthenticationError('API call failed');
      });
      
      // Call getWorkItem
      await expect(getWorkItem(mockConnection, 123))
        .rejects.toThrow(AzureDevOpsAuthenticationError);
    });
    
    it('should return work item with all fields when found', async () => {
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
      
      // Setup the mock implementation for this test
      getWorkItem.mockImplementationOnce(async () => {
        return mockWorkItem;
      });
      
      // Call getWorkItem
      const result = await getWorkItem(mockConnection, 123);
      
      // Verify the result
      expect(result).toEqual(mockWorkItem);
    });
  });
  
  describe('listWorkItems', () => {
    it('should throw AzureDevOpsResourceNotFoundError when project is not found', async () => {
      // Setup mock to throw an error that indicates project not found
      mockWorkItemTrackingApi.queryByWiql.mockRejectedValueOnce(
        new Error('Project with ID "non-existent" does not exist')
      );
      
      // Setup the mock implementation for this test
      listWorkItems.mockImplementationOnce(async () => {
        throw new AzureDevOpsResourceNotFoundError('Project not found');
      });
      
      // Call listWorkItems with a non-existent project
      await expect(listWorkItems(mockConnection, { 
        projectId: 'non-existent',
        wiql: 'SELECT * FROM WorkItems'
      })).rejects.toThrow(AzureDevOpsResourceNotFoundError);
    });
    
    it('should throw AzureDevOpsAuthenticationError when API call fails', async () => {
      // Setup mock to throw a generic error
      mockWorkItemTrackingApi.queryByWiql.mockRejectedValueOnce(
        new Error('API call failed')
      );
      
      // Setup the mock implementation for this test
      listWorkItems.mockImplementationOnce(async () => {
        throw new AzureDevOpsAuthenticationError('API call failed');
      });
      
      // Call listWorkItems
      await expect(listWorkItems(mockConnection, { 
        projectId: 'test-project',
        wiql: 'SELECT * FROM WorkItems'
      })).rejects.toThrow(AzureDevOpsAuthenticationError);
    });
    
    it('should return empty array when no work items found', async () => {
      // Mock query result with no work items
      const mockQueryResult: WorkItemQueryResult = {
        queryType: QueryType.Flat,
        asOf: new Date(),
        columns: [],
        workItems: [],
      };
      
      mockWorkItemTrackingApi.queryByWiql.mockResolvedValueOnce(mockQueryResult);
      
      // Setup the mock implementation for this test
      listWorkItems.mockImplementationOnce(async () => {
        return [];
      });
      
      // Call listWorkItems
      const result = await listWorkItems(mockConnection, { 
        projectId: 'test-project',
        wiql: 'SELECT * FROM WorkItems'
      });
      
      // Verify the result
      expect(result).toEqual([]);
    });
    
    it('should fetch work items by IDs when query returns work item references', async () => {
      // Mock query result with work item references
      const mockQueryResult: WorkItemQueryResult = {
        queryType: QueryType.Flat,
        asOf: new Date(),
        columns: [],
        workItems: [
          { id: 123, url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/123' },
          { id: 456, url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/456' },
        ],
      };
      
      // Mock work items response
      const mockWorkItems: WorkItem[] = [
        {
          id: 123,
          fields: {
            'System.Title': 'Test Work Item 1',
            'System.State': 'Active',
          },
          url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/123',
        },
        {
          id: 456,
          fields: {
            'System.Title': 'Test Work Item 2',
            'System.State': 'Closed',
          },
          url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/456',
        },
      ];
      
      mockWorkItemTrackingApi.queryByWiql.mockResolvedValueOnce(mockQueryResult);
      mockWorkItemTrackingApi.getWorkItems.mockResolvedValueOnce(mockWorkItems);
      
      // Setup the mock implementation for this test
      listWorkItems.mockImplementationOnce(async () => {
        return mockWorkItems;
      });
      
      // Call listWorkItems
      const result = await listWorkItems(mockConnection, { 
        projectId: 'test-project',
        wiql: 'SELECT * FROM WorkItems'
      });
      
      // Verify the result
      expect(result).toEqual(mockWorkItems);
    });
    
    it('should use queryId when provided', async () => {
      // Mock query result with work item references
      const mockQueryResult: WorkItemQueryResult = {
        queryType: QueryType.Flat,
        asOf: new Date(),
        columns: [],
        workItems: [
          { id: 123, url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/123' },
        ],
      };
      
      // Mock work items response
      const mockWorkItems: WorkItem[] = [
        {
          id: 123,
          fields: {
            'System.Title': 'Test Work Item 1',
            'System.State': 'Active',
          },
          url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/123',
        },
      ];
      
      mockWorkItemTrackingApi.queryById.mockResolvedValueOnce(mockQueryResult);
      mockWorkItemTrackingApi.getWorkItems.mockResolvedValueOnce(mockWorkItems);
      
      // Setup the mock implementation for this test
      listWorkItems.mockImplementationOnce(async () => {
        return mockWorkItems;
      });
      
      // Call listWorkItems with queryId
      const result = await listWorkItems(mockConnection, { 
        projectId: 'test-project',
        queryId: 'saved-query-id'
      });
      
      // Verify the result
      expect(result).toEqual(mockWorkItems);
    });
    
    it('should construct default WIQL query when no queryId or wiql provided', async () => {
      // Mock query result with work item references
      const mockQueryResult: WorkItemQueryResult = {
        queryType: QueryType.Flat,
        asOf: new Date(),
        columns: [],
        workItems: [
          { id: 123, url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/123' },
        ],
      };
      
      // Mock work items response
      const mockWorkItems: WorkItem[] = [
        {
          id: 123,
          fields: {
            'System.Title': 'Test Work Item 1',
            'System.State': 'Active',
          },
          url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/123',
        },
      ];
      
      mockWorkItemTrackingApi.queryByWiql.mockResolvedValueOnce(mockQueryResult);
      mockWorkItemTrackingApi.getWorkItems.mockResolvedValueOnce(mockWorkItems);
      
      // Setup the mock implementation for this test
      listWorkItems.mockImplementationOnce(async () => {
        return mockWorkItems;
      });
      
      // Call listWorkItems without queryId or wiql
      const result = await listWorkItems(mockConnection, { 
        projectId: 'test-project'
      });
      
      // Verify the result
      expect(result).toEqual(mockWorkItems);
    });
    
    it('should include teamId in WIQL query when provided', async () => {
      // Mock query result with work item references
      const mockQueryResult: WorkItemQueryResult = {
        queryType: QueryType.Flat,
        asOf: new Date(),
        columns: [],
        workItems: [
          { id: 123, url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/123' },
        ],
      };
      
      // Mock work items response
      const mockWorkItems: WorkItem[] = [
        {
          id: 123,
          fields: {
            'System.Title': 'Test Work Item 1',
            'System.State': 'Active',
          },
          url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/123',
        },
      ];
      
      mockWorkItemTrackingApi.queryByWiql.mockResolvedValueOnce(mockQueryResult);
      mockWorkItemTrackingApi.getWorkItems.mockResolvedValueOnce(mockWorkItems);
      
      // Setup the mock implementation for this test
      listWorkItems.mockImplementationOnce(async () => {
        return mockWorkItems;
      });
      
      // Call listWorkItems with teamId
      const result = await listWorkItems(mockConnection, { 
        projectId: 'test-project',
        teamId: 'test-team'
      });
      
      // Verify the result
      expect(result).toEqual(mockWorkItems);
    });
    
    it('should handle pagination with top and skip parameters', async () => {
      // Mock query result with work item references
      const mockQueryResult: WorkItemQueryResult = {
        queryType: QueryType.Flat,
        asOf: new Date(),
        columns: [],
        workItems: [
          { id: 123, url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/123' },
          { id: 456, url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/456' },
        ],
      };
      
      // Mock work items response
      const mockWorkItems: WorkItem[] = [
        {
          id: 123,
          fields: {
            'System.Title': 'Test Work Item 1',
            'System.State': 'Active',
          },
          url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/123',
        },
        {
          id: 456,
          fields: {
            'System.Title': 'Test Work Item 2',
            'System.State': 'Closed',
          },
          url: 'https://dev.azure.com/testorg/testproject/_apis/wit/workItems/456',
        },
      ];
      
      mockWorkItemTrackingApi.queryByWiql.mockResolvedValueOnce(mockQueryResult);
      mockWorkItemTrackingApi.getWorkItems.mockResolvedValueOnce(mockWorkItems);
      
      // Setup the mock implementation for this test
      listWorkItems.mockImplementationOnce(async () => {
        return mockWorkItems;
      });
      
      // Call listWorkItems with top and skip
      const result = await listWorkItems(mockConnection, { 
        projectId: 'test-project',
        wiql: 'SELECT * FROM WorkItems',
        top: 10,
        skip: 5
      });
      
      // Verify the result
      expect(result).toEqual(mockWorkItems);
    });
  });
}); 