import * as azureDevOpsClient from '../../../clients/azure-devops';
import { AzureDevOpsError } from '../../../shared/errors/azure-devops-errors';

/**
 * Options for getting a wiki page
 */
export interface GetWikiPageOptions {
  /**
   * The ID or name of the organization
   * If not provided, the default organization will be used
   */
  organizationId: string;

  /**
   * The ID or name of the project
   * If not provided, the default project will be used
   */
  projectId: string;

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

  try {
    // Create the client
    const client = await azureDevOpsClient.getWikiClient({
      organizationId,
    });

    // Get the wiki page
    return (await client.getPage(projectId, wikiId, pagePath)).content;
  } catch (error) {
    // If it's already an AzureDevOpsError, rethrow it
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    // Otherwise wrap it in an AzureDevOpsError
    throw new AzureDevOpsError('Failed to get wiki page', { cause: error });
  }
}
