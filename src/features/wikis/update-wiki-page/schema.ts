import { z } from 'zod';

import {
  nullableProjectIdField,
  nullableOrganizationIdField,
} from '../../../shared/schemas';

/**
 * Schema for validating wiki page update options
 */
export const UpdateWikiPageSchema = z.object({
  organizationId: nullableOrganizationIdField,
  projectId: nullableProjectIdField,
  wikiId: z.string().min(1).describe('The ID or name of the wiki'),
  pagePath: z.string().min(1).describe('Path of the wiki page to update'),
  content: z
    .string()
    .min(1)
    .describe('The new content for the wiki page in markdown format'),
  comment: z
    .string()
    .optional()
    .nullable()
    .describe('Optional comment for the update'),
});
