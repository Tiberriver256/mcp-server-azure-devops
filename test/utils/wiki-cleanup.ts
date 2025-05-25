import { AzureDevOpsClient } from '../../src/shared/api/client'; // Adjust path as necessary

interface DeleteWikiPageParams {
  organizationId?: string | null;
  projectId?: string | null;
  wikiId: string;
  pagePath: string;
}

/**
 * Deletes a wiki page in Azure DevOps.
 *
 * @param client The Azure DevOps client.
 * @param params Parameters for deleting the wiki page.
 */
export const deleteWikiPage = async (
  client: AzureDevOpsClient,
  params: DeleteWikiPageParams,
): Promise<void> => {
  const { organizationId, projectId, wikiId, pagePath } = params;

  const org = organizationId ?? client.defaults.organizationId;
  const project = projectId ?? client.defaults.projectId;

  if (!org) {
    throw new Error('Organization ID is not defined for deleting wiki page.');
  }
  if (!wikiId) {
    throw new Error('Wiki ID is not defined for deleting wiki page.');
  }
  if (!pagePath) {
    throw new Error('Page path is not defined for deleting wiki page.');
  }

  // The API version might vary; ensure it's compatible with your Azure DevOps version.
  // Using 7.1-preview.1 as it's common for wiki operations.
  const apiUrl = `${org}/${
    project ? `${project}/` : ''
  }_apis/wiki/wikis/${encodeURIComponent(
    wikiId,
  )}/pages?path=${encodeURIComponent(pagePath)}&api-version=7.1-preview.1`;

  try {
    await client.delete(apiUrl);
    // console.log(`Successfully deleted wiki page: ${pagePath} from wiki ${wikiId}`);
  } catch (error: any) {
    // It's common for cleanup to fail if the resource doesn't exist (e.g., test failed before creation)
    // You might want to log this differently or ignore specific error codes (like 404)
    // console.warn(`Failed to delete wiki page ${pagePath} from wiki ${wikiId}:`, error.message);
    // Rethrow unless it's a "not found" type of error, which can be ignored in cleanup
    if (error.response?.status !== 404) {
      throw error;
    }
  }
};
