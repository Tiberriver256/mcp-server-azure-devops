import axios, { AxiosError } from 'axios';
import { DefaultAzureCredential, AzureCliCredential } from '@azure/identity';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
  AzureDevOpsPermissionError,
} from '../shared/errors';
import { defaultOrg, defaultProject } from '../utils/environment';

interface AzureDevOpsApiErrorResponse {
  message?: string;
  typeKey?: string;
  errorCode?: number;
  eventId?: number;
}

interface ClientOptions {
  organizationId?: string;
}

interface WikiCreateParameters {
  name: string;
  projectId: string;
  type: 'projectWiki' | 'codeWiki';
  repositoryId?: string;
  mappedPath?: string;
  version?: {
    version: string;
    versionType?: 'branch' | 'tag' | 'commit';
  };
}

interface WikiPageContent {
  content: string;
}

export interface WikiPageSummary {
  id: number;
  path: string;
  url?: string;
  order?: number;
}

interface WikiPagesBatchRequest {
  top: number;
  continuationToken?: string;
}

interface WikiPagesBatchResponse {
  value: WikiPageSummary[];
  continuationToken?: string;
}

interface PageUpdateOptions {
  comment?: string;
  versionDescriptor?: {
    version?: string;
  };
}

export class WikiClient {
  private baseUrl: string;
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId || defaultOrg;
    this.baseUrl = `https://dev.azure.com/${this.organizationId}`;
  }

  /**
   * Gets a project's ID from its name or verifies a project ID
   * @param projectNameOrId - Project name or ID
   * @returns The project ID
   */
  private async getProjectId(projectNameOrId: string): Promise<string> {
    try {
      // Try to get project details using the provided name or ID
      const url = `${this.baseUrl}/_apis/projects/${projectNameOrId}`;
      const authHeader = await getAuthorizationHeader();

      const response = await axios.get(url, {
        params: {
          'api-version': '7.1',
        },
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      });

      // Return the project ID from the response
      return response.data.id;
    } catch (error) {
      const axiosError = error as AxiosError;

      if (axiosError.response) {
        const status = axiosError.response.status;
        const errorMessage =
          typeof axiosError.response.data === 'object' &&
          axiosError.response.data
            ? (axiosError.response.data as AzureDevOpsApiErrorResponse)
                .message || axiosError.message
            : axiosError.message;

        if (status === 404) {
          throw new AzureDevOpsResourceNotFoundError(
            `Project not found: ${projectNameOrId}`,
          );
        }

        if (status === 401 || status === 403) {
          throw new AzureDevOpsPermissionError(
            `Permission denied to access project: ${projectNameOrId}`,
          );
        }

        throw new AzureDevOpsError(
          `Failed to get project details: ${errorMessage}`,
        );
      }

      throw new AzureDevOpsError(
        `Network error when getting project details: ${axiosError.message}`,
      );
    }
  }

  /**
   * Creates a new wiki in Azure DevOps
   * @param projectId - Project ID or name
   * @param params - Parameters for creating the wiki
   * @returns The created wiki
   */
  async createWiki(projectId: string, params: WikiCreateParameters) {
    // Use the default project if not provided
    const project = projectId || defaultProject;

    try {
      // Get the actual project ID (whether the input was a name or ID)
      const actualProjectId = await this.getProjectId(project);

      // Construct the URL to create the wiki
      const url = `${this.baseUrl}/${project}/_apis/wiki/wikis`;

      // Get authorization header
      const authHeader = await getAuthorizationHeader();

      // Make the API request
      const response = await axios.post(
        url,
        {
          name: params.name,
          type: params.type,
          projectId: actualProjectId,
          ...(params.type === 'codeWiki' && {
            repositoryId: params.repositoryId,
            mappedPath: params.mappedPath,
            version: params.version,
          }),
        },
        {
          params: {
            'api-version': '7.1',
          },
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
        },
      );

      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;

      // Handle specific error cases
      if (axiosError.response) {
        const status = axiosError.response.status;
        const errorMessage =
          typeof axiosError.response.data === 'object' &&
          axiosError.response.data
            ? (axiosError.response.data as AzureDevOpsApiErrorResponse)
                .message || axiosError.message
            : axiosError.message;

        // Handle 404 Not Found
        if (status === 404) {
          throw new AzureDevOpsResourceNotFoundError(
            `Project not found: ${projectId}`,
          );
        }

        // Handle 401 Unauthorized or 403 Forbidden
        if (status === 401 || status === 403) {
          throw new AzureDevOpsPermissionError(
            `Permission denied to create wiki in project: ${projectId}`,
          );
        }

        // Handle validation errors
        if (status === 400) {
          throw new AzureDevOpsValidationError(
            `Invalid wiki creation parameters: ${errorMessage}`,
          );
        }

        // Handle other error statuses
        throw new AzureDevOpsError(`Failed to create wiki: ${errorMessage}`);
      }

      // Handle network errors
      throw new AzureDevOpsError(
        `Network error when creating wiki: ${axiosError.message}`,
      );
    }
  }

  /**
   * Gets a wiki page's content
   * @param projectId - Project ID or name
   * @param wikiId - Wiki ID or name
   * @param pagePath - Path of the wiki page
   * @param options - Additional options like version
   * @returns The wiki page content and ETag
   */
  async getPage(projectId: string, wikiId: string, pagePath: string) {
    // Use the default project if not provided
    const project = projectId || defaultProject;

    // Ensure pagePath starts with a forward slash
    const normalizedPath = pagePath.startsWith('/') ? pagePath : `/${pagePath}`;

    // Construct the URL to get the wiki page
    const url = `${this.baseUrl}/${project}/_apis/wiki/wikis/${wikiId}/pages`;
    const params: Record<string, string> = {
      'api-version': '7.1',
      path: normalizedPath,
    };

    try {
      // Get authorization header
      const authHeader = await getAuthorizationHeader();

      // Make the API request for plain text content
      const response = await axios.get(url, {
        params,
        headers: {
          Authorization: authHeader,
          Accept: 'text/plain',
          'Content-Type': 'application/json',
        },
        responseType: 'text',
      });

      // Return both the content and the ETag
      return {
        content: response.data,
        eTag: response.headers.etag?.replace(/"/g, ''), // Remove quotes from ETag
      };
    } catch (error) {
      const axiosError = error as AxiosError;

      // Handle specific error cases
      if (axiosError.response) {
        const status = axiosError.response.status;
        const errorMessage =
          typeof axiosError.response.data === 'object' &&
          axiosError.response.data
            ? (axiosError.response.data as AzureDevOpsApiErrorResponse)
                .message || axiosError.message
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
        throw new AzureDevOpsError(
          `Failed to get wiki page: ${errorMessage} ${axiosError.response?.data}`,
        );
      }

      // Handle network errors
      throw new AzureDevOpsError(
        `Network error when getting wiki page: ${axiosError.message}`,
      );
    }
  }

  /**
   * Creates a new wiki page with the provided content
   * @param content - Content for the new wiki page
   * @param projectId - Project ID or name
   * @param wikiId - Wiki ID or name
   * @param pagePath - Path of the wiki page to create
   * @param options - Additional options like comment
   * @returns The created wiki page
   */
  async createPage(
    content: string,
    projectId: string,
    wikiId: string,
    pagePath: string,
    options?: { comment?: string },
  ) {
    // Use the default project if not provided
    const project = projectId || defaultProject;

    // Encode the page path, handling forward slashes properly
    const encodedPagePath = encodeURIComponent(pagePath).replace(/%2F/g, '/');

    // Construct the URL to create the wiki page
    const url = `${this.baseUrl}/${project}/_apis/wiki/wikis/${wikiId}/pages`;

    const params: Record<string, string> = {
      'api-version': '7.1',
      path: encodedPagePath,
    };

    // Prepare the request payload
    const payload: Record<string, string> = {
      content,
    };

    // Add comment if provided
    if (options?.comment) {
      payload.comment = options.comment;
    }

    try {
      // Get authorization header
      const authHeader = await getAuthorizationHeader();

      // Make the API request
      const response = await axios.put(url, payload, {
        params,
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      // The ETag header contains the version
      const eTag = response.headers.etag;

      // Return the page content along with metadata
      return {
        ...response.data,
        version: eTag ? eTag.replace(/"/g, '') : undefined, // Remove quotes from ETag
      };
    } catch (error) {
      const axiosError = error as AxiosError;

      // Handle specific error cases
      if (axiosError.response) {
        const status = axiosError.response.status;
        const errorMessage =
          typeof axiosError.response.data === 'object' &&
          axiosError.response.data
            ? (axiosError.response.data as AzureDevOpsApiErrorResponse)
                .message || axiosError.message
            : axiosError.message;

        // Handle 404 Not Found - usually means the parent path doesn't exist
        if (status === 404) {
          throw new AzureDevOpsResourceNotFoundError(
            `Cannot create wiki page: parent path for ${pagePath} does not exist`,
          );
        }

        // Handle 401 Unauthorized or 403 Forbidden
        if (status === 401 || status === 403) {
          throw new AzureDevOpsPermissionError(
            `Permission denied to create wiki page: ${pagePath}`,
          );
        }

        // Handle 412 Precondition Failed - page might already exist
        if (status === 412) {
          throw new AzureDevOpsValidationError(
            `Wiki page already exists: ${pagePath}`,
          );
        }

        // Handle 400 Bad Request - usually validation errors
        if (status === 400) {
          throw new AzureDevOpsValidationError(
            `Invalid request when creating wiki page: ${errorMessage}`,
          );
        }

        // Handle other error statuses
        throw new AzureDevOpsError(
          `Failed to create wiki page: ${errorMessage}`,
        );
      }

      // Handle network errors
      throw new AzureDevOpsError(
        `Network error when creating wiki page: ${axiosError.message}`,
      );
    }
  }

  /**
   * Updates a wiki page with the provided content
   * @param content - Content for the wiki page
   * @param projectId - Project ID or name
   * @param wikiId - Wiki ID or name
   * @param pagePath - Path of the wiki page
   * @param options - Additional options like comment and version
   * @returns The updated wiki page
   */
  async updatePage(
    content: WikiPageContent,
    projectId: string,
    wikiId: string,
    pagePath: string,
    options?: PageUpdateOptions,
  ) {
    // Use the default project if not provided
    const project = projectId || defaultProject;

    // First get the current page version
    let currentETag;
    try {
      const currentPage = await this.getPage(project, wikiId, pagePath);
      currentETag = currentPage.eTag;
    } catch (error) {
      if (error instanceof AzureDevOpsResourceNotFoundError) {
        // If page doesn't exist, we'll create it (no If-Match header needed)
        currentETag = undefined;
      } else {
        throw error;
      }
    }

    // Encode the page path, handling forward slashes properly
    const encodedPagePath = encodeURIComponent(pagePath).replace(/%2F/g, '/');

    // Construct the URL to update the wiki page
    const url = `${this.baseUrl}/${project}/_apis/wiki/wikis/${wikiId}/pages`;
    const params: Record<string, string> = {
      'api-version': '7.1',
      path: encodedPagePath,
    };

    // Add optional comment parameter if provided
    if (options?.comment) {
      params.comment = options.comment;
    }

    try {
      // Get authorization header
      const authHeader = await getAuthorizationHeader();

      // Prepare request headers
      const headers: Record<string, string> = {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      };

      // Add If-Match header if we have an ETag (for updates)
      if (currentETag) {
        headers['If-Match'] = `"${currentETag}"`; // Wrap in quotes as required by API
      }

      // Create a properly typed payload
      const payload: Record<string, string> = {
        content: content.content,
      };

      // Make the API request
      const response = await axios.put(url, payload, {
        params,
        headers,
      });

      // The ETag header contains the version
      const eTag = response.headers.etag;

      // Return the page content along with metadata
      return {
        ...response.data,
        version: eTag ? eTag.replace(/"/g, '') : undefined, // Remove quotes from ETag
        message:
          response.status === 201
            ? 'Page created successfully'
            : 'Page updated successfully',
      };
    } catch (error) {
      const axiosError = error as AxiosError;

      // Handle specific error cases
      if (axiosError.response) {
        const status = axiosError.response.status;
        const errorMessage =
          typeof axiosError.response.data === 'object' &&
          axiosError.response.data
            ? (axiosError.response.data as AzureDevOpsApiErrorResponse)
                .message || axiosError.message
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
            `Permission denied to update wiki page: ${pagePath}`,
          );
        }

        // Handle 412 Precondition Failed (version conflict)
        if (status === 412) {
          throw new AzureDevOpsValidationError(
            `Version conflict: The wiki page has been modified since you retrieved it. Please get the latest version and try again.`,
          );
        }

        // Handle other error statuses
        throw new AzureDevOpsError(
          `Failed to update wiki page: ${errorMessage}`,
        );
      }

      // Handle network errors
      throw new AzureDevOpsError(
        `Network error when updating wiki page: ${axiosError.message}`,
      );
    }
  }

  /**
   * Lists wiki pages from a wiki using the Pages Batch API
   * @param projectId - Project ID or name
   * @param wikiId - Wiki ID or name
   * @returns Array of wiki page summaries sorted by order then path
   */
  async listWikiPages(
    projectId: string,
    wikiId: string,
  ): Promise<WikiPageSummary[]> {
    // Use the default project if not provided
    const project = projectId || defaultProject;

    // Construct the URL for the Pages Batch API
    const url = `${this.baseUrl}/${project}/_apis/wiki/wikis/${wikiId}/pagesbatch`;

    const allPages: WikiPageSummary[] = [];
    let continuationToken: string | undefined;

    try {
      // Get authorization header
      const authHeader = await getAuthorizationHeader();

      do {
        // Prepare the request body
        const requestBody: WikiPagesBatchRequest = {
          top: 100,
          ...(continuationToken && { continuationToken }),
        };

        // Make the API request
        const response = await axios.post<WikiPagesBatchResponse>(
          url,
          requestBody,
          {
            params: {
              'api-version': '7.1',
            },
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/json',
            },
          },
        );

        // Add the pages from this batch to our collection
        if (response.data.value && Array.isArray(response.data.value)) {
          allPages.push(...response.data.value);
        }

        // Update continuation token for next iteration
        continuationToken = response.data.continuationToken;
      } while (continuationToken);

      // Sort results by order then path
      return allPages.sort((a, b) => {
        // Handle optional order field
        const aOrder = a.order ?? Number.MAX_SAFE_INTEGER;
        const bOrder = b.order ?? Number.MAX_SAFE_INTEGER;

        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }
        return a.path.localeCompare(b.path);
      });
    } catch (error) {
      const axiosError = error as AxiosError;

      // Handle specific error cases
      if (axiosError.response) {
        const status = axiosError.response.status;
        const errorMessage =
          typeof axiosError.response.data === 'object' &&
          axiosError.response.data
            ? (axiosError.response.data as AzureDevOpsApiErrorResponse)
                .message || axiosError.message
            : axiosError.message;

        // Handle 404 Not Found
        if (status === 404) {
          throw new AzureDevOpsResourceNotFoundError(
            `Wiki not found: ${wikiId} in project ${projectId}`,
          );
        }

        // Handle 401 Unauthorized or 403 Forbidden
        if (status === 401 || status === 403) {
          throw new AzureDevOpsPermissionError(
            `Permission denied to list wiki pages in wiki: ${wikiId}`,
          );
        }

        // Handle other error statuses
        throw new AzureDevOpsError(
          `Failed to list wiki pages: ${errorMessage}`,
        );
      }

      // Handle network errors
      throw new AzureDevOpsError(
        `Network error when listing wiki pages: ${axiosError.message}`,
      );
    }
  }
}

/**
 * Creates a Wiki client for Azure DevOps operations
 * @param options - Options for creating the client
 * @returns A Wiki client instance
 */
export async function getWikiClient(
  options: ClientOptions,
): Promise<WikiClient> {
  const { organizationId } = options;

  return new WikiClient(organizationId || defaultOrg);
}

/**
 * Get the authorization header for Azure DevOps API requests
 * @returns The authorization header
 */
export async function getAuthorizationHeader(): Promise<string> {
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
