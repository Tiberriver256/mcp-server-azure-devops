import { WebApi } from 'azure-devops-node-api';
import axios from 'axios';
import { searchWiki } from './feature';

// Mock Azure Identity
jest.mock('@azure/identity', () => {
  const mockGetToken = jest.fn().mockResolvedValue({ token: 'mock-token' });
  return {
    DefaultAzureCredential: jest.fn().mockImplementation(() => ({
      getToken: mockGetToken,
    })),
    AzureCliCredential: jest.fn().mockImplementation(() => ({
      getToken: mockGetToken,
    })),
  };
});

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('searchWiki unit', () => {
  // Mock WebApi connection
  const mockConnection = {
    _getHttpClient: jest.fn().mockReturnValue({
      getAuthorizationHeader: jest.fn().mockReturnValue('Bearer mock-token'),
    }),
    getCoreApi: jest.fn().mockImplementation(() => ({
      getProjects: jest
        .fn()
        .mockResolvedValue([{ name: 'TestProject', id: 'project-id' }]),
    })),
    serverUrl: 'https://dev.azure.com/testorg',
  } as unknown as WebApi;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return wiki search results with project ID', async () => {
    // Arrange
    const mockSearchResponse = {
      data: {
        count: 1,
        results: [
          {
            fileName: 'Example Page',
            path: '/Example Page',
            collection: {
              name: 'DefaultCollection',
            },
            project: {
              name: 'TestProject',
              id: 'project-id',
            },
            hits: [
              {
                content: 'This is an example page',
                charOffset: 5,
                length: 7,
              },
            ],
          },
        ],
      },
    };

    mockedAxios.post.mockResolvedValueOnce(mockSearchResponse);

    // Act
    const result = await searchWiki(mockConnection, {
      searchText: 'example',
      projectId: 'TestProject',
    });

    // Assert
    expect(result).toBeDefined();
    expect(result.count).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].fileName).toBe('Example Page');
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://almsearch.dev.azure.com/testorg/TestProject/_apis/search/wikisearchresults',
      ),
      expect.objectContaining({
        searchText: 'example',
        filters: expect.objectContaining({
          Project: ['TestProject'],
        }),
      }),
      expect.any(Object),
    );
  });

  test('should perform organization-wide wiki search when projectId is not provided', async () => {
    // Arrange
    const mockSearchResponse = {
      data: {
        count: 2,
        results: [
          {
            fileName: 'Example Page 1',
            path: '/Example Page 1',
            collection: {
              name: 'DefaultCollection',
            },
            project: {
              name: 'Project1',
              id: 'project-id-1',
            },
            hits: [
              {
                content: 'This is an example page',
                charOffset: 5,
                length: 7,
              },
            ],
          },
          {
            fileName: 'Example Page 2',
            path: '/Example Page 2',
            collection: {
              name: 'DefaultCollection',
            },
            project: {
              name: 'Project2',
              id: 'project-id-2',
            },
            hits: [
              {
                content: 'This is another example page',
                charOffset: 5,
                length: 7,
              },
            ],
          },
        ],
      },
    };

    mockedAxios.post.mockResolvedValueOnce(mockSearchResponse);

    // Act
    const result = await searchWiki(mockConnection, {
      searchText: 'example',
    });

    // Assert
    expect(result).toBeDefined();
    expect(result.count).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].project.name).toBe('Project1');
    expect(result.results[1].project.name).toBe('Project2');
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://almsearch.dev.azure.com/testorg/_apis/search/wikisearchresults',
      ),
      expect.not.objectContaining({
        filters: expect.objectContaining({
          Project: expect.anything(),
        }),
      }),
      expect.any(Object),
    );
  });
});
