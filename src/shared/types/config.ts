import { AuthenticationMethod } from '../auth/auth-factory';

/**
 * Transport protocols supported by the MCP server
 */
export enum TransportProtocol {
  /**
   * Stdio transport
   */
  Stdio = 'stdio',
  /**
   * HTTP transport
   */
  Http = 'http',
}

/**
 * Azure DevOps configuration type definition
 */
export interface AzureDevOpsConfig {
  /**
   * The Azure DevOps organization URL (e.g., https://dev.azure.com/organization)
   */
  organizationUrl: string;

  /**
   * Authentication method to use (pat, azure-identity, azure-cli)
   * @default 'azure-identity'
   */
  authMethod?: AuthenticationMethod;

  /**
   * Personal Access Token for authentication (required for PAT authentication)
   */
  personalAccessToken?: string;

  /**
   * Optional default project to use when not specified
   */
  defaultProject?: string;

  /**
   * Optional API version to use (defaults to latest)
   */
  apiVersion?: string;
  /**
   * Transport protocol to use (stdio, http)
   *
   * @default 'stdio'
   */
  transport: TransportProtocol;
  /**
   * Port to use for HTTP MCP transport (required when using HTTP transport)
   *
   * @default 8000
   */
  http_port: number;
}
