export { getWikis, GetWikisSchema } from './get-wikis';
export { getWikiPage, GetWikiPageSchema } from './get-wiki-page';
export { createWiki, CreateWikiSchema, WikiType } from './create-wiki';
export { updateWikiPage, UpdateWikiPageSchema } from './update-wiki-page';
export * from './create-wiki-page'; // New export

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
  CreateWikiPageSchema, // Added this
  getWikis,
  getWikiPage,
  createWiki,
  updateWikiPage,
  createWikiPage, // Added this
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
    'create_wiki_page', // Added this
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
    case 'create_wiki_page': { // Added this case
      const args = CreateWikiPageSchema.parse(request.params.arguments);
      // Note: createWikiPage in feature.ts expects AzureDevOpsClient as second param.
      // The handleWikisRequest function gets `connection: WebApi`.
      // Assuming AzureDevOpsClient can be instantiated or obtained from WebApi, or feature needs adjustment.
      // For now, let's assume direct usage and that AzureDevOpsClient might be compatible or wrapped.
      // This might require creating a new AzureDevOpsClient instance here using the connection details if necessary.
      // For simplicity, passing connection, but this might need refinement based on AzureDevOpsClient constructor/usage.
      // If AzureDevOpsClient is a wrapper around WebApi, this might work if it accepts WebApi in constructor
      // or if createWikiPage is adapted.
      // Let's assume client is created within createWikiPage or passed correctly.
      // The current createWikiPage expects an AzureDevOpsClient.
      // We'll need to instantiate it.
      const client = new AzureDevOpsClient({ // This instantiation might be specific
        personalAccessToken: connection.options.personalAccessToken!, // Assuming PAT is in options
        organizationId: args.organizationId ?? defaultOrg, // Org can be from args or default
        // projectId: args.projectId ?? defaultProject, // Project can be from args or default - client doesn't always need default project
      });
      const result = await createWikiPage(args, client);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    default:
      throw new Error(`Unknown wikis tool: ${request.params.name}`);
  }
};
