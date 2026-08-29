import { z } from 'zod';

import {
  nullableProjectIdField,
  nullableOrganizationIdField,
} from '../../../shared/schemas';

/**
 * Schema for getting a wiki page from an Azure DevOps wiki
 */
export const GetWikiPageSchema = z.object({
  organizationId: nullableOrganizationIdField,
  projectId: nullableProjectIdField,
  wikiId: z.string().describe('The ID or name of the wiki'),
  pagePath: z.string().describe('The path of the page within the wiki'),
});
