import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import {
  GetRepositorySchema,
  GetRepositoryDetailsSchema,
  ListRepositoriesSchema,
  GetFileContentSchema,
  GetAllRepositoriesTreeSchema,
} from './schemas';

/**
 * List of repositories tools
 */
export const repositoriesTools: ToolDefinition[] = [
  {
    name: 'get_repository',
    description: 'Get details of a specific repository',
    inputSchema: zodToJsonSchema(GetRepositorySchema),
  },
  {
    name: 'get_repository_details',
    description:
      'Get detailed information about a repository including statistics and refs',
    inputSchema: zodToJsonSchema(GetRepositoryDetailsSchema),
  },
  {
    name: 'list_repositories',
    description: 'List repositories in a project',
    inputSchema: zodToJsonSchema(ListRepositoriesSchema),
  },
  {
    name: 'get_file_content',
    description: 'Get content of a file or directory from a repository',
    inputSchema: zodToJsonSchema(GetFileContentSchema),
  },
  {
    name: 'get_all_repositories_tree',
    description:
      'Displays a hierarchical tree view of files and directories across multiple Azure DevOps repositories within a project, based on their default branches',
    inputSchema: zodToJsonSchema(GetAllRepositoriesTreeSchema),
  },
];
