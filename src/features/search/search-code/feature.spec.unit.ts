import axios from 'axios';
import { searchCode } from './feature';
import { WebApi } from 'azure-devops-node-api';
import { AzureDevOpsError } from '../../../shared/errors';
import { GitVersionType } from 'azure-devops-node-api/interfaces/GitInterfaces';

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

    // Create a mock stream with content
    const fileContent = 'export function example() { return "test"; }';
    const mockStream = {
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'data') {
          // Call the callback with the data
          callback(Buffer.from(fileContent));
        } else if (event === 'end') {
          // Call the end callback asynchronously
          setTimeout(callback, 0);
        }
        return mockStream; // Return this for chaining
      }),
    };

    // Mock Git API to return content
    const mockGitApi = {
      getItemContent: jest.fn().mockResolvedValue(mockStream),
    };

    const mockConnectionWithContent = {
      ...mockConnection,
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
      serverUrl: 'https://dev.azure.com/testorg',
    } as unknown as WebApi;

    // Act
    const result = await searchCode(mockConnectionWithContent, {
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
    expect(mockGitApi.getItemContent).toHaveBeenCalledTimes(1);
    expect(mockGitApi.getItemContent).toHaveBeenCalledWith(
      'repo-id',
      '/src/example.ts',
      'TestProject',
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      {
        version: 'commit-hash',
        versionType: GitVersionType.Commit,
      },
      true,
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

    // Create mock contents for each type - all as streams, since that's what getItemContent returns
    // These are all streams but with different content to demonstrate handling different data types from the stream
    const createMockStream = (content: string) => ({
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from(content));
        } else if (event === 'end') {
          setTimeout(callback, 0);
        }
        return createMockStream(content); // Return this for chaining
      }),
    });

    // Create four different mock streams with different content
    const mockStream1 = createMockStream('Buffer content');
    const mockStream2 = createMockStream('String content');
    const mockStream3 = createMockStream(
      JSON.stringify({ foo: 'bar', baz: 42 }),
    );
    const mockStream4 = createMockStream('hello');

    // Mock Git API to return our different mock streams for each repository
    const mockGitApi = {
      getItemContent: jest
        .fn()
        .mockImplementationOnce(() => Promise.resolve(mockStream1))
        .mockImplementationOnce(() => Promise.resolve(mockStream2))
        .mockImplementationOnce(() => Promise.resolve(mockStream3))
        .mockImplementationOnce(() => Promise.resolve(mockStream4)),
    };

    const mockConnectionWithStreams = {
      ...mockConnection,
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
      serverUrl: 'https://dev.azure.com/testorg',
    } as unknown as WebApi;

    // Act
    const result = await searchCode(mockConnectionWithStreams, {
      searchText: 'example',
      projectId: 'TestProject',
      includeContent: true,
    });

    // Assert
    expect(result).toBeDefined();
    expect(result.count).toBe(4);
    expect(result.results).toHaveLength(4);

    // Check each result has appropriate content from the streams
    // Result 1 - Buffer content stream
    expect(result.results[0].content).toBe('Buffer content');

    // Result 2 - String content stream
    expect(result.results[1].content).toBe('String content');

    // Result 3 - JSON object content stream
    expect(result.results[2].content).toBe('{"foo":"bar","baz":42}');

    // Result 4 - Text content stream
    expect(result.results[3].content).toBe('hello');

    // Git API should have been called 4 times
    expect(mockGitApi.getItemContent).toHaveBeenCalledTimes(4);
    // Verify the parameters for the first call
    expect(mockGitApi.getItemContent.mock.calls[0]).toEqual([
      'repo-id-1',
      '/src/example1.ts',
      'TestProject',
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      {
        version: 'commit-hash-1',
        versionType: GitVersionType.Commit,
      },
      true,
    ]);
  });

  test('should properly convert content stream to string', async () => {
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

    // Create a mock ReadableStream
    const mockContent = 'This is the file content';

    // Create a simplified mock stream that emits the content
    const mockStream = {
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'data') {
          // Call the callback with the data
          callback(Buffer.from(mockContent));
        } else if (event === 'end') {
          // Call the end callback asynchronously
          setTimeout(callback, 0);
        }
        return mockStream; // Return this for chaining
      }),
    };

    // Mock Git API to return our mock stream
    const mockGitApi = {
      getItemContent: jest.fn().mockResolvedValue(mockStream),
    };

    const mockConnectionWithStream = {
      ...mockConnection,
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
      serverUrl: 'https://dev.azure.com/testorg',
    } as unknown as WebApi;

    // Act
    const result = await searchCode(mockConnectionWithStream, {
      searchText: 'example',
      projectId: 'TestProject',
      includeContent: true,
    });

    // Assert
    expect(result).toBeDefined();
    expect(result.count).toBe(1);
    expect(result.results).toHaveLength(1);

    // Check that the content was properly converted from stream to string
    expect(result.results[0].content).toBe(mockContent);

    // Verify the stream event handlers were attached
    expect(mockStream.on).toHaveBeenCalledWith('data', expect.any(Function));
    expect(mockStream.on).toHaveBeenCalledWith('end', expect.any(Function));
    expect(mockStream.on).toHaveBeenCalledWith('error', expect.any(Function));

    // Verify the parameters for getItemContent
    expect(mockGitApi.getItemContent).toHaveBeenCalledWith(
      'repo-id',
      '/src/example.ts',
      'TestProject',
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      {
        version: 'commit-hash',
        versionType: GitVersionType.Commit,
      },
      true,
    );
  });

  test('should limit top to 10 when includeContent is true', async () => {
    // Arrange
    const mockSearchResponse = {
      data: {
        count: 10,
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
      top: 50, // User tries to get 50 results
      includeContent: true, // But includeContent is true
    });

    // Assert
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        $top: 10, // Should be limited to 10
      }),
      expect.any(Object),
    );
  });

  test('should not limit top when includeContent is false', async () => {
    // Arrange
    const mockSearchResponse = {
      data: {
        count: 50,
        results: Array(50)
          .fill(0)
          .map((_, i) => ({
            // ... simplified result object
            fileName: `example${i}.ts`,
          })),
      },
    };

    mockedAxios.post.mockResolvedValueOnce(mockSearchResponse);

    // Act
    await searchCode(mockConnection, {
      searchText: 'example',
      projectId: 'TestProject',
      top: 50, // User wants 50 results
      includeContent: false, // includeContent is false
    });

    // Assert
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        $top: 50, // Should use requested value
      }),
      expect.any(Object),
    );
  });
});
