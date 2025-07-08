import * as azureDevOpsClient from '../../../clients/azure-devops';
import { AzureDevOpsError } from '../../../shared/errors/azure-devops-errors';
import { defaultOrg, defaultProject } from '../../../utils/environment';
import { ListWikiPagesOptions } from './schema';

/**
 * Summary information for a wiki page
 */
export interface WikiPageSummary {
  id: number;
  path: string;
  url?: string;
  order?: number;
}

/**
 * List wiki pages from a wiki
 *
 * @param options Options for listing wiki pages
 * @returns Array of wiki page summaries
 * @throws {AzureDevOpsResourceNotFoundError} When the wiki is not found
 * @throws {AzureDevOpsPermissionError} When the user does not have permission to access the wiki
 * @throws {AzureDevOpsError} When an error occurs while fetching the wiki pages
 */
export async function listWikiPages(
  options: ListWikiPagesOptions,
): Promise<WikiPageSummary[]> {
  const { organizationId, projectId, wikiId } = options;

  // Use defaults if not provided
  const orgId = organizationId || defaultOrg;
  const projId = projectId || defaultProject;

  try {
    // Create the client
    const client = await azureDevOpsClient.getWikiClient({
      organizationId: orgId,
    });

    // Get the wiki pages
    const pages = await client.listWikiPages(projId, wikiId);

    // Return the pages directly since the client interface now matches our requirements
    return pages.map((page) => ({
      id: page.id,
      path: page.path,
      url: page.url,
      order: page.order,
    }));
  } catch (error) {
    // If it's already an AzureDevOpsError, rethrow it
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    // Otherwise wrap it in an AzureDevOpsError
    throw new AzureDevOpsError('Failed to list wiki pages', { cause: error });
  }
}
