import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import type { IGitApi } from 'azure-devops-node-api/GitApi.js';
import {
  GitVersionType,
  VersionControlRecursionType,
} from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import { AzureDevOpsResourceNotFoundError } from '../../../shared/errors/index.ts';
import { getFileContent } from './feature.ts';
import { Readable } from 'stream';

void describe('getFileContent', () => {
  let mockConnection: WebApi;
  let mockGitApi: IGitApi;
  let mockGetGitApi: Mock<() => Promise<IGitApi>>;
  let mockGetItemContent: Mock<(...args: unknown[]) => Promise<Readable>>;
  let mockGetItems: Mock<(...args: unknown[]) => Promise<unknown[]>>;
  const mockRepositoryId = 'test-repo';
  const mockProjectId = 'test-project';
  const mockFilePath = '/path/to/file.txt';
  const mockFileContent = 'Test file content';
  const mockItem = {
    objectId: '123456',
    path: mockFilePath,
    url: 'https://dev.azure.com/org/project/_apis/git/repositories/repo/items/path/to/file.txt',
    gitObjectType: 'blob',
  };

  // Helper function to create a readable stream from a string
  function createReadableStream(content: string): Readable {
    const stream = new Readable();
    stream.push(content);
    stream.push(null); // Signals the end of the stream
    return stream;
  }

  beforeEach(() => {
    mockGetItemContent = mock.fn((..._args: unknown[]) =>
      Promise.resolve(createReadableStream(mockFileContent)),
    );
    mockGetItems = mock.fn((..._args: unknown[]) =>
      Promise.resolve([mockItem]),
    );
    mockGitApi = {
      getItemContent: mockGetItemContent,
      getItems: mockGetItems,
    } as unknown as IGitApi;

    mockGetGitApi = mock.fn(() => Promise.resolve(mockGitApi));
    mockConnection = {
      getGitApi: mockGetGitApi,
    } as unknown as WebApi;
  });

  void it('should get file content for a file in the default branch', async () => {
    const result = await getFileContent(
      mockConnection,
      mockProjectId,
      mockRepositoryId,
      mockFilePath,
    );

    assert.strictEqual(mockGetGitApi.mock.callCount(), 1);
    assert.strictEqual(mockGetItems.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetItems.mock.calls[0]?.arguments, [
      mockRepositoryId,
      mockProjectId,
      mockFilePath,
      VersionControlRecursionType.OneLevel,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);

    assert.strictEqual(mockGetItemContent.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetItemContent.mock.calls[0]?.arguments, [
      mockRepositoryId,
      mockFilePath,
      mockProjectId,
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      undefined,
      true,
    ]);

    assert.deepStrictEqual(result, {
      content: mockFileContent,
      isDirectory: false,
    });
  });

  void it('should get file content for a file in a specific branch', async () => {
    const branchName = 'test-branch';
    const versionDescriptor = {
      versionType: GitVersionType.Branch,
      version: branchName,
      versionOptions: undefined,
    };

    const result = await getFileContent(
      mockConnection,
      mockProjectId,
      mockRepositoryId,
      mockFilePath,
      {
        versionType: GitVersionType.Branch,
        version: branchName,
      },
    );

    assert.strictEqual(mockGetGitApi.mock.callCount(), 1);
    assert.strictEqual(mockGetItems.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetItems.mock.calls[0]?.arguments, [
      mockRepositoryId,
      mockProjectId,
      mockFilePath,
      VersionControlRecursionType.OneLevel,
      undefined,
      undefined,
      undefined,
      undefined,
      versionDescriptor,
    ]);

    assert.strictEqual(mockGetItemContent.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetItemContent.mock.calls[0]?.arguments, [
      mockRepositoryId,
      mockFilePath,
      mockProjectId,
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      versionDescriptor,
      true,
    ]);

    assert.deepStrictEqual(result, {
      content: mockFileContent,
      isDirectory: false,
    });
  });

  void it('should throw an error if the file is not found', async () => {
    // Mock getItems to throw an error
    mockGetItems.mock.mockImplementation(() =>
      Promise.reject(new Error('Item not found')),
    );

    // Mock getItemContent to throw a specific error indicating not found
    mockGetItemContent.mock.mockImplementation(() =>
      Promise.reject(new Error('Item not found')),
    );

    await assert.rejects(
      () =>
        getFileContent(
          mockConnection,
          mockProjectId,
          mockRepositoryId,
          '/invalid/path',
        ),
      AzureDevOpsResourceNotFoundError,
    );
  });

  void it('should get directory content if the path is a directory', async () => {
    const dirPath = '/path/to/dir';
    const mockDirectoryItems = [
      {
        path: `${dirPath}/file1.txt`,
        gitObjectType: 'blob',
        isFolder: false,
      },
      {
        path: `${dirPath}/file2.md`,
        gitObjectType: 'blob',
        isFolder: false,
      },
      {
        path: `${dirPath}/subdir`,
        gitObjectType: 'tree',
        isFolder: true,
      },
    ];

    // Mock getItems to return multiple items, indicating a directory
    mockGetItems.mock.mockImplementation(() =>
      Promise.resolve(mockDirectoryItems),
    );

    const result = await getFileContent(
      mockConnection,
      mockProjectId,
      mockRepositoryId,
      dirPath,
    );

    assert.strictEqual(mockGetGitApi.mock.callCount(), 1);
    assert.strictEqual(mockGetItems.mock.callCount(), 1);
    assert.deepStrictEqual(mockGetItems.mock.calls[0]?.arguments, [
      mockRepositoryId,
      mockProjectId,
      dirPath,
      VersionControlRecursionType.OneLevel,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);

    // Should not attempt to get file content for a directory
    assert.strictEqual(mockGetItemContent.mock.callCount(), 0);

    assert.deepStrictEqual(result, {
      content: JSON.stringify(mockDirectoryItems, null, 2),
      isDirectory: true,
    });
  });

  void it('should handle a directory path with trailing slash', async () => {
    const dirPath = '/path/to/dir/';
    const mockDirectoryItems = [
      {
        path: `${dirPath}file1.txt`,
        gitObjectType: 'blob',
        isFolder: false,
      },
    ];

    // Even with one item, it should be treated as a directory due to trailing slash
    mockGetItems.mock.mockImplementation(() =>
      Promise.resolve(mockDirectoryItems),
    );

    const result = await getFileContent(
      mockConnection,
      mockProjectId,
      mockRepositoryId,
      dirPath,
    );

    assert.strictEqual(result.isDirectory, true);
    assert.strictEqual(
      result.content,
      JSON.stringify(mockDirectoryItems, null, 2),
    );
  });
});
