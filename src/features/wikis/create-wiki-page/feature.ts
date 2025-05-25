import { z } from 'zod';
import { AzureDevOpsClient } from '../../../shared/api/client';
import { handleRequestError } from '../../../shared/errors/handle-request-error';
import { CreateWikiPageSchema } from './schema';

/**
 * Creates a new wiki page in Azure DevOps.
 * If a page already exists at the specified path, it will be updated.
 *
 * @param {z.infer<typeof CreateWikiPageSchema>} params - The parameters for creating the wiki page.
 * @param {AzureDevOpsClient} client - The Azure DevOps client.
 * @returns {Promise<any>} A promise that resolves with the API response.
 */
export const createWikiPage = async (
  params: z.infer<typeof CreateWikiPageSchema>,
  client: AzureDevOpsClient,
) => {
  try {
    const { organizationId, projectId, wikiId, pagePath, content } = params;

    // Use default organization and project if not provided
    const org = organizationId ?? client.defaults.organizationId;
    const project = projectId ?? client.defaults.projectId;

    if (!org) {
      throw new Error(
        'Organization ID is not defined. Please provide it or set a default.',
      );
    }

    const apiUrl = `${org}/${
      project ? `${project}/` : ''
    }_apis/wiki/wikis/${wikiId}/pages?path=${encodeURIComponent(
      pagePath ?? '/',
    )}&api-version=7.1-preview.1`;

    const response = await client.put(apiUrl, { content });
    return response.data;
  } catch (error: any) {
    // Assuming handleRequestError is a utility function to process API errors
    throw await handleRequestError(error, 'Failed to create or update wiki page');
  }
};
