import type { AuthenticationMethod } from '../auth/auth-factory.ts';

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
   * Optional list of toolsets to enable (e.g., ['work-items', 'pull-requests'] or ['all'])
   */
  toolsets?: readonly string[];

  /**
   * Optional explicit allowlist of tool names to enable
   */
  enabledTools?: readonly string[];

  /**
   * Optional explicit denylist of tool names to disable
   */
  disabledTools?: readonly string[];

  /**
   * When true, only tools explicitly marked read-only are exposed and callable
   */
  readOnly?: boolean;

  /**
   * When true (default), untrusted external text is wrapped in spotlighting
   * delimiters to mitigate indirect prompt injection.
   * @default true
   */
  spotlighting?: boolean;
}
