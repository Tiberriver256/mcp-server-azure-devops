import { z } from 'zod';

import { defaultProject, defaultOrg } from '../../../utils/environment';

/**
 * Schema for listing wiki pages from an Azure DevOps wiki
 */
export const ListWikiPagesSchema = z.object({
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
  wikiId: z.string().describe('The ID or name of the wiki'),
});

export type ListWikiPagesOptions = z.infer<typeof ListWikiPagesSchema>;
