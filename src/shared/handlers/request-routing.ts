import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import { RequestIdentifier, RequestHandler } from '../types/request-handler';

/**
 * Creates a RequestIdentifier that matches against a fixed set of tool names.
 */
export function createRequestIdentifier(
  toolNames: string[],
): RequestIdentifier {
  const nameSet = new Set(toolNames);
  return (request: CallToolRequest): boolean =>
    nameSet.has(request.params.name);
}

/**
 * Describes one feature module for the router registry.
 */
export interface FeatureModule {
  isRequest: RequestIdentifier;
  handleRequest: RequestHandler;
}

/**
 * Routes a request to the first matching feature handler,
 * or throws if no feature matches.
 */
export async function routeRequest(
  features: FeatureModule[],
  connection: WebApi,
  request: CallToolRequest,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  for (const feature of features) {
    if (feature.isRequest(request)) {
      const result = await feature.handleRequest(connection, request);
      return result as { content: Array<{ type: string; text: string }> };
    }
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
}
