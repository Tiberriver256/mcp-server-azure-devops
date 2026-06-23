/**
 * Users feature module
 *
 * This module contains user-related functionality.
 */

export * from './types';
export * from './get-me';

// Export tool definitions
export * from './tool-definitions';

// New exports for request handling
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import { RequestHandler } from '../../shared/types/request-handler';
import { createRequestIdentifier, jsonResponse } from '../../shared/handlers';
import { getMe } from './';

/**
 * Checks if the request is for the users feature
 */
export const isUsersRequest = createRequestIdentifier(['get_me']);

/**
 * Handles users feature requests
 */
export const handleUsersRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
): Promise<{ content: Array<{ type: string; text: string }> }> => {
  switch (request.params.name) {
    case 'get_me': {
      const result = await getMe(connection);
      return jsonResponse(result);
    }
    default:
      throw new Error(`Unknown users tool: ${request.params.name}`);
  }
};
