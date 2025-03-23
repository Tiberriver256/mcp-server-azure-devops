import axios from 'axios';
import { AzureDevOpsConfig } from '../../../shared/types';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
} from '../../../shared/errors';
import { DefaultAzureCredential, AzureCliCredential } from '@azure/identity';
import { AuthenticationMethod } from '../../../shared/auth';
import { Organization, AZURE_DEVOPS_RESOURCE_ID } from '../types';

/**
 * Lists all Azure DevOps organizations accessible to the authenticated user
 *
 * Note: This function uses Axios directly rather than the Azure DevOps Node API
 * because the WebApi client doesn't support the organizations endpoint.
 *
 * @param config The Azure DevOps configuration
 * @returns Array of organizations
 * @throws {AzureDevOpsAuthenticationError} If authentication fails
 */
export async function listOrganizations(
  config: AzureDevOpsConfig,
): Promise<Organization[]> {
  try {
    // Determine auth method and create appropriate authorization header
    let authHeader: string;

    if (config.authMethod === AuthenticationMethod.PersonalAccessToken) {
      // PAT authentication
      if (!config.personalAccessToken) {
        throw new AzureDevOpsAuthenticationError(
          'Personal Access Token (PAT) is required when using PAT authentication',
        );
      }
      authHeader = createBasicAuthHeader(config.personalAccessToken);
    } else {
      // Azure Identity authentication (DefaultAzureCredential or AzureCliCredential)
      const credential =
        config.authMethod === AuthenticationMethod.AzureCli
          ? new AzureCliCredential()
          : new DefaultAzureCredential();

      const token = await credential.getToken(
        `${AZURE_DEVOPS_RESOURCE_ID}/.default`,
      );

      if (!token || !token.token) {
        throw new AzureDevOpsAuthenticationError(
          'Failed to acquire Azure Identity token',
        );
      }

      authHeader = `Bearer ${token.token}`;
    }

    // Step 1: Get the user profile to get the publicAlias
    const profileResponse = await axios.get(
      'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0',
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      },
    );

    // Extract the publicAlias
    const publicAlias = profileResponse.data.publicAlias;
    if (!publicAlias) {
      throw new AzureDevOpsAuthenticationError(
        'Unable to get user publicAlias from profile',
      );
    }

    // Step 2: Get organizations using the publicAlias
    const orgsResponse = await axios.get(
      `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${publicAlias}&api-version=6.0`,
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      },
    );

    // Define the shape of the API response
    interface AzureDevOpsOrganization {
      accountId: string;
      accountName: string;
      accountUri: string;
    }

    // Transform the response
    return orgsResponse.data.value.map((org: AzureDevOpsOrganization) => ({
      id: org.accountId,
      name: org.accountName,
      url: org.accountUri,
    }));
  } catch (error) {
    // Handle profile API errors as authentication errors
    if (axios.isAxiosError(error) && error.config?.url?.includes('profile')) {
      throw new AzureDevOpsAuthenticationError(
        `Authentication failed: ${error.message}`,
      );
    } else if (
      error instanceof Error &&
      (error.message.includes('profile') ||
        error.message.includes('Unauthorized') ||
        error.message.includes('Authentication'))
    ) {
      throw new AzureDevOpsAuthenticationError(
        `Authentication failed: ${error.message}`,
      );
    }

    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    throw new AzureDevOpsAuthenticationError(
      `Failed to list organizations: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Creates a Basic Auth header for the Azure DevOps API
 *
 * @param pat Personal Access Token
 * @returns Basic Auth header value
 */
function createBasicAuthHeader(pat: string): string {
  const token = Buffer.from(`:${pat}`).toString('base64');
  return `Basic ${token}`;
}
