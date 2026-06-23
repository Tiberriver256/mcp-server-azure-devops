export * from './schemas';
export * from './types';
export * from './search-code';
export * from './search-wiki';
export * from './search-work-items';

// Export tool definitions
export * from './tool-definitions';

// New exports for request handling
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import { RequestHandler } from '../../shared/types/request-handler';
import { createRequestIdentifier, jsonResponse } from '../../shared/handlers';
import {
  SearchCodeSchema,
  SearchWikiSchema,
  SearchWorkItemsSchema,
  searchCode,
  searchWiki,
  searchWorkItems,
} from './';

/**
 * Checks if the request is for the search feature
 */
export const isSearchRequest = createRequestIdentifier([
  'search_code',
  'search_wiki',
  'search_work_items',
]);

/**
 * Handles search feature requests
 */
export const handleSearchRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
): Promise<{ content: Array<{ type: string; text: string }> }> => {
  switch (request.params.name) {
    case 'search_code': {
      const args = SearchCodeSchema.parse(request.params.arguments);
      const result = await searchCode(connection, args);
      return jsonResponse(result);
    }
    case 'search_wiki': {
      const args = SearchWikiSchema.parse(request.params.arguments);
      const result = await searchWiki(connection, args);
      return jsonResponse(result);
    }
    case 'search_work_items': {
      const args = SearchWorkItemsSchema.parse(request.params.arguments);
      const result = await searchWorkItems(connection, args);
      return jsonResponse(result);
    }
    default:
      throw new Error(`Unknown search tool: ${request.params.name}`);
  }
};
