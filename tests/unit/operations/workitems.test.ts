import { WebApi } from 'azure-devops-node-api';
import { getPersonalAccessTokenHandler } from 'azure-devops-node-api';
import { 
  WorkItem, 
  WorkItemQueryResult
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { getWorkItem, listWorkItems } from '../../../src/operations/workitems';
import { AzureDevOpsResourceNotFoundError } from '../../../src/common/errors';

// Mock the Azure DevOps WebApi and handler
jest.mock('azure-devops-node-api');

describe('Work Items Operations', () => {
  let mockConnection: jest.Mocked<WebApi>;
  let mockWitApi: any;

  beforeEach(() => {
    // Create mock objects
    mockWitApi = {
      getWorkItem: jest.fn(),
      queryByWiql: jest.fn(),
      getWorkItems: jest.fn(),
      getQueries: jest.fn(),
      getQuery: jest.fn(),
      queryById: jest.fn(),
    };

    // Create a mock handler and WebApi
    const mockHandler = getPersonalAccessTokenHandler('fake-token');
    mockConnection = new WebApi('https://dev.azure.com/organization', mockHandler) as jest.Mocked<WebApi>;
    mockConnection.getWorkItemTrackingApi = jest.fn().mockResolvedValue(mockWitApi);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getWorkItem', () => {
    it('should return a work item when found', async () => {
      // Arrange
      const mockWorkItem = { id: 123, title: 'Test Work Item' };
      mockWitApi.getWorkItem.mockResolvedValueOnce(mockWorkItem);

      // Act
      const result = await getWorkItem(mockConnection, 123);

      // Assert
      expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalledTimes(1);
      expect(mockWitApi.getWorkItem).toHaveBeenCalledWith(
        123,
        ["System.Id", "System.Title", "System.State", "System.AssignedTo"],
        undefined,
        undefined
      );
      expect(result).toEqual(mockWorkItem);
    });

    it('should throw AzureDevOpsResourceNotFoundError when work item is not found', async () => {
      // Arrange
      mockWitApi.getWorkItem.mockResolvedValueOnce(undefined);

      // Act & Assert
      await expect(getWorkItem(mockConnection, 999)).rejects.toThrow(
        AzureDevOpsResourceNotFoundError,
      );
      expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalledTimes(1);
      expect(mockWitApi.getWorkItem).toHaveBeenCalledWith(
        999,
        ["System.Id", "System.Title", "System.State", "System.AssignedTo"],
        undefined,
        undefined
      );
    });

    it('should propagate AzureDevOpsResourceNotFoundError', async () => {
      // Arrange
      const error = new AzureDevOpsResourceNotFoundError('Work item not found');
      mockWitApi.getWorkItem.mockRejectedValue(error);

      // Act & Assert
      await expect(getWorkItem(mockConnection, 123)).rejects.toThrow(
        AzureDevOpsResourceNotFoundError
      );
    });

    it('should wrap other errors', async () => {
      // Arrange
      mockWitApi.getWorkItem.mockRejectedValue(new Error('API error'));

      // Act & Assert
      await expect(getWorkItem(mockConnection, 123)).rejects.toThrow(
        'Failed to get work item: API error'
      );
    });
  });

  describe('listWorkItems', () => {
    const mockWorkItems: WorkItem[] = [
      {
        id: 123,
        url: 'https://dev.azure.com/org/project/_apis/wit/workItems/123',
        fields: {
          'System.Id': 123,
          'System.Title': 'Work Item 1',
          'System.State': 'Active',
        },
      },
      {
        id: 124,
        url: 'https://dev.azure.com/org/project/_apis/wit/workItems/124',
        fields: {
          'System.Id': 124,
          'System.Title': 'Work Item 2',
          'System.State': 'Resolved',
        },
      },
    ];

    const mockQueryResult: WorkItemQueryResult = {
      workItems: [
        { id: 123, url: 'https://dev.azure.com/org/project/_apis/wit/workItems/123' },
        { id: 124, url: 'https://dev.azure.com/org/project/_apis/wit/workItems/124' },
      ],
    };

    it('should return work items using WIQL query', async () => {
      // Arrange
      const options = {
        projectId: 'project-id',
        wiql: 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project',
        teamId: undefined,
      };
      mockWitApi.queryByWiql.mockResolvedValueOnce({ workItems: [{ id: 123 }, { id: 124 }] });
      mockWitApi.getWorkItems.mockResolvedValueOnce(mockWorkItems);

      // Act
      const result = await listWorkItems(mockConnection, options);

      // Assert
      expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalledTimes(1);
      expect(mockWitApi.queryByWiql).toHaveBeenCalledWith(
        { query: options.wiql },
        {
          project: options.projectId,
          team: options.teamId,
        },
      );
      expect(mockWitApi.getWorkItems).toHaveBeenCalledWith(
        [123, 124],
        ["System.Id", "System.Title", "System.State", "System.AssignedTo"],
        undefined,
        4,
      );
      expect(result).toEqual(mockWorkItems);
    });

    it('should handle empty query results', async () => {
      // Arrange
      mockWitApi.queryByWiql.mockResolvedValue({ workItems: [] });
      
      const options = {
        projectId: 'project-id',
        wiql: 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project',
        teamId: undefined,
      };

      // Act
      const result = await listWorkItems(mockConnection, options);

      // Assert
      expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalledTimes(1);
      expect(mockWitApi.queryByWiql).toHaveBeenCalledWith(
        { query: options.wiql },
        {
          project: options.projectId,
          team: options.teamId,
        },
      );
      expect(mockWitApi.getWorkItems).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should use saved query when queryId is provided', async () => {
      // Arrange
      const mockQuery = {
        wiql: 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project',
      };
      mockWitApi.getQuery.mockResolvedValue(mockQuery);
      mockWitApi.queryById.mockResolvedValue(mockQueryResult);
      mockWitApi.getWorkItems.mockResolvedValue(mockWorkItems);
      
      const options = {
        projectId: 'project-id',
        queryId: 'query-id',
        teamId: undefined,
      };

      // Act
      const result = await listWorkItems(mockConnection, options);

      // Assert
      expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalledTimes(1);
      expect(mockWitApi.queryById).toHaveBeenCalledWith(
        options.queryId,
        {
          project: options.projectId,
          team: options.teamId,
        },
      );
      expect(result).toEqual(mockWorkItems);
    });

    it('should handle pagination options', async () => {
      // Arrange
      const options = {
        projectId: 'project-id',
        wiql: 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project',
        top: 10,
        teamId: undefined,
      };
      const mockWorkItemsResult = [
        {
          id: 123,
          url: 'https://dev.azure.com/org/project/_apis/wit/workItems/123',
          fields: {
            'System.Id': 123,
            'System.Title': 'Work Item 1',
            'System.State': 'Active',
          },
        },
        {
          id: 124,
          url: 'https://dev.azure.com/org/project/_apis/wit/workItems/124',
          fields: {
            'System.Id': 124,
            'System.Title': 'Work Item 2',
            'System.State': 'Resolved',
          },
        },
      ];
      mockWitApi.queryByWiql.mockResolvedValueOnce({ workItems: [{ id: 123 }, { id: 124 }] });
      mockWitApi.getWorkItems.mockResolvedValueOnce(mockWorkItemsResult);

      // Act
      const result = await listWorkItems(mockConnection, options);

      // Assert
      expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalledTimes(1);
      expect(mockWitApi.queryByWiql).toHaveBeenCalledWith(
        { query: options.wiql },
        {
          project: options.projectId,
          team: options.teamId,
        },
      );
      expect(mockWitApi.getWorkItems).toHaveBeenCalled();
      expect(result).toEqual(mockWorkItemsResult);
    });

    it('should wrap errors', async () => {
      // Arrange
      mockWitApi.queryByWiql.mockRejectedValue(new Error('API error'));
      
      const options = {
        projectId: 'project-id',
        wiql: 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project',
        teamId: undefined,
      };

      // Act & Assert
      await expect(listWorkItems(mockConnection, options)).rejects.toThrow(
        'Failed to list work items: API error'
      );
    });
  });
}); 