import { WebApi } from 'azure-devops-node-api';
import axios from 'axios';
import { searchWorkItems } from './feature';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
  AzureDevOpsPermissionError,
} from '../../../shared/errors';
import { SearchWorkItemsOptions, WorkItemSearchResponse } from '../types';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock @azure/identity
jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn().mockImplementation(() => ({
    getToken: jest
      .fn()
      .mockResolvedValue({ token: 'mock-azure-identity-token' }),
  })),
  AzureCliCredential: jest.fn(),
}));

// Mock WebApi
jest.mock('azure-devops-node-api');
const MockedWebApi = WebApi as jest.MockedClass<typeof WebApi>;

describe('searchWorkItems', () => {
  let connection: WebApi;
  let options: SearchWorkItemsOptions;
  let mockResponse: WorkItemSearchResponse;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock environment variables
    process.env.AZURE_DEVOPS_AUTH_METHOD = 'pat';
    process.env.AZURE_DEVOPS_PAT = 'mock-pat';

    // Set up connection mock
    // Create a mock auth handler that implements IRequestHandler
    const mockAuthHandler = {
      prepareRequest: jest.fn(),
      canHandleAuthentication: jest.fn().mockReturnValue(true),
      handleAuthentication: jest.fn(),
    };
    connection = new MockedWebApi(
      'https://dev.azure.com/mock-org',
      mockAuthHandler,
    );
    (connection as any).serverUrl = 'https://dev.azure.com/mock-org';
    (connection.getCoreApi as jest.Mock).mockResolvedValue({
      getProjects: jest.fn().mockResolvedValue([]),
    });

    // Set up options
    options = {
      searchText: 'test query',
      projectId: 'mock-project',
      top: 50,
      skip: 0,
      includeFacets: true,
    };

    // Set up mock response
    mockResponse = {
      count: 2,
      results: [
        {
          project: {
            id: 'project-id-1',
            name: 'mock-project',
          },
          fields: {
            'system.id': '42',
            'system.workitemtype': 'Bug',
            'system.title': 'Test Bug',
            'system.state': 'Active',
            'system.assignedto': 'Test User',
          },
          hits: [
            {
              fieldReferenceName: 'system.title',
              highlights: ['Test <b>Bug</b>'],
            },
          ],
          url: 'https://dev.azure.com/mock-org/mock-project/_workitems/edit/42',
        },
        {
          project: {
            id: 'project-id-1',
            name: 'mock-project',
          },
          fields: {
            'system.id': '43',
            'system.workitemtype': 'Task',
            'system.title': 'Test Task',
            'system.state': 'New',
            'system.assignedto': 'Test User',
          },
          hits: [
            {
              fieldReferenceName: 'system.title',
              highlights: ['Test <b>Task</b>'],
            },
          ],
          url: 'https://dev.azure.com/mock-org/mock-project/_workitems/edit/43',
        },
      ],
      facets: {
        'System.WorkItemType': [
          {
            name: 'Bug',
            id: 'Bug',
            resultCount: 1,
          },
          {
            name: 'Task',
            id: 'Task',
            resultCount: 1,
          },
        ],
      },
    };

    // Mock axios response
    mockedAxios.post.mockResolvedValue({ data: mockResponse });
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.AZURE_DEVOPS_AUTH_METHOD;
    delete process.env.AZURE_DEVOPS_PAT;
  });

  it('should search work items with the correct parameters', async () => {
    // Act
    const result = await searchWorkItems(connection, options);

    // Assert
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://almsearch.dev.azure.com/mock-org/mock-project/_apis/search/workitemsearchresults?api-version=7.1',
      {
        searchText: 'test query',
        $skip: 0,
        $top: 50,
        filters: {
          'System.TeamProject': ['mock-project'],
        },
        includeFacets: true,
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Basic'),
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(result).toEqual(mockResponse);
  });

  it('should include filters when provided', async () => {
    // Arrange
    options.filters = {
      'System.WorkItemType': ['Bug', 'Task'],
      'System.State': ['Active'],
    };

    // Act
    await searchWorkItems(connection, options);

    // Assert
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        filters: {
          'System.TeamProject': ['mock-project'],
          'System.WorkItemType': ['Bug', 'Task'],
          'System.State': ['Active'],
        },
      }),
      expect.any(Object),
    );
  });

  it('should include orderBy when provided', async () => {
    // Arrange
    options.orderBy = [{ field: 'System.CreatedDate', sortOrder: 'ASC' }];

    // Act
    await searchWorkItems(connection, options);

    // Assert
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        $orderBy: [{ field: 'System.CreatedDate', sortOrder: 'ASC' }],
      }),
      expect.any(Object),
    );
  });

  it('should handle 404 errors correctly', async () => {
    // Arrange - Mock the implementation to throw the specific error
    mockedAxios.post.mockImplementation(() => {
      throw new AzureDevOpsResourceNotFoundError(
        'Resource not found: Project not found',
      );
    });

    // Act & Assert
    await expect(searchWorkItems(connection, options)).rejects.toThrow(
      AzureDevOpsResourceNotFoundError,
    );
  });

  it('should handle 400 errors correctly', async () => {
    // Arrange - Mock the implementation to throw the specific error
    mockedAxios.post.mockImplementation(() => {
      throw new AzureDevOpsValidationError('Invalid request: Invalid query');
    });

    // Act & Assert
    await expect(searchWorkItems(connection, options)).rejects.toThrow(
      AzureDevOpsValidationError,
    );
  });

  it('should handle 401/403 errors correctly', async () => {
    // Arrange - Mock the implementation to throw the specific error
    mockedAxios.post.mockImplementation(() => {
      throw new AzureDevOpsPermissionError(
        'Permission denied: Permission denied',
      );
    });

    // Act & Assert
    await expect(searchWorkItems(connection, options)).rejects.toThrow(
      AzureDevOpsPermissionError,
    );
  });

  it('should handle other axios errors correctly', async () => {
    // Arrange - Mock the implementation to throw the specific error
    mockedAxios.post.mockImplementation(() => {
      throw new AzureDevOpsError(
        'Azure DevOps API error: Internal server error',
      );
    });

    // Act & Assert
    await expect(searchWorkItems(connection, options)).rejects.toThrow(
      AzureDevOpsError,
    );
  });

  it('should handle non-axios errors correctly', async () => {
    // Arrange
    mockedAxios.post.mockRejectedValue(new Error('Network error'));

    // Act & Assert
    await expect(searchWorkItems(connection, options)).rejects.toThrow(
      AzureDevOpsError,
    );
  });

  it('should throw an error if organization cannot be extracted', async () => {
    // Arrange
    (connection as any).serverUrl = 'https://invalid-url';

    // Act & Assert
    await expect(searchWorkItems(connection, options)).rejects.toThrow(
      AzureDevOpsValidationError,
    );
  });

  it('should use Azure Identity authentication when AZURE_DEVOPS_AUTH_METHOD is azure-identity', async () => {
    // Mock environment variables
    const originalEnv = process.env.AZURE_DEVOPS_AUTH_METHOD;
    process.env.AZURE_DEVOPS_AUTH_METHOD = 'azure-identity';

    // Mock the WebApi connection
    const mockConnection = {
      serverUrl: 'https://dev.azure.com/testorg',
      getCoreApi: jest.fn().mockResolvedValue({
        getProjects: jest.fn().mockResolvedValue([]),
      }),
    };

    // Mock axios post
    const mockResponse = {
      data: {
        count: 0,
        results: [],
      },
    };
    (axios.post as jest.Mock).mockResolvedValueOnce(mockResponse);

    // Call the function
    await searchWorkItems(mockConnection as unknown as WebApi, {
      projectId: 'testproject',
      searchText: 'test query',
    });

    // Verify the axios post was called with a Bearer token
    expect(axios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      {
        headers: {
          Authorization: 'Bearer mock-azure-identity-token',
          'Content-Type': 'application/json',
        },
      },
    );

    // Cleanup
    process.env.AZURE_DEVOPS_AUTH_METHOD = originalEnv;
  });
});
