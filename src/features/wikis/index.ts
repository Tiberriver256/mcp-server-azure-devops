export { getWikis, GetWikisSchema } from './get-wikis';
export { getWikiPage, GetWikiPageSchema } from './get-wiki-page';
export { createWiki, CreateWikiSchema, WikiType } from './create-wiki';
export { updateWikiPage, UpdateWikiPageSchema } from './update-wiki-page';
export { listWikiPages, ListWikiPagesSchema } from './list-wiki-pages';
export { createWikiPage, CreateWikiPageSchema } from './create-wiki-page';

// Export tool definitions
export * from './tool-definitions';

// New exports for request handling
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import {
  RequestIdentifier,
  RequestHandler,
} from '../../shared/types/request-handler';
import { defaultProject, defaultOrg } from '../../utils/environment';
import {
  GetWikisSchema,
  GetWikiPageSchema,
  CreateWikiSchema,
  UpdateWikiPageSchema,
  ListWikiPagesSchema,
  CreateWikiPageSchema,
  getWikis,
  getWikiPage,
  createWiki,
  updateWikiPage,
  listWikiPages,
  createWikiPage,
} from './';

/**
 * Checks if the request is for the wikis feature
 */
export const isWikisRequest: RequestIdentifier = (
  request: CallToolRequest,
): boolean => {
  const toolName = request.params.name;
  return [
    'get_wikis',
    'get_wiki_page',
    'create_wiki',
    'update_wiki_page',
    'list_wiki_pages',
    'create_wiki_page',
  ].includes(toolName);
};

/**
 * Handles wikis feature requests
 */
export const handleWikisRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
): Promise<{ content: Array<{ type: string; text: string }> }> => {
  switch (request.params.name) {
    case 'get_wikis': {
      const args = GetWikisSchema.parse(request.params.arguments);
      const result = await getWikis(connection, {
        organizationId: args.organizationId ?? defaultOrg,
        projectId: args.projectId ?? defaultProject,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'get_wiki_page': {
      const args = GetWikiPageSchema.parse(request.params.arguments);
      const result = await getWikiPage({
        organizationId: args.organizationId ?? defaultOrg,
        projectId: args.projectId ?? defaultProject,
        wikiId: args.wikiId,
        pagePath: args.pagePath,
      });
      return {
        content: [{ type: 'text', text: result }],
      };
    }
    case 'create_wiki': {
      const args = CreateWikiSchema.parse(request.params.arguments);
      const result = await createWiki(connection, {
        organizationId: args.organizationId ?? defaultOrg,
        projectId: args.projectId ?? defaultProject,
        name: args.name,
        type: args.type,
        repositoryId: args.repositoryId ?? undefined,
        mappedPath: args.mappedPath ?? undefined,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'update_wiki_page': {
      const args = UpdateWikiPageSchema.parse(request.params.arguments);
      const result = await updateWikiPage({
        organizationId: args.organizationId ?? defaultOrg,
        projectId: args.projectId ?? defaultProject,
        wikiId: args.wikiId,
        pagePath: args.pagePath,
        content: args.content,
        comment: args.comment,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'list_wiki_pages': {
      const args = ListWikiPagesSchema.parse(request.params.arguments);
      const result = await listWikiPages({
        organizationId: args.organizationId ?? defaultOrg,
        projectId: args.projectId ?? defaultProject,
        wikiId: args.wikiId,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'create_wiki_page': {
      const args = CreateWikiPageSchema.parse(request.params.arguments);
      const result = await createWikiPage({
        organizationId: args.organizationId ?? defaultOrg,
        projectId: args.projectId ?? defaultProject,
        wikiId: args.wikiId,
        pagePath: args.pagePath,
        content: args.content,
        comment: args.comment,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    default:
      throw new Error(`Unknown wikis tool: ${request.params.name}`);
  }
};
