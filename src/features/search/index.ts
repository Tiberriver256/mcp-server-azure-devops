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
import {
  RequestIdentifier,
  RequestHandler,
} from '../../shared/types/request-handler';
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
export const isSearchRequest: RequestIdentifier = (
  request: CallToolRequest,
): boolean => {
  const toolName = request.params.name;
  return ['search_code', 'search_wiki', 'search_work_items'].includes(toolName);
};

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
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'search_wiki': {
      const args = SearchWikiSchema.parse(request.params.arguments);
      const result = await searchWiki(connection, args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'search_work_items': {
      const args = SearchWorkItemsSchema.parse(request.params.arguments);
      const result = await searchWorkItems(connection, args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    default:
      throw new Error(`Unknown search tool: ${request.params.name}`);
  }
};
