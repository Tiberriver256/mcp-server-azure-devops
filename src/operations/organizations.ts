import axios from 'axios';
import { z } from 'zod';
import { AzureDevOpsConfig } from '../types/config';
import { AzureDevOpsAuthenticationError } from '../common/errors';

/**
 * Organization interface
 */
export interface Organization {
  /**
   * The ID of the organization
   */
  id: string;
  
  /**
   * The name of the organization
   */
  name: string;

  /**
   * The URL of the organization
   */
  url: string;
}

/**
 * Schema for the list organizations response
 */
export const ListOrganizationsSchema = z.object({});

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
export async function listOrganizations(config: AzureDevOpsConfig): Promise<Organization[]> {
  try {
    // Create authorization header
    const authHeader = createBasicAuthHeader(config.personalAccessToken);

    // Step 1: Get the user profile to get the publicAlias
    const profileResponse = await axios.get(
      'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0',
      { 
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        }
      }
    );

    // Extract the publicAlias
    const publicAlias = profileResponse.data.publicAlias;
    if (!publicAlias) {
      throw new AzureDevOpsAuthenticationError('Unable to get user publicAlias from profile');
    }

    // Step 2: Get organizations using the publicAlias
    const orgsResponse = await axios.get(
      `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${publicAlias}&api-version=6.0`,
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        }
      }
    );

    // Transform the response
    return orgsResponse.data.value.map((org: any) => ({
      id: org.accountId,
      name: org.accountName,
      url: org.accountUri,
    }));
  } catch (error) {
    // Handle profile API errors as authentication errors
    if (axios.isAxiosError(error) && error.config?.url?.includes('profiles/me')) {
      throw new AzureDevOpsAuthenticationError(
        `Authentication failed: ${error.message}`
      );
    } else if (error instanceof Error && 
        error.message.includes('profile')) {
      throw new AzureDevOpsAuthenticationError(
        `Authentication failed: ${error.message}`
      );
    }
    // Rethrow other errors
    throw error;
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