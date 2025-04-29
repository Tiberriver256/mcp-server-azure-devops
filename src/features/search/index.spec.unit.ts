import { WebApi } from 'azure-devops-node-api';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { isSearchRequest, handleSearchRequest } from './index';
import { searchCode } from './search-code';
import { searchWiki } from './search-wiki';
import { searchWorkItems } from './search-work-items';

// Mock the imported modules
jest.mock('./search-code', () => ({
  searchCode: jest.fn(),
}));

jest.mock('./search-wiki', () => ({
  searchWiki: jest.fn(),
}));

jest.mock('./search-work-items', () => ({
  searchWorkItems: jest.fn(),
}));

describe('Search Request Handlers', () => {
  const mockConnection = {} as WebApi;

  describe('isSearchRequest', () => {
    it('should return true for search requests', () => {
      const validTools = ['search_code', 'search_wiki', 'search_work_items'];
      validTools.forEach((tool) => {
        const request = {
          params: { name: tool, arguments: {} },
          method: 'tools/call',
        } as CallToolRequest;
        expect(isSearchRequest(request)).toBe(true);
      });
    });

    it('should return false for non-search requests', () => {
      const request = {
        params: { name: 'list_projects', arguments: {} },
        method: 'tools/call',
      } as CallToolRequest;
      expect(isSearchRequest(request)).toBe(false);
    });
  });

  describe('handleSearchRequest', () => {
    it('should handle search_code request', async () => {
      const mockSearchResults = {
        count: 2,
        results: [
          { fileName: 'file1.ts', path: '/path/to/file1.ts' },
          { fileName: 'file2.ts', path: '/path/to/file2.ts' },
        ],
      };
      (searchCode as jest.Mock).mockResolvedValue(mockSearchResults);

      const request = {
        params: {
          name: 'search_code',
          arguments: {
            searchText: 'function',
            projectId: 'project1',
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      const response = await handleSearchRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text)).toEqual(mockSearchResults);
      expect(searchCode).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          searchText: 'function',
          projectId: 'project1',
        }),
      );
    });

    it('should handle search_wiki request', async () => {
      const mockSearchResults = {
        count: 1,
        results: [{ title: 'Wiki Page', path: '/path/to/page' }],
      };
      (searchWiki as jest.Mock).mockResolvedValue(mockSearchResults);

      const request = {
        params: {
          name: 'search_wiki',
          arguments: {
            searchText: 'documentation',
            projectId: 'project1',
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      const response = await handleSearchRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text)).toEqual(mockSearchResults);
      expect(searchWiki).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          searchText: 'documentation',
          projectId: 'project1',
        }),
      );
    });

    it('should handle search_work_items request', async () => {
      const mockSearchResults = {
        count: 2,
        results: [
          { id: 1, title: 'Bug 1' },
          { id: 2, title: 'Feature 2' },
        ],
      };
      (searchWorkItems as jest.Mock).mockResolvedValue(mockSearchResults);

      const request = {
        params: {
          name: 'search_work_items',
          arguments: {
            searchText: 'bug',
            projectId: 'project1',
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      const response = await handleSearchRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text)).toEqual(mockSearchResults);
      expect(searchWorkItems).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          searchText: 'bug',
          projectId: 'project1',
        }),
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
        handleSearchRequest(mockConnection, request),
      ).rejects.toThrow('Unknown search tool');
    });

    it('should propagate errors from search functions', async () => {
      const mockError = new Error('Test error');
      (searchCode as jest.Mock).mockRejectedValue(mockError);

      const request = {
        params: {
          name: 'search_code',
          arguments: {
            searchText: 'function',
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      await expect(
        handleSearchRequest(mockConnection, request),
      ).rejects.toThrow(mockError);
    });
  });
});
