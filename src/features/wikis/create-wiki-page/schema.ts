import { z } from 'zod';
import { defaultProject, defaultOrg } from '../../../utils/environment';

/**
 * Schema for creating a new wiki page in Azure DevOps
 */
export const CreateWikiPageSchema = z.object({
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
  pagePath: z
    .string()
    .optional()
    .nullable()
    .default('/')
    .describe('Path of the wiki page to create. If the path does not exist, it will be created. Defaults to the wiki root (/). Example: /ParentPage/NewPage'),
  content: z
    .string()
    .min(1)
    .describe('The content for the new wiki page in markdown format'),
});
