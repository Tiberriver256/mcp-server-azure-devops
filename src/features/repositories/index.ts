// Re-export schemas and types
export * from './schemas';
export * from './types';

// Re-export features
export * from './get-repository';
export * from './get-repository-details';
export * from './list-repositories';
export * from './get-file-content';
export * from './get-all-repositories-tree';

// Export tool definitions
export * from './tool-definitions';

// New exports for request handling
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import { GitVersionType } from 'azure-devops-node-api/interfaces/GitInterfaces';
import {
  RequestIdentifier,
  RequestHandler,
} from '../../shared/types/request-handler';
import { defaultProject, defaultOrg } from '../../utils/environment';
import {
  GetRepositorySchema,
  GetRepositoryDetailsSchema,
  ListRepositoriesSchema,
  GetFileContentSchema,
  GetAllRepositoriesTreeSchema,
  getRepository,
  getRepositoryDetails,
  listRepositories,
  getFileContent,
  getAllRepositoriesTree,
  formatRepositoryTree,
} from './';

/**
 * Checks if the request is for the repositories feature
 */
export const isRepositoriesRequest: RequestIdentifier = (
  request: CallToolRequest,
): boolean => {
  const toolName = request.params.name;
  return [
    'get_repository',
    'get_repository_details',
    'list_repositories',
    'get_file_content',
    'get_all_repositories_tree',
  ].includes(toolName);
};

/**
 * Handles repositories feature requests
 */
export const handleRepositoriesRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
): Promise<{ content: Array<{ type: string; text: string }> }> => {
  switch (request.params.name) {
    case 'get_repository': {
      const args = GetRepositorySchema.parse(request.params.arguments);
      const result = await getRepository(
        connection,
        args.projectId ?? defaultProject,
        args.repositoryId,
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'get_repository_details': {
      const args = GetRepositoryDetailsSchema.parse(request.params.arguments);
      const result = await getRepositoryDetails(connection, {
        projectId: args.projectId ?? defaultProject,
        repositoryId: args.repositoryId,
        includeStatistics: args.includeStatistics,
        includeRefs: args.includeRefs,
        refFilter: args.refFilter,
        branchName: args.branchName,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'list_repositories': {
      const args = ListRepositoriesSchema.parse(request.params.arguments);
      const result = await listRepositories(connection, {
        ...args,
        projectId: args.projectId ?? defaultProject,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'get_file_content': {
      const args = GetFileContentSchema.parse(request.params.arguments);

      // Map the string version type to the GitVersionType enum
      let versionTypeEnum: GitVersionType | undefined;
      if (args.versionType && args.version) {
        if (args.versionType === 'branch') {
          versionTypeEnum = GitVersionType.Branch;
        } else if (args.versionType === 'commit') {
          versionTypeEnum = GitVersionType.Commit;
        } else if (args.versionType === 'tag') {
          versionTypeEnum = GitVersionType.Tag;
        }
      }

      const result = await getFileContent(
        connection,
        args.projectId ?? defaultProject,
        args.repositoryId,
        args.path,
        versionTypeEnum !== undefined && args.version
          ? { versionType: versionTypeEnum, version: args.version }
          : undefined,
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'get_all_repositories_tree': {
      const args = GetAllRepositoriesTreeSchema.parse(request.params.arguments);
      const result = await getAllRepositoriesTree(connection, {
        ...args,
        projectId: args.projectId ?? defaultProject,
        organizationId: args.organizationId ?? defaultOrg,
      });

      // Format the output as plain text tree representation
      let formattedOutput = '';
      for (const repo of result.repositories) {
        formattedOutput += formatRepositoryTree(
          repo.name,
          repo.tree,
          repo.stats,
          repo.error,
        );
        formattedOutput += '\n'; // Add blank line between repositories
      }

      return {
        content: [{ type: 'text', text: formattedOutput }],
      };
    }
    default:
      throw new Error(`Unknown repositories tool: ${request.params.name}`);
  }
};
