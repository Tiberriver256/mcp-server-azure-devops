import { z } from 'zod';

import { defaultProject, defaultOrg } from '../../../utils/environment';

/**
 * Schema for validating wiki page update options
 */
export const UpdateWikiPageSchema = z.object({
  organizationId: z
    .string()
    .optional()
    .nullable()
    .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
  projectId: z
    .string()
    .optional()
    .nullable()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
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
