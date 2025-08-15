// Re-export schemas and types
export * from './schemas';
export * from './types';

// Re-export features
export * from './get-project';
export * from './get-project-details';
export * from './list-projects';

// Export tool definitions
export * from './tool-definitions';

// New exports for request handling
import {
  CallToolRequest,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import {
  RequestIdentifier,
  RequestHandler,
} from '../../shared/types/request-handler';
import { defaultProject } from '../../utils/environment';
import {
  GetProjectSchema,
  GetProjectDetailsSchema,
  ListProjectsSchema,
  getProject,
  getProjectDetails,
  listProjects,
} from './';

/**
 * Checks if the request is for the projects feature
 */
export const isProjectsRequest: RequestIdentifier = (
  request: CallToolRequest,
): boolean => {
  const toolName = request.params.name;
  return ['list_projects', 'get_project', 'get_project_details'].includes(
    toolName,
  );
};

/**
 * Handles projects feature requests
 */
export const handleProjectsRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
): Promise<CallToolResult> => {
  switch (request.params.name) {
    case 'list_projects': {
      const args = ListProjectsSchema.parse(request.params.arguments);
      const result = await listProjects(connection, {
        stateFilter: args.stateFilter,
        top: args.top,
        skip: args.skip,
        continuationToken: args.continuationToken,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'get_project': {
      const args = GetProjectSchema.parse(request.params.arguments);
      const result = await getProject(
        connection,
        args.projectId ?? defaultProject,
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'get_project_details': {
      const args = GetProjectDetailsSchema.parse(request.params.arguments);
      const result = await getProjectDetails(connection, {
        projectId: args.projectId ?? defaultProject,
        includeProcess: args.includeProcess,
        includeWorkItemTypes: args.includeWorkItemTypes,
        includeFields: args.includeFields,
        includeTeams: args.includeTeams,
        expandTeamIdentity: args.expandTeamIdentity,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    default:
      throw new Error(`Unknown projects tool: ${request.params.name}`);
  }
};
