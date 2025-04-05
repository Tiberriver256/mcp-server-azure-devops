import { WebApi } from 'azure-devops-node-api';
import axios from 'axios';
import { DefaultAzureCredential, AzureCliCredential } from '@azure/identity';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
  AzureDevOpsPermissionError,
} from '../../../shared/errors';
import {
  SearchWikiOptions,
  WikiSearchRequest,
  WikiSearchResponse,
} from '../types';

/**
 * Search for wiki pages in Azure DevOps projects
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Parameters for searching wiki pages
 * @returns Search results for wiki pages
 */
export async function searchWiki(
  connection: WebApi,
  options: SearchWikiOptions,
): Promise<WikiSearchResponse> {
  try {
    // Prepare the search request
    const searchRequest: WikiSearchRequest = {
      searchText: options.searchText,
      $skip: options.skip,
      $top: options.top,
      filters: options.projectId
        ? {
            Project: [options.projectId],
          }
        : {},
      includeFacets: options.includeFacets,
    };

    // Add custom filters if provided
    if (
      options.filters &&
      options.filters.Project &&
      options.filters.Project.length > 0
    ) {
      if (!searchRequest.filters) {
        searchRequest.filters = {};
      }

      if (!searchRequest.filters.Project) {
        searchRequest.filters.Project = [];
      }

      searchRequest.filters.Project = [
        ...(searchRequest.filters.Project || []),
        ...options.filters.Project,
      ];
    }

    // Get the authorization header from the connection
    const authHeader = await getAuthorizationHeader();

    // Extract organization and project from the connection URL
    const { organization, project } = extractOrgAndProject(
      connection,
      options.projectId,
    );

    // Make the search API request
    // If projectId is provided, include it in the URL, otherwise perform organization-wide search
    const searchUrl = options.projectId
      ? `https://almsearch.dev.azure.com/${organization}/${project}/_apis/search/wikisearchresults?api-version=7.1`
      : `https://almsearch.dev.azure.com/${organization}/_apis/search/wikisearchresults?api-version=7.1`;

    const searchResponse = await axios.post<WikiSearchResponse>(
      searchUrl,
      searchRequest,
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      },
    );

    return searchResponse.data;
  } catch (error) {
    // If it's already an AzureDevOpsError, rethrow it
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    // Handle axios errors
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;

      if (status === 404) {
        throw new AzureDevOpsResourceNotFoundError(
          `Resource not found: ${message}`,
        );
      } else if (status === 400) {
        throw new AzureDevOpsValidationError(
          `Invalid request: ${message}`,
          error.response?.data,
        );
      } else if (status === 401 || status === 403) {
        throw new AzureDevOpsPermissionError(`Permission denied: ${message}`);
      } else {
        // For other axios errors, wrap in a generic AzureDevOpsError
        throw new AzureDevOpsError(`Azure DevOps API error: ${message}`);
      }

      // This return is never reached but helps TypeScript understand the control flow
      return null as never;
    }

    // Otherwise, wrap it in a generic error
    throw new AzureDevOpsError(
      `Failed to search wiki: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Extract organization and project from the connection URL
 *
 * @param connection The Azure DevOps WebApi connection
 * @param projectId The project ID or name (optional)
 * @returns The organization and project
 */
function extractOrgAndProject(
  connection: WebApi,
  projectId?: string,
): { organization: string; project: string } {
  // Extract organization from the connection URL
  const url = connection.serverUrl;
  const match = url.match(/https?:\/\/dev\.azure\.com\/([^/]+)/);
  const organization = match ? match[1] : '';

  if (!organization) {
    throw new AzureDevOpsValidationError(
      'Could not extract organization from connection URL',
    );
  }

  return {
    organization,
    project: projectId || '',
  };
}

/**
 * Get the authorization header from the connection
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
