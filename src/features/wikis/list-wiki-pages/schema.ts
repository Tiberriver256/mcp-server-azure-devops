import { z } from 'zod';

import {
  nullableProjectIdField,
  nullableOrganizationIdField,
} from '../../../shared/schemas';

/**
 * Schema for listing wiki pages from an Azure DevOps wiki
 */
export const ListWikiPagesSchema = z.object({
  organizationId: nullableOrganizationIdField,
  projectId: nullableProjectIdField,
  wikiId: z.string().describe('The ID or name of the wiki'),
});

export type ListWikiPagesOptions = z.infer<typeof ListWikiPagesSchema>;
