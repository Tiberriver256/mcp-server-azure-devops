import { WebApi } from 'azure-devops-node-api';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { isRepositoriesRequest, handleRepositoriesRequest } from './index';
import { getRepository } from './get-repository';
import { getRepositoryDetails } from './get-repository-details';
import { listRepositories } from './list-repositories';
import { getFileContent } from './get-file-content';
import {
  getAllRepositoriesTree,
  formatRepositoryTree,
} from './get-all-repositories-tree';
import { GitVersionType } from 'azure-devops-node-api/interfaces/GitInterfaces';

// Mock the imported modules
jest.mock('./get-repository', () => ({
  getRepository: jest.fn(),
}));

jest.mock('./get-repository-details', () => ({
  getRepositoryDetails: jest.fn(),
}));

jest.mock('./list-repositories', () => ({
  listRepositories: jest.fn(),
}));

jest.mock('./get-file-content', () => ({
  getFileContent: jest.fn(),
}));

jest.mock('./get-all-repositories-tree', () => ({
  getAllRepositoriesTree: jest.fn(),
  formatRepositoryTree: jest.fn(),
}));

describe('Repositories Request Handlers', () => {
  const mockConnection = {} as WebApi;

  describe('isRepositoriesRequest', () => {
    it('should return true for repositories requests', () => {
      const validTools = [
        'get_repository',
        'get_repository_details',
        'list_repositories',
        'get_file_content',
        'get_all_repositories_tree',
      ];
      validTools.forEach((tool) => {
        const request = {
          params: { name: tool, arguments: {} },
          method: 'tools/call',
        } as CallToolRequest;
        expect(isRepositoriesRequest(request)).toBe(true);
      });
    });

    it('should return false for non-repositories requests', () => {
      const request = {
        params: { name: 'list_projects', arguments: {} },
        method: 'tools/call',
      } as CallToolRequest;
      expect(isRepositoriesRequest(request)).toBe(false);
    });
  });

  describe('handleRepositoriesRequest', () => {
    it('should handle get_repository request', async () => {
      const mockRepository = { id: 'repo1', name: 'Repository 1' };
      (getRepository as jest.Mock).mockResolvedValue(mockRepository);

      const request = {
        params: {
          name: 'get_repository',
          arguments: {
            repositoryId: 'repo1',
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      const response = await handleRepositoriesRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text)).toEqual(mockRepository);
      expect(getRepository).toHaveBeenCalledWith(
        mockConnection,
        expect.any(String),
        'repo1',
      );
    });

    it('should handle get_repository_details request', async () => {
      const mockRepositoryDetails = {
        repository: { id: 'repo1', name: 'Repository 1' },
        statistics: { branches: [] },
        refs: { value: [], count: 0 },
      };
      (getRepositoryDetails as jest.Mock).mockResolvedValue(
        mockRepositoryDetails,
      );

      const request = {
        params: {
          name: 'get_repository_details',
          arguments: {
            repositoryId: 'repo1',
            includeStatistics: true,
            includeRefs: true,
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      const response = await handleRepositoriesRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text)).toEqual(
        mockRepositoryDetails,
      );
      expect(getRepositoryDetails).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          repositoryId: 'repo1',
          includeStatistics: true,
          includeRefs: true,
        }),
      );
    });

    it('should handle list_repositories request', async () => {
      const mockRepositories = [
        { id: 'repo1', name: 'Repository 1' },
        { id: 'repo2', name: 'Repository 2' },
      ];
      (listRepositories as jest.Mock).mockResolvedValue(mockRepositories);

      const request = {
        params: {
          name: 'list_repositories',
          arguments: {
            projectId: 'project1',
            includeLinks: true,
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      const response = await handleRepositoriesRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text)).toEqual(mockRepositories);
      expect(listRepositories).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          projectId: 'project1',
          includeLinks: true,
        }),
      );
    });

    it('should handle get_file_content request', async () => {
      const mockFileContent = { content: 'file content', isFolder: false };
      (getFileContent as jest.Mock).mockResolvedValue(mockFileContent);

      const request = {
        params: {
          name: 'get_file_content',
          arguments: {
            repositoryId: 'repo1',
            path: '/path/to/file',
            version: 'main',
            versionType: 'branch',
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      const response = await handleRepositoriesRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text)).toEqual(mockFileContent);
      expect(getFileContent).toHaveBeenCalledWith(
        mockConnection,
        expect.any(String),
        'repo1',
        '/path/to/file',
        { versionType: GitVersionType.Branch, version: 'main' },
      );
    });

    it('should handle get_all_repositories_tree request', async () => {
      const mockTreeResponse = {
        repositories: [
          {
            name: 'repo1',
            tree: [
              { name: 'file1', path: '/file1', isFolder: false, level: 0 },
            ],
            stats: { directories: 0, files: 1 },
          },
        ],
      };
      (getAllRepositoriesTree as jest.Mock).mockResolvedValue(mockTreeResponse);
      (formatRepositoryTree as jest.Mock).mockReturnValue('repo1\n  file1\n');

      const request = {
        params: {
          name: 'get_all_repositories_tree',
          arguments: {
            projectId: 'project1',
            depth: 2,
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      const response = await handleRepositoriesRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(response.content[0].text).toContain('repo1');
      expect(getAllRepositoriesTree).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          projectId: 'project1',
          depth: 2,
        }),
      );
      expect(formatRepositoryTree).toHaveBeenCalledWith(
        'repo1',
        expect.any(Array),
        expect.any(Object),
        undefined,
      );
    });

    it('should throw error for unknown tool', async () => {
      const request = {
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
        method: 'tools/call',
      } as CallToolRequest;

      await expect(
        handleRepositoriesRequest(mockConnection, request),
      ).rejects.toThrow('Unknown repositories tool');
    });

    it('should propagate errors from repository functions', async () => {
      const mockError = new Error('Test error');
      (listRepositories as jest.Mock).mockRejectedValue(mockError);

      const request = {
        params: {
          name: 'list_repositories',
          arguments: {
            projectId: 'project1',
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      await expect(
        handleRepositoriesRequest(mockConnection, request),
      ).rejects.toThrow(mockError);
    });
  });
});
