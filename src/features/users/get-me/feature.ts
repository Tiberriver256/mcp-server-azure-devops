import { WebApi } from 'azure-devops-node-api';
import axios from 'axios';
import { DefaultAzureCredential, AzureCliCredential } from '@azure/identity';
import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsValidationError,
} from '../../../shared/errors';
import { UserProfile } from '../types';

/**
 * Get details of the currently authenticated user
 *
 * This function returns basic profile information about the authenticated user.
 *
 * @param connection The Azure DevOps WebApi connection
 * @returns User profile information including id, displayName, and email
 * @throws {AzureDevOpsError} If retrieval of user information fails
 */
export async function getMe(connection: WebApi): Promise<UserProfile> {
  try {
    // Extract organization from the connection URL
    const { organization } = extractOrgFromUrl(connection.serverUrl);

    // Get the authorization header
    const authHeader = await getAuthorizationHeader();

    // Make direct call to the Profile API endpoint
    // Note: This API is in the vssps.dev.azure.com domain, not dev.azure.com
    const response = await axios.get(
      `https://vssps.dev.azure.com/${organization}/_apis/profile/profiles/me?api-version=7.1`,
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      },
    );

    const profile = response.data;

    // Return the user profile with required fields
    return {
      id: profile.id,
      displayName: profile.displayName || '',
      email: profile.emailAddress || '',
    };
  } catch (error) {
    // Handle authentication errors
    if (
      axios.isAxiosError(error) &&
      (error.response?.status === 401 || error.response?.status === 403)
    ) {
      throw new AzureDevOpsAuthenticationError(
        `Authentication failed: ${error.message}`,
      );
    }

    // If it's already an AzureDevOpsError, rethrow it
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    // Otherwise, wrap it in a generic error
    throw new AzureDevOpsError(
      `Failed to get user information: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Extract organization from the Azure DevOps URL
 *
 * @param url The Azure DevOps URL
 * @returns The organization
 */
function extractOrgFromUrl(url: string): { organization: string } {
  // Extract organization from the URL
  const match = url.match(/https?:\/\/dev\.azure\.com\/([^/]+)/);
  const organization = match ? match[1] : '';

  if (!organization) {
    throw new AzureDevOpsValidationError(
      'Could not extract organization from URL',
    );
  }

  return {
    organization,
  };
}

/**
 * Get the authorization header for API requests
 *
 * @returns The authorization header
 */
async function getAuthorizationHeader(): Promise<string> {
  try {
    // For PAT authentication, we can construct the header directly
    if (
      process.env.AZURE_DEVOPS_AUTH_METHOD?.toLowerCase() === 'pat' &&
      process.env.AZURE_DEVOPS_PAT
    ) {
      // For PAT auth, we can construct the Basic auth header directly
      const token = process.env.AZURE_DEVOPS_PAT;
      const base64Token = Buffer.from(`:${token}`).toString('base64');
      return `Basic ${base64Token}`;
    }

    // For Azure Identity / Azure CLI auth, we need to get a token
    // using the Azure DevOps resource ID
    // Choose the appropriate credential based on auth method
    const credential =
      process.env.AZURE_DEVOPS_AUTH_METHOD?.toLowerCase() === 'azure-cli'
        ? new AzureCliCredential()
        : new DefaultAzureCredential();

    // Azure DevOps resource ID for token acquisition
    const AZURE_DEVOPS_RESOURCE_ID = '499b84ac-1321-427f-aa17-267ca6975798';

    // Get token for Azure DevOps
    const token = await credential.getToken(
      `${AZURE_DEVOPS_RESOURCE_ID}/.default`,
    );

    if (!token || !token.token) {
      throw new Error('Failed to acquire token for Azure DevOps');
    }

    return `Bearer ${token.token}`;
  } catch (error) {
    throw new AzureDevOpsAuthenticationError(
      `Failed to get authorization header: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
