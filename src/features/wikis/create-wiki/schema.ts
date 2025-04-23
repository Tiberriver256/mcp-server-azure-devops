import { z } from 'zod';

import { defaultProject, defaultOrg } from '../../../utils/environment';

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

/**
 * Schema for creating a wiki in an Azure DevOps project
 */
export const CreateWikiSchema = z
  .object({
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
    name: z.string().describe('The name of the new wiki'),
    type: z
      .nativeEnum(WikiType)
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
  .refine(
    (data) => {
      // If type is codeWiki, then repositoryId is required
      return data.type !== WikiType.CodeWiki || !!data.repositoryId;
    },
    {
      message: 'repositoryId is required when type is codeWiki',
      path: ['repositoryId'],
    },
  );
