import { WebApi, getPersonalAccessTokenHandler } from 'azure-devops-node-api';
import { AzureDevOpsAuthenticationError } from './errors';

/**
 * Authentication configuration for Azure DevOps
 */
export interface AuthConfig {
  /**
   * Personal Access Token for Azure DevOps
   */
  pat: string;

  /**
   * Organization URL (e.g., https://dev.azure.com/myorg)
   */
  orgUrl: string;
}

/**
 * Creates an authenticated client for Azure DevOps API
 *
 * @param config Authentication configuration
 * @returns Authenticated WebApi client
 * @throws {AzureDevOpsAuthenticationError} If authentication fails
 */
export async function createAuthenticatedClient(
  config: AuthConfig | { orgUrl: string; pat: string }
): Promise<WebApi> {
  if (!config.pat) {
    throw new AzureDevOpsAuthenticationError('Personal Access Token (PAT) is required');
  }

  if (!config.orgUrl) {
    throw new AzureDevOpsAuthenticationError('Organization URL is required');
  }

  try {
    // Create authentication handler using PAT
    const authHandler = getPersonalAccessTokenHandler(config.pat);

    // Create API client with the auth handler
    const client = new WebApi(config.orgUrl, authHandler);

    // Test the connection by getting a simple API
    await client.getLocationsApi();

    return client;
  } catch (error) {
    throw new AzureDevOpsAuthenticationError(
      `Failed to authenticate with Azure DevOps: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Validates that a Personal Access Token has the correct format
 * 
 * @param pat Personal Access Token
 * @returns true if PAT has valid format, false otherwise
 */
export function isValidPatFormat(pat: string): boolean {
  if (!pat || pat.length < 64) {
    return false;
  }

  // Check if it's a base64 string
  // PATs are minimum 64 characters and typically have base64 pattern
  const base64Regex = /^[A-Za-z0-9+/=]+$/;
  return base64Regex.test(pat);
} 