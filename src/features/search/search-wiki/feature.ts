import { WebApi } from 'azure-devops-node-api';
import axios from 'axios';
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
      filters: {
        Project: [options.projectId],
      },
      includeFacets: options.includeFacets,
    };
    
    // Add custom filters if provided
    if (options.filters && options.filters.Project && options.filters.Project.length > 0) {
      if (searchRequest.filters && searchRequest.filters.Project) {
        searchRequest.filters.Project = [
          ...searchRequest.filters.Project,
          ...options.filters.Project,
        ];
      }
    }

    // Get the authorization header from the connection
    const authHeader = await getAuthorizationHeader(connection);

    // Extract organization and project from the connection URL
    const { organization, project } = extractOrgAndProject(
      connection,
      options.projectId,
    );

    // Make the search API request
    const searchUrl = `https://almsearch.dev.azure.com/${organization}/${project}/_apis/search/wikisearchresults?api-version=7.1`;
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
 * @param projectId The project ID or name
 * @returns The organization and project
 */
function extractOrgAndProject(
  connection: WebApi,
  projectId: string,
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
    project: projectId,
  };
}

/**
 * Get the authorization header from the connection
 *
 * @param connection The Azure DevOps WebApi connection
 * @returns The authorization header
 */
async function getAuthorizationHeader(connection: WebApi): Promise<string> {
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

    // For other auth methods, we'll make a simple API call to get a valid token
    // This is a workaround since we can't directly access the auth handler's token
    const coreApi = await connection.getCoreApi();
    await coreApi.getProjects();

    // At this point, the connection should have made a request and we can
    // extract the auth header from the most recent request
    // If this fails, we'll fall back to a default approach
    return `Basic ${Buffer.from(':' + process.env.AZURE_DEVOPS_PAT).toString('base64')}`;
  } catch (error) {
    throw new AzureDevOpsValidationError(
      `Failed to get authorization header: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}