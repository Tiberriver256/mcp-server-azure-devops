import { WebApi } from 'azure-devops-node-api';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { isWikisRequest, handleWikisRequest } from './index';
import { getWikis, GetWikisSchema } from './get-wikis';
import { getWikiPage, GetWikiPageSchema } from './get-wiki-page';
import { createWiki, CreateWikiSchema, WikiType } from './create-wiki';
import { updateWikiPage, UpdateWikiPageSchema } from './update-wiki-page';

// Mock the imported modules
jest.mock('./get-wikis', () => ({
  getWikis: jest.fn(),
  GetWikisSchema: {
    parse: jest.fn(),
  },
}));

jest.mock('./get-wiki-page', () => ({
  getWikiPage: jest.fn(),
  GetWikiPageSchema: {
    parse: jest.fn(),
  },
}));

jest.mock('./create-wiki', () => ({
  createWiki: jest.fn(),
  CreateWikiSchema: {
    parse: jest.fn(),
  },
  WikiType: {
    ProjectWiki: 'projectWiki',
    CodeWiki: 'codeWiki',
  },
}));

jest.mock('./update-wiki-page', () => ({
  updateWikiPage: jest.fn(),
  UpdateWikiPageSchema: {
    parse: jest.fn(),
  },
}));

describe('Wikis Request Handlers', () => {
  const mockConnection = {} as WebApi;

  describe('isWikisRequest', () => {
    it('should return true for wikis requests', () => {
      const validTools = [
        'get_wikis',
        'get_wiki_page',
        'create_wiki',
        'update_wiki_page',
      ];
      validTools.forEach((tool) => {
        const request = {
          params: { name: tool, arguments: {} },
          method: 'tools/call',
        } as CallToolRequest;
        expect(isWikisRequest(request)).toBe(true);
      });
    });

    it('should return false for non-wikis requests', () => {
      const request = {
        params: { name: 'list_projects', arguments: {} },
        method: 'tools/call',
      } as CallToolRequest;
      expect(isWikisRequest(request)).toBe(false);
    });
  });

  describe('handleWikisRequest', () => {
    it('should handle get_wikis request', async () => {
      const mockWikis = [
        { id: 'wiki1', name: 'Wiki 1' },
        { id: 'wiki2', name: 'Wiki 2' },
      ];
      (getWikis as jest.Mock).mockResolvedValue(mockWikis);

      const request = {
        params: {
          name: 'get_wikis',
          arguments: {
            projectId: 'project1',
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      // Mock the arguments object after parsing
      (GetWikisSchema.parse as jest.Mock).mockReturnValue({
        projectId: 'project1',
      });

      const response = await handleWikisRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text as string)).toEqual(mockWikis);
      expect(getWikis).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          projectId: 'project1',
        }),
      );
    });

    it('should handle get_wiki_page request', async () => {
      const mockWikiContent = '# Wiki Page\n\nThis is a wiki page content.';
      (getWikiPage as jest.Mock).mockResolvedValue(mockWikiContent);

      const request = {
        params: {
          name: 'get_wiki_page',
          arguments: {
            projectId: 'project1',
            wikiId: 'wiki1',
            pagePath: '/Home',
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      // Mock the arguments object after parsing
      (GetWikiPageSchema.parse as jest.Mock).mockReturnValue({
        projectId: 'project1',
        wikiId: 'wiki1',
        pagePath: '/Home',
      });

      const response = await handleWikisRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(response.content[0].text as string).toEqual(mockWikiContent);
      expect(getWikiPage).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project1',
          wikiId: 'wiki1',
          pagePath: '/Home',
        }),
      );
    });

    it('should handle create_wiki request', async () => {
      const mockWiki = { id: 'wiki1', name: 'New Wiki' };
      (createWiki as jest.Mock).mockResolvedValue(mockWiki);

      const request = {
        params: {
          name: 'create_wiki',
          arguments: {
            projectId: 'project1',
            name: 'New Wiki',
            type: WikiType.ProjectWiki,
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      // Mock the arguments object after parsing
      (CreateWikiSchema.parse as jest.Mock).mockReturnValue({
        projectId: 'project1',
        name: 'New Wiki',
        type: WikiType.ProjectWiki,
        mappedPath: null, // Required field in the schema
      });

      const response = await handleWikisRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text as string)).toEqual(mockWiki);
      expect(createWiki).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          projectId: 'project1',
          name: 'New Wiki',
          type: WikiType.ProjectWiki,
        }),
      );
    });

    it('should handle update_wiki_page request', async () => {
      const mockUpdateResult = { id: 'page1', content: 'Updated content' };
      (updateWikiPage as jest.Mock).mockResolvedValue(mockUpdateResult);

      const request = {
        params: {
          name: 'update_wiki_page',
          arguments: {
            projectId: 'project1',
            wikiId: 'wiki1',
            pagePath: '/Home',
            content: 'Updated content',
            comment: 'Update home page',
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      // Mock the arguments object after parsing
      (UpdateWikiPageSchema.parse as jest.Mock).mockReturnValue({
        projectId: 'project1',
        wikiId: 'wiki1',
        pagePath: '/Home',
        content: 'Updated content',
        comment: 'Update home page',
      });

      const response = await handleWikisRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text as string)).toEqual(
        mockUpdateResult,
      );
      expect(updateWikiPage).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project1',
          wikiId: 'wiki1',
          pagePath: '/Home',
          content: 'Updated content',
          comment: 'Update home page',
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

      await expect(handleWikisRequest(mockConnection, request)).rejects.toThrow(
        'Unknown wikis tool',
      );
    });

    it('should propagate errors from wiki functions', async () => {
      const mockError = new Error('Test error');
      (getWikis as jest.Mock).mockRejectedValue(mockError);

      const request = {
        params: {
          name: 'get_wikis',
          arguments: {
            projectId: 'project1',
          },
        },
        method: 'tools/call',
      } as CallToolRequest;

      // Mock the arguments object after parsing
      (GetWikisSchema.parse as jest.Mock).mockReturnValue({
        projectId: 'project1',
      });

      await expect(handleWikisRequest(mockConnection, request)).rejects.toThrow(
        mockError,
      );
    });
  });
});
