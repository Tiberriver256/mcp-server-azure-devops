import { WebApi } from 'azure-devops-node-api';
import { WikiV2 } from 'azure-devops-node-api/interfaces/WikiInterfaces';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';

/**
 * Options for getting wikis
 */
export interface GetWikisOptions {
  /**
   * The ID or name of the organization
   * If not provided, the default organization will be used
   */
  organizationId?: string;

  /**
   * The ID or name of the project
   * If not provided, the wikis from all projects will be returned
   */
  projectId?: string;
}

/**
 * Get wikis in a project or organization
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options for getting wikis
 * @returns List of wikis
 */
export async function getWikis(
  connection: WebApi,
  options: GetWikisOptions,
): Promise<WikiV2[]> {
  try {
    // Get the Wiki API client
    const wikiApi = await connection.getWikiApi();

    // If a projectId is provided, get wikis for that specific project
    // Otherwise, get wikis for the entire organization
    const { projectId } = options;

    const wikis = await wikiApi.getAllWikis(projectId);

    return wikis || [];
  } catch (error) {
    // Handle resource not found errors specifically
    if (
      error instanceof Error &&
      error.message &&
      error.message.includes('The resource cannot be found')
    ) {
      throw new AzureDevOpsResourceNotFoundError(
        `Resource not found: ${options.projectId ? `Project '${options.projectId}'` : 'Organization'}`,
      );
    }

    // If it's already an AzureDevOpsError, rethrow it
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    // Otherwise, wrap it in a generic error
    throw new AzureDevOpsError(
      `Failed to get wikis: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
