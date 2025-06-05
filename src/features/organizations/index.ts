// Re-export schemas and types
export * from './schemas';
export * from './types';

// Re-export features
export * from './list-organizations';

// Export tool definitions
export * from './tool-definitions';

import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import {
  RequestIdentifier,
  RequestHandler,
} from '../../shared/types/request-handler';
import { listOrganizations } from './list-organizations';
import { AzureDevOpsConfig, TransportProtocol } from '../../shared/types';
import { AuthenticationMethod } from '../../shared/auth';

/**
 * Checks if the request is for the organizations feature
 */
export const isOrganizationsRequest: RequestIdentifier = (
  request: CallToolRequest,
): boolean => {
  const toolName = request.params.name;
  return ['list_organizations'].includes(toolName);
};

/**
 * Handles organizations feature requests
 */
export const handleOrganizationsRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
): Promise<{ content: Array<{ type: string; text: string }> }> => {
  switch (request.params.name) {
    case 'list_organizations': {
      // Use environment variables for authentication method and PAT
      // This matches how other features handle authentication
      const config: AzureDevOpsConfig = {
        authMethod:
          process.env.AZURE_DEVOPS_AUTH_METHOD?.toLowerCase() === 'pat'
            ? AuthenticationMethod.PersonalAccessToken
            : process.env.AZURE_DEVOPS_AUTH_METHOD?.toLowerCase() ===
                'azure-cli'
              ? AuthenticationMethod.AzureCli
              : AuthenticationMethod.AzureIdentity,
        personalAccessToken: process.env.AZURE_DEVOPS_PAT,
        organizationUrl: connection.serverUrl || '',
        transport: TransportProtocol.Stdio,
        http_port: 8000,
      };

      const result = await listOrganizations(config);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    default:
      throw new Error(`Unknown organizations tool: ${request.params.name}`);
  }
};
