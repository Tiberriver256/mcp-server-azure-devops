import { z } from 'zod';
import { GitVersionType } from 'azure-devops-node-api/interfaces/GitInterfaces';

export const GetFileContentSchema = z.object({
  projectId: z.string().describe('The ID or name of the project'),
  repositoryId: z.string().describe('The ID or name of the repository'),
  path: z.string().describe('The path to the file or directory'),
  versionType: z
    .nativeEnum(GitVersionType)
    .optional()
    .describe('The type of version (branch, tag, or commit)'),
  version: z
    .string()
    .optional()
    .describe('The name of the branch or tag, or the SHA-1 hash of the commit'),
});
