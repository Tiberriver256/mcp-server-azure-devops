import axios from 'axios';
import { searchCode } from './feature';
import { WebApi } from 'azure-devops-node-api';
import { AzureDevOpsError } from '../../../shared/errors';

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

describe('searchCode unit', () => {
  // Mock WebApi connection
  const mockConnection = {
    getGitApi: jest.fn().mockImplementation(() => ({
      getItemContent: jest.fn().mockImplementation((_repoId, path) => {
        // Return different content based on the path to simulate different files
        if (path === '/src/example.ts') {
          return Buffer.from('export function example() { return "test"; }');
        }
        return Buffer.from('// Empty file');
      }),
    })),
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

  test('should return search results with content', async () => {
    // Arrange
    const mockSearchResponse = {
      data: {
        count: 1,
        results: [
          {
            fileName: 'example.ts',
            path: '/src/example.ts',
            matches: {
              content: [
                {
                  charOffset: 17,
                  length: 7,
                },
              ],
            },
            collection: {
              name: 'DefaultCollection',
            },
            project: {
              name: 'TestProject',
              id: 'project-id',
            },
            repository: {
              name: 'TestRepo',
              id: 'repo-id',
              type: 'git',
            },
            versions: [
              {
                branchName: 'main',
                changeId: 'commit-hash',
              },
            ],
            contentId: 'content-hash',
          },
        ],
      },
    };

    mockedAxios.post.mockResolvedValueOnce(mockSearchResponse);

    // Act
    const result = await searchCode(mockConnection, {
      searchText: 'example',
      projectId: 'TestProject',
      includeContent: true,
    });

    // Assert
    expect(result).toBeDefined();
    expect(result.count).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].fileName).toBe('example.ts');
    expect(result.results[0].content).toBe(
      'export function example() { return "test"; }',
    );
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://almsearch.dev.azure.com/testorg/TestProject/_apis/search/codesearchresults',
      ),
      expect.objectContaining({
        searchText: 'example',
      }),
      expect.any(Object),
    );
  });

  test('should not fetch content when includeContent is false', async () => {
    // Arrange
    const mockSearchResponse = {
      data: {
        count: 1,
        results: [
          {
            fileName: 'example.ts',
            path: '/src/example.ts',
            matches: {
              content: [
                {
                  charOffset: 17,
                  length: 7,
                },
              ],
            },
            collection: {
              name: 'DefaultCollection',
            },
            project: {
              name: 'TestProject',
              id: 'project-id',
            },
            repository: {
              name: 'TestRepo',
              id: 'repo-id',
              type: 'git',
            },
            versions: [
              {
                branchName: 'main',
                changeId: 'commit-hash',
              },
            ],
            contentId: 'content-hash',
          },
        ],
      },
    };

    mockedAxios.post.mockResolvedValueOnce(mockSearchResponse);

    // Act
    const result = await searchCode(mockConnection, {
      searchText: 'example',
      projectId: 'TestProject',
      includeContent: false,
    });

    // Assert
    expect(result).toBeDefined();
    expect(result.count).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].fileName).toBe('example.ts');
    expect(result.results[0].content).toBeUndefined();
    expect(mockConnection.getGitApi).not.toHaveBeenCalled();
  });

  test('should handle empty search results', async () => {
    // Arrange
    const mockSearchResponse = {
      data: {
        count: 0,
        results: [],
      },
    };

    mockedAxios.post.mockResolvedValueOnce(mockSearchResponse);

    // Act
    const result = await searchCode(mockConnection, {
      searchText: 'nonexistent',
      projectId: 'TestProject',
    });

    // Assert
    expect(result).toBeDefined();
    expect(result.count).toBe(0);
    expect(result.results).toHaveLength(0);
  });

  test('should handle API errors', async () => {
    // Arrange
    const axiosError = new Error('API Error');
    (axiosError as any).isAxiosError = true;
    (axiosError as any).response = {
      status: 404,
      data: {
        message: 'Project not found',
      },
    };

    mockedAxios.post.mockRejectedValueOnce(axiosError);

    // Act & Assert
    await expect(
      searchCode(mockConnection, {
        searchText: 'example',
        projectId: 'NonExistentProject',
      }),
    ).rejects.toThrow(AzureDevOpsError);
  });

  test('should propagate custom errors when thrown internally', async () => {
    // Arrange
    const customError = new AzureDevOpsError('Custom error');

    // Mock axios to properly return the custom error
    mockedAxios.post.mockImplementationOnce(() => {
      throw customError;
    });

    // Act & Assert
    await expect(
      searchCode(mockConnection, {
        searchText: 'example',
        projectId: 'TestProject',
      }),
    ).rejects.toThrow(AzureDevOpsError);

    // Reset mock and set it up again for the second test
    mockedAxios.post.mockReset();
    mockedAxios.post.mockImplementationOnce(() => {
      throw customError;
    });

    await expect(
      searchCode(mockConnection, {
        searchText: 'example',
        projectId: 'TestProject',
      }),
    ).rejects.toThrow('Custom error');
  });

  test('should apply filters when provided', async () => {
    // Arrange
    const mockSearchResponse = {
      data: {
        count: 1,
        results: [
          {
            fileName: 'example.ts',
            path: '/src/example.ts',
            matches: {
              content: [
                {
                  charOffset: 17,
                  length: 7,
                },
              ],
            },
            collection: {
              name: 'DefaultCollection',
            },
            project: {
              name: 'TestProject',
              id: 'project-id',
            },
            repository: {
              name: 'TestRepo',
              id: 'repo-id',
              type: 'git',
            },
            versions: [
              {
                branchName: 'main',
                changeId: 'commit-hash',
              },
            ],
            contentId: 'content-hash',
          },
        ],
      },
    };

    mockedAxios.post.mockResolvedValueOnce(mockSearchResponse);

    // Act
    await searchCode(mockConnection, {
      searchText: 'example',
      projectId: 'TestProject',
      filters: {
        Repository: ['TestRepo'],
        Path: ['/src'],
        Branch: ['main'],
        CodeElement: ['function'],
      },
    });

    // Assert
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        filters: {
          Project: ['TestProject'],
          Repository: ['TestRepo'],
          Path: ['/src'],
          Branch: ['main'],
          CodeElement: ['function'],
        },
      }),
      expect.any(Object),
    );
  });

  test('should handle pagination parameters', async () => {
    // Arrange
    const mockSearchResponse = {
      data: {
        count: 100,
        results: Array(10)
          .fill(0)
          .map((_, i) => ({
            fileName: `example${i}.ts`,
            path: `/src/example${i}.ts`,
            matches: {
              content: [
                {
                  charOffset: 17,
                  length: 7,
                },
              ],
            },
            collection: {
              name: 'DefaultCollection',
            },
            project: {
              name: 'TestProject',
              id: 'project-id',
            },
            repository: {
              name: 'TestRepo',
              id: 'repo-id',
              type: 'git',
            },
            versions: [
              {
                branchName: 'main',
                changeId: 'commit-hash',
              },
            ],
            contentId: `content-hash-${i}`,
          })),
      },
    };

    mockedAxios.post.mockResolvedValueOnce(mockSearchResponse);

    // Act
    await searchCode(mockConnection, {
      searchText: 'example',
      projectId: 'TestProject',
      top: 10,
      skip: 20,
    });

    // Assert
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        $top: 10,
        $skip: 20,
      }),
      expect.any(Object),
    );
  });

  test('should handle errors when fetching file content', async () => {
    // Arrange
    const mockSearchResponse = {
      data: {
        count: 1,
        results: [
          {
            fileName: 'example.ts',
            path: '/src/example.ts',
            matches: {
              content: [
                {
                  charOffset: 17,
                  length: 7,
                },
              ],
            },
            collection: {
              name: 'DefaultCollection',
            },
            project: {
              name: 'TestProject',
              id: 'project-id',
            },
            repository: {
              name: 'TestRepo',
              id: 'repo-id',
              type: 'git',
            },
            versions: [
              {
                branchName: 'main',
                changeId: 'commit-hash',
              },
            ],
            contentId: 'content-hash',
          },
        ],
      },
    };

    mockedAxios.post.mockResolvedValueOnce(mockSearchResponse);

    // Mock Git API to throw an error
    const mockGitApi = {
      getItemContent: jest
        .fn()
        .mockRejectedValue(new Error('Failed to fetch content')),
    };
    const mockConnectionWithError = {
      ...mockConnection,
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
    } as unknown as WebApi;

    // Act
    const result = await searchCode(mockConnectionWithError, {
      searchText: 'example',
      projectId: 'TestProject',
      includeContent: true,
    });

    // Assert
    expect(result).toBeDefined();
    expect(result.count).toBe(1);
    expect(result.results).toHaveLength(1);
    // Content should be undefined when there's an error fetching it
    expect(result.results[0].content).toBeUndefined();
  });

  test('should perform organization-wide search when projectId is not provided', async () => {
    // Arrange
    const mockSearchResponse = {
      data: {
        count: 2,
        results: [
          {
            fileName: 'example1.ts',
            path: '/src/example1.ts',
            matches: {
              content: [
                {
                  charOffset: 17,
                  length: 7,
                },
              ],
            },
            collection: {
              name: 'DefaultCollection',
            },
            project: {
              name: 'Project1',
              id: 'project-id-1',
            },
            repository: {
              name: 'Repo1',
              id: 'repo-id-1',
              type: 'git',
            },
            versions: [
              {
                branchName: 'main',
                changeId: 'commit-hash-1',
              },
            ],
            contentId: 'content-hash-1',
          },
          {
            fileName: 'example2.ts',
            path: '/src/example2.ts',
            matches: {
              content: [
                {
                  charOffset: 17,
                  length: 7,
                },
              ],
            },
            collection: {
              name: 'DefaultCollection',
            },
            project: {
              name: 'Project2',
              id: 'project-id-2',
            },
            repository: {
              name: 'Repo2',
              id: 'repo-id-2',
              type: 'git',
            },
            versions: [
              {
                branchName: 'main',
                changeId: 'commit-hash-2',
              },
            ],
            contentId: 'content-hash-2',
          },
        ],
      },
    };

    mockedAxios.post.mockResolvedValueOnce(mockSearchResponse);

    // Act
    const result = await searchCode(mockConnection, {
      searchText: 'example',
      includeContent: false,
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
        'https://almsearch.dev.azure.com/testorg/_apis/search/codesearchresults',
      ),
      expect.not.objectContaining({
        filters: expect.objectContaining({
          Project: expect.anything(),
        }),
      }),
      expect.any(Object),
    );
  });

  test('should handle includeContent for different content types', async () => {
    // Arrange
    const mockSearchResponse = {
      data: {
        count: 4,
        results: [
          // Result 1 - Buffer content
          {
            fileName: 'example1.ts',
            path: '/src/example1.ts',
            matches: {
              content: [
                {
                  charOffset: 17,
                  length: 7,
                },
              ],
            },
            collection: {
              name: 'DefaultCollection',
            },
            project: {
              name: 'TestProject',
              id: 'project-id',
            },
            repository: {
              name: 'TestRepo',
              id: 'repo-id-1',
              type: 'git',
            },
            versions: [
              {
                branchName: 'main',
                changeId: 'commit-hash-1',
              },
            ],
            contentId: 'content-hash-1',
          },
          // Result 2 - String content
          {
            fileName: 'example2.ts',
            path: '/src/example2.ts',
            matches: {
              content: [
                {
                  charOffset: 17,
                  length: 7,
                },
              ],
            },
            collection: {
              name: 'DefaultCollection',
            },
            project: {
              name: 'TestProject',
              id: 'project-id',
            },
            repository: {
              name: 'TestRepo',
              id: 'repo-id-2',
              type: 'git',
            },
            versions: [
              {
                branchName: 'main',
                changeId: 'commit-hash-2',
              },
            ],
            contentId: 'content-hash-2',
          },
          // Result 3 - Object content
          {
            fileName: 'example3.ts',
            path: '/src/example3.ts',
            matches: {
              content: [
                {
                  charOffset: 17,
                  length: 7,
                },
              ],
            },
            collection: {
              name: 'DefaultCollection',
            },
            project: {
              name: 'TestProject',
              id: 'project-id',
            },
            repository: {
              name: 'TestRepo',
              id: 'repo-id-3',
              type: 'git',
            },
            versions: [
              {
                branchName: 'main',
                changeId: 'commit-hash-3',
              },
            ],
            contentId: 'content-hash-3',
          },
          // Result 4 - Uint8Array content
          {
            fileName: 'example4.ts',
            path: '/src/example4.ts',
            matches: {
              content: [
                {
                  charOffset: 17,
                  length: 7,
                },
              ],
            },
            collection: {
              name: 'DefaultCollection',
            },
            project: {
              name: 'TestProject',
              id: 'project-id',
            },
            repository: {
              name: 'TestRepo',
              id: 'repo-id-4',
              type: 'git',
            },
            versions: [
              {
                branchName: 'main',
                changeId: 'commit-hash-4',
              },
            ],
            contentId: 'content-hash-4',
          },
        ],
      },
    };

    mockedAxios.post.mockResolvedValueOnce(mockSearchResponse);

    // Create mock contents for each type
    const bufferContent = Buffer.from('Buffer content');
    const stringContent = 'String content';
    const objectContent = { foo: 'bar', baz: 42 };
    const uint8ArrayContent = new Uint8Array([104, 101, 108, 108, 111]); // "hello" in ASCII

    // Mock Git API with different content types
    const mockGitApi = {
      getItemContent: jest
        .fn()
        .mockImplementationOnce(() => Promise.resolve(bufferContent))
        .mockImplementationOnce(() => Promise.resolve(stringContent))
        .mockImplementationOnce(() => Promise.resolve(objectContent))
        .mockImplementationOnce(() => Promise.resolve(uint8ArrayContent)),
    };

    const mockConnectionWithDifferentContentTypes = {
      ...mockConnection,
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
      serverUrl: 'https://dev.azure.com/testorg',
    } as unknown as WebApi;

    // Act
    const result = await searchCode(mockConnectionWithDifferentContentTypes, {
      searchText: 'example',
      projectId: 'TestProject',
      includeContent: true,
    });

    // Assert
    expect(result).toBeDefined();
    expect(result.count).toBe(4);
    expect(result.results).toHaveLength(4);

    // Check each result has appropriate content
    // Result 1 - Buffer should be converted to string
    expect(result.results[0].content).toBe('Buffer content');

    // Result 2 - String should remain the same
    expect(result.results[1].content).toBe('String content');

    // Result 3 - Object should be stringified
    expect(result.results[2].content).toBe(JSON.stringify(objectContent));

    // Result 4 - Uint8Array should be converted to string
    expect(result.results[3].content).toBe('hello');

    // Git API should have been called 4 times
    expect(mockGitApi.getItemContent).toHaveBeenCalledTimes(4);
  });
});
