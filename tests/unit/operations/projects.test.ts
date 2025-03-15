import { WebApi } from 'azure-devops-node-api';
import { TeamProject } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import { getPersonalAccessTokenHandler } from 'azure-devops-node-api';
import { getProject, listProjects } from '../../../src/operations/projects';
import { AzureDevOpsResourceNotFoundError } from '../../../src/common/errors';

// Mock the Azure DevOps WebApi and handler
jest.mock('azure-devops-node-api');

describe('Projects Operations', () => {
  let mockConnection: jest.Mocked<WebApi>;
  let mockCoreApi: any;

  beforeEach(() => {
    // Create mock objects
    mockCoreApi = {
      getProject: jest.fn(),
      getProjects: jest.fn(),
    };

    // Create a mock handler and WebApi
    const mockHandler = getPersonalAccessTokenHandler('fake-token');
    mockConnection = new WebApi('https://dev.azure.com/organization', mockHandler) as jest.Mocked<WebApi>;
    mockConnection.getCoreApi = jest.fn().mockResolvedValue(mockCoreApi);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getProject', () => {
    const mockProject: TeamProject = {
      id: 'project-id',
      name: 'Test Project',
      url: 'https://dev.azure.com/org/project',
    };

    it('should return a project when found', async () => {
      // Arrange
      mockCoreApi.getProject.mockResolvedValue(mockProject);

      // Act
      const result = await getProject(mockConnection, 'project-id');

      // Assert
      expect(mockConnection.getCoreApi).toHaveBeenCalledTimes(1);
      expect(mockCoreApi.getProject).toHaveBeenCalledWith('project-id');
      expect(result).toEqual(mockProject);
    });

    it('should throw AzureDevOpsResourceNotFoundError when project is not found', async () => {
      // Arrange
      mockCoreApi.getProject.mockResolvedValue(null);

      // Act & Assert
      await expect(getProject(mockConnection, 'non-existent')).rejects.toThrow(
        AzureDevOpsResourceNotFoundError
      );
      expect(mockConnection.getCoreApi).toHaveBeenCalledTimes(1);
      expect(mockCoreApi.getProject).toHaveBeenCalledWith('non-existent');
    });

    it('should propagate AzureDevOpsResourceNotFoundError', async () => {
      // Arrange
      const error = new AzureDevOpsResourceNotFoundError('Project not found');
      mockCoreApi.getProject.mockRejectedValue(error);

      // Act & Assert
      await expect(getProject(mockConnection, 'project-id')).rejects.toThrow(
        AzureDevOpsResourceNotFoundError
      );
    });

    it('should wrap other errors', async () => {
      // Arrange
      mockCoreApi.getProject.mockRejectedValue(new Error('API error'));

      // Act & Assert
      await expect(getProject(mockConnection, 'project-id')).rejects.toThrow(
        'Failed to get project: API error'
      );
    });
  });

  describe('listProjects', () => {
    const mockProjects: TeamProject[] = [
      {
        id: 'project-1',
        name: 'Project 1',
        url: 'https://dev.azure.com/org/project1',
      },
      {
        id: 'project-2',
        name: 'Project 2',
        url: 'https://dev.azure.com/org/project2',
      },
    ];

    it('should return all projects with no options', async () => {
      // Arrange
      mockCoreApi.getProjects.mockResolvedValue(mockProjects);

      // Act
      const result = await listProjects(mockConnection);

      // Assert
      expect(mockConnection.getCoreApi).toHaveBeenCalledTimes(1);
      expect(mockCoreApi.getProjects).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
        undefined
      );
      expect(result).toEqual(mockProjects);
    });

    it('should pass options to the API', async () => {
      // Arrange
      mockCoreApi.getProjects.mockResolvedValue(mockProjects);
      const options = {
        stateFilter: 1,
        top: 10,
        skip: 5,
        continuationToken: 123,
      };

      // Act
      const result = await listProjects(mockConnection, options);

      // Assert
      expect(mockConnection.getCoreApi).toHaveBeenCalledTimes(1);
      expect(mockCoreApi.getProjects).toHaveBeenCalledWith(1, 10, 5, 123);
      expect(result).toEqual(mockProjects);
    });

    it('should wrap errors', async () => {
      // Arrange
      mockCoreApi.getProjects.mockRejectedValue(new Error('API error'));

      // Act & Assert
      await expect(listProjects(mockConnection)).rejects.toThrow(
        'Failed to list projects: API error'
      );
    });
  });
}); 