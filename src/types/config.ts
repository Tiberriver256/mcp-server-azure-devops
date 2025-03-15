import { AuthenticationMethod } from '../auth/auth-factory';

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
   * @default 'pat'
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
} 