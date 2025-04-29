import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';

/**
 * Function type for identifying if a request belongs to a specific feature.
 */
export interface RequestIdentifier {
  (request: CallToolRequest): boolean;
}

/**
 * Function type for handling feature-specific requests.
 */
export interface RequestHandler {
  (connection: WebApi, request: CallToolRequest): any;
}
