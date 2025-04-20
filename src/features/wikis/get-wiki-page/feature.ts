import axios, { AxiosError } from 'axios';
import { DefaultAzureCredential, AzureCliCredential } from '@azure/identity';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
  AzureDevOpsPermissionError,
} from '../../../shared/errors';
import { defaultOrg, defaultProject } from '../../../utils/environment';

/**
 * Options for getting a wiki page
 */
export interface GetWikiPageOptions {
  /**
   * The ID or name of the organization
   * If not provided, the default organization will be used
   */
  organizationId?: string;

  /**
   * The ID or name of the project
   * If not provided, the default project will be used
   */
  projectId?: string;

  /**
   * The ID or name of the wiki
   */
  wikiId: string;

  /**
   * The path of the page within the wiki
   */
  pagePath: string;
}

/**
 * Get a wiki page from a wiki
 *
 * @param options Options for getting a wiki page
 * @returns Wiki page content as text/plain
 * @throws {AzureDevOpsResourceNotFoundError} When the wiki page is not found
 * @throws {AzureDevOpsPermissionError} When the user does not have permission to access the wiki page
 * @throws {AzureDevOpsError} When an error occurs while fetching the wiki page
 */
export async function getWikiPage(
  options: GetWikiPageOptions,
): Promise<string> {
  const { organizationId, projectId, wikiId, pagePath } = options;

  // Encode the page path, handling forward slashes properly
  const encodedPagePath = encodeURIComponent(pagePath).replace(/%2F/g, '/');

  // Construct the URL to fetch the wiki page
  const baseUri = `https://dev.azure.com/${organizationId ?? defaultOrg}`;
  const url = `${baseUri}/${projectId ?? defaultProject}/_apis/wiki/wikis/${wikiId}/pages`;
  const params = {
    'api-version': '7.0',
    path: encodedPagePath,
  };

  try {
    // Get authorization header
    const authHeader = await getAuthorizationHeader();

    // Make the API request
    const response = await axios.get(url, {
      params,
      headers: {
        Authorization: authHeader,
        Accept: 'text/plain',
        'Content-Type': 'application/json',
      },
      responseType: 'text',
    });

    // Return the page content
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;

    // Handle specific error cases
    if (axiosError.response) {
      const status = axiosError.response.status;
      const errorMessage =
        typeof axiosError.response.data === 'object' && axiosError.response.data
          ? (axiosError.response.data as any).message || axiosError.message
          : axiosError.message;

      // Handle 404 Not Found
      if (status === 404) {
        throw new AzureDevOpsResourceNotFoundError(
          `Wiki page not found: ${pagePath} in wiki ${wikiId}`,
        );
      }

      // Handle 401 Unauthorized or 403 Forbidden
      if (status === 401 || status === 403) {
        throw new AzureDevOpsPermissionError(
          `Permission denied to access wiki page: ${pagePath}`,
        );
      }

      // Handle other error statuses
      throw new AzureDevOpsError(`Failed to fetch wiki page: ${errorMessage}`);
    }

    // Handle network errors
    throw new AzureDevOpsError(
      `Network error when fetching wiki page: ${axiosError.message}`,
    );
  }
}

/**
 * Get the authorization header for Azure DevOps API requests
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
    throw new AzureDevOpsValidationError(
      `Failed to get authorization header: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
