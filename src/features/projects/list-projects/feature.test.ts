import { WebApi } from 'azure-devops-node-api';
import { TeamProject } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import { AzureDevOpsError } from '../../../shared/errors';
import { listProjects } from './feature';

// Mock WebApi
jest.mock('azure-devops-node-api');

describe('listProjects', () => {
  let mockConnection: jest.Mocked<WebApi>;
  let mockCoreApi: any;

  const mockProjects: TeamProject[] = [
    {
      id: 'project-1',
      name: 'Test Project 1',
      description: 'A test project',
      url: 'https://dev.azure.com/test/project1',
      state: 1,
      revision: 1,
      visibility: 0,
      lastUpdateTime: new Date(),
    },
    {
      id: 'project-2',
      name: 'Test Project 2',
      description: 'Another test project',
      url: 'https://dev.azure.com/test/project2',
      state: 1,
      revision: 1,
      visibility: 0,
      lastUpdateTime: new Date(),
    },
  ];

  beforeEach(() => {
    mockCoreApi = {
      getProjects: jest.fn(),
    };

    // @ts-ignore - Ignoring type checking for the mock
    mockConnection = new WebApi('', {});
    mockConnection.getCoreApi = jest.fn().mockResolvedValue(mockCoreApi);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should list projects with no options', async () => {
    mockCoreApi.getProjects.mockResolvedValue(mockProjects);

    const projects = await listProjects(mockConnection);

    expect(mockConnection.getCoreApi).toHaveBeenCalled();
    expect(mockCoreApi.getProjects).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(projects).toEqual(mockProjects);
  });

  it('should pass options to the API', async () => {
    mockCoreApi.getProjects.mockResolvedValue(mockProjects);

    const options = {
      stateFilter: 1,
      top: 10,
      skip: 5,
      continuationToken: 100,
    };

    await listProjects(mockConnection, options);

    expect(mockCoreApi.getProjects).toHaveBeenCalledWith(
      options.stateFilter,
      options.top,
      options.skip,
      options.continuationToken,
    );
  });

  it('should throw an error when the API call fails', async () => {
    const error = new Error('API error');
    mockCoreApi.getProjects.mockRejectedValue(error);

    await expect(listProjects(mockConnection)).rejects.toThrow(
      'Failed to list projects: API error',
    );
  });

  it('should pass through AzureDevOpsError', async () => {
    const error = new AzureDevOpsError('Custom error');
    mockCoreApi.getProjects.mockRejectedValue(error);

    await expect(listProjects(mockConnection)).rejects.toThrow(error);
  });
});
