import { WebApi } from 'azure-devops-node-api';
import { TeamProject } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import { AzureDevOpsResourceNotFoundError } from '../../../shared/errors';
import { getProject } from './feature';

// Mock WebApi
jest.mock('azure-devops-node-api');

describe('getProject', () => {
  let mockConnection: jest.Mocked<WebApi>;
  let mockCoreApi: any;

  const mockProject: TeamProject = {
    id: 'project-1',
    name: 'Test Project',
    description: 'A test project',
    url: 'https://dev.azure.com/test/project1',
    state: 1,
    revision: 1,
    visibility: 0,
    lastUpdateTime: new Date(),
  };

  beforeEach(() => {
    mockCoreApi = {
      getProject: jest.fn(),
    };

    // @ts-ignore - Ignoring type checking for the mock
    mockConnection = new WebApi('', {});
    mockConnection.getCoreApi = jest.fn().mockResolvedValue(mockCoreApi);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should get a project by id', async () => {
    mockCoreApi.getProject.mockResolvedValue(mockProject);

    const project = await getProject(mockConnection, 'project-1');

    expect(mockConnection.getCoreApi).toHaveBeenCalled();
    expect(mockCoreApi.getProject).toHaveBeenCalledWith('project-1');
    expect(project).toEqual(mockProject);
  });

  it('should throw AzureDevOpsResourceNotFoundError when project is not found', async () => {
    mockCoreApi.getProject.mockResolvedValue(null);

    await expect(getProject(mockConnection, 'non-existent')).rejects.toThrow(
      new AzureDevOpsResourceNotFoundError("Project 'non-existent' not found"),
    );
  });

  it('should throw an error when the API call fails', async () => {
    const error = new Error('API error');
    mockCoreApi.getProject.mockRejectedValue(error);

    await expect(getProject(mockConnection, 'project-1')).rejects.toThrow(
      'Failed to get project: API error',
    );
  });

  it('should pass through AzureDevOpsError', async () => {
    const error = new AzureDevOpsResourceNotFoundError('Custom error');
    mockCoreApi.getProject.mockRejectedValue(error);

    await expect(getProject(mockConnection, 'project-1')).rejects.toThrow(
      error,
    );
  });

  // Additional test cases from operations.test.ts
  it('should propagate AzureDevOpsResourceNotFoundError from operations.test.ts', async () => {
    const error = new AzureDevOpsResourceNotFoundError('Project not found');
    mockCoreApi.getProject.mockRejectedValue(error);

    await expect(getProject(mockConnection, 'project-id')).rejects.toThrow(
      AzureDevOpsResourceNotFoundError,
    );
  });
});
