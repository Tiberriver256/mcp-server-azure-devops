import { WebApi } from 'azure-devops-node-api';
import { getPersonalAccessTokenHandler } from 'azure-devops-node-api';
import { 
  WorkItem, 
  WorkItemQueryResult,
  WorkItemExpand
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { listWorkItems } from '../../../../src/operations/workitems';
import { AzureDevOpsResourceNotFoundError } from '../../../../src/common/errors';

// Mock the Azure DevOps WebApi and handler
jest.mock('azure-devops-node-api');

describe('List Work Items Operation', () => {
  let mockConnection: jest.Mocked<WebApi>;
  let mockWitApi: any;

  beforeEach(() => {
    // Create mock objects
    mockWitApi = {
      queryByWiql: jest.fn(),
      queryById: jest.fn(),
      getWorkItems: jest.fn(),
    };

    // Create a mock handler and WebApi
    const mockHandler = getPersonalAccessTokenHandler('fake-token');
    mockConnection = new WebApi('https://dev.azure.com/organization', mockHandler) as jest.Mocked<WebApi>;
    mockConnection.getWorkItemTrackingApi = jest.fn().mockResolvedValue(mockWitApi);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

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

  describe('with WIQL query', () => {
    it('should return work items using WIQL query', async () => {
      // Arrange
      const options = {
        projectId: 'project-id',
        wiql: 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project',
      };
      mockWitApi.queryByWiql.mockResolvedValueOnce(mockQueryResult);
      mockWitApi.getWorkItems.mockResolvedValueOnce(mockWorkItems);

      // Act
      const result = await listWorkItems(mockConnection, options);

      // Assert
      expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalledTimes(1);
      expect(mockWitApi.queryByWiql).toHaveBeenCalledWith(
        { query: options.wiql },
        {
          project: options.projectId,
          team: undefined,
        },
      );
      expect(mockWitApi.getWorkItems).toHaveBeenCalledWith(
        [123, 124],
        ["System.Id", "System.Title", "System.State", "System.AssignedTo"],
        undefined,
        WorkItemExpand.All,
      );
      expect(result).toEqual(mockWorkItems);
    });

    it('should use default WIQL when no query or queryId is provided', async () => {
      // Arrange
      const options = {
        projectId: 'project-id',
      };
      mockWitApi.queryByWiql.mockResolvedValueOnce(mockQueryResult);
      mockWitApi.getWorkItems.mockResolvedValueOnce(mockWorkItems);

      // Act
      const result = await listWorkItems(mockConnection, options);

      // Assert
      expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalledTimes(1);
      expect(mockWitApi.queryByWiql).toHaveBeenCalledWith(
        { query: expect.stringContaining('SELECT [System.Id] FROM WorkItems') },
        {
          project: options.projectId,
          team: undefined,
        },
      );
      expect(mockWitApi.getWorkItems).toHaveBeenCalled();
      expect(result).toEqual(mockWorkItems);
    });

    it('should include team context when teamId is provided', async () => {
      // Arrange
      const options = {
        projectId: 'project-id',
        teamId: 'team-id',
        wiql: 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project',
      };
      mockWitApi.queryByWiql.mockResolvedValueOnce(mockQueryResult);
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
      expect(result).toEqual(mockWorkItems);
    });
  });

  describe('with Query ID', () => {
    it('should return work items using queryId', async () => {
      // Arrange
      const options = {
        projectId: 'project-id',
        queryId: 'query-id',
      };
      mockWitApi.queryById.mockResolvedValueOnce(mockQueryResult);
      mockWitApi.getWorkItems.mockResolvedValueOnce(mockWorkItems);

      // Act
      const result = await listWorkItems(mockConnection, options);

      // Assert
      expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalledTimes(1);
      expect(mockWitApi.queryById).toHaveBeenCalledWith(
        options.queryId,
        {
          project: options.projectId,
          team: undefined,
        },
      );
      expect(mockWitApi.getWorkItems).toHaveBeenCalled();
      expect(result).toEqual(mockWorkItems);
    });
  });

  describe('pagination', () => {
    it('should handle top parameter', async () => {
      // Arrange
      const options = {
        projectId: 'project-id',
        wiql: 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project',
        top: 1,
      };
      mockWitApi.queryByWiql.mockResolvedValueOnce(mockQueryResult);
      mockWitApi.getWorkItems.mockResolvedValueOnce([mockWorkItems[0]]);

      // Act
      const result = await listWorkItems(mockConnection, options);

      // Assert
      expect(mockWitApi.queryByWiql).toHaveBeenCalled();
      expect(mockWitApi.getWorkItems).toHaveBeenCalledWith(
        [123], // Only the first ID should be used due to top: 1
        ["System.Id", "System.Title", "System.State", "System.AssignedTo"],
        undefined,
        WorkItemExpand.All,
      );
      expect(result).toEqual([mockWorkItems[0]]);
    });

    it('should handle skip parameter', async () => {
      // Arrange
      const options = {
        projectId: 'project-id',
        wiql: 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project',
        skip: 1,
      };
      mockWitApi.queryByWiql.mockResolvedValueOnce(mockQueryResult);
      mockWitApi.getWorkItems.mockResolvedValueOnce([mockWorkItems[1]]);

      // Act
      const result = await listWorkItems(mockConnection, options);

      // Assert
      expect(mockWitApi.queryByWiql).toHaveBeenCalled();
      expect(mockWitApi.getWorkItems).toHaveBeenCalledWith(
        [124], // Only the second ID should be used due to skip: 1
        ["System.Id", "System.Title", "System.State", "System.AssignedTo"],
        undefined,
        WorkItemExpand.All,
      );
      expect(result).toEqual([mockWorkItems[1]]);
    });
  });

  describe('error handling', () => {
    it('should handle empty query results', async () => {
      // Arrange
      mockWitApi.queryByWiql.mockResolvedValue({ workItems: [] });
      
      const options = {
        projectId: 'project-id',
        wiql: 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project',
      };

      // Act
      const result = await listWorkItems(mockConnection, options);

      // Assert
      expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalledTimes(1);
      expect(mockWitApi.queryByWiql).toHaveBeenCalled();
      expect(mockWitApi.getWorkItems).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should wrap errors', async () => {
      // Arrange
      mockWitApi.queryByWiql.mockRejectedValue(new Error('API error'));
      
      const options = {
        projectId: 'project-id',
        wiql: 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project',
      };

      // Act & Assert
      await expect(listWorkItems(mockConnection, options)).rejects.toThrow(
        'Failed to list work items: API error'
      );
    });

    it('should propagate AzureDevOpsResourceNotFoundError', async () => {
      // Arrange
      const error = new AzureDevOpsResourceNotFoundError('Project not found');
      mockWitApi.queryByWiql.mockRejectedValue(error);
      
      const options = {
        projectId: 'project-id',
        wiql: 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project',
      };

      // Act & Assert
      await expect(listWorkItems(mockConnection, options)).rejects.toThrow(
        AzureDevOpsResourceNotFoundError
      );
    });
  });
}); 