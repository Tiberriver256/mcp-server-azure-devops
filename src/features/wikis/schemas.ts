import { z } from 'zod';

/**
 * Wiki types for creating wiki
 */
export enum WikiType {
  /**
   * The wiki is published from a git repository
   */
  CodeWiki = 'codeWiki',

  /**
   * The wiki is provisioned for the team project
   */
  ProjectWiki = 'projectWiki',
}

const orgIdField = z
  .string()
  .optional()
  .nullable()
  .describe(
    'The ID or name of the organization (defaults to configured organization)',
  );

const projectIdField = z
  .string()
  .optional()
  .nullable()
  .describe(
    'The ID or name of the project (defaults to AZURE_DEVOPS_DEFAULT_PROJECT)',
  );

export const GetWikisSchema = z.object({
  organizationId: orgIdField,
  projectId: projectIdField,
});

export const GetWikiPageSchema = z.object({
  organizationId: orgIdField,
  projectId: projectIdField,
  wikiId: z.string().describe('The ID or name of the wiki'),
  pagePath: z.string().describe('The path of the page within the wiki'),
});

export const CreateWikiSchema = z
  .object({
    organizationId: orgIdField,
    projectId: projectIdField,
    name: z.string().describe('The name of the new wiki'),
    type: z
      .enum(WikiType)
      .optional()
      .default(WikiType.ProjectWiki)
      .describe('Type of wiki to create (projectWiki or codeWiki)'),
    repositoryId: z
      .string()
      .optional()
      .nullable()
      .describe(
        'The ID of the repository to associate with the wiki (required for codeWiki)',
      ),
    mappedPath: z
      .string()
      .optional()
      .nullable()
      .default('/')
      .describe(
        'Folder path inside repository which is shown as Wiki (only for codeWiki)',
      ),
  })
  .refine((data) => data.type !== WikiType.CodeWiki || !!data.repositoryId, {
    message: 'repositoryId is required when type is codeWiki',
    path: ['repositoryId'],
  });

export const UpdateWikiPageSchema = z.object({
  organizationId: orgIdField,
  projectId: projectIdField,
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

export const ListWikiPagesSchema = z.object({
  organizationId: orgIdField,
  projectId: projectIdField,
  wikiId: z.string().describe('The ID or name of the wiki'),
});

export type ListWikiPagesOptions = z.infer<typeof ListWikiPagesSchema>;

export const CreateWikiPageSchema = z.object({
  organizationId: orgIdField,
  projectId: projectIdField,
  wikiId: z.string().min(1).describe('The ID or name of the wiki'),
  pagePath: z
    .string()
    .optional()
    .nullable()
    .default('/')
    .describe(
      'Path of the wiki page to create. If the path does not exist, it will be created. Defaults to the wiki root (/). Example: /ParentPage/NewPage',
    ),
  content: z
    .string()
    .min(1)
    .describe('The content for the new wiki page in markdown format'),
  comment: z
    .string()
    .optional()
    .describe('Optional comment for the creation or update'),
});
