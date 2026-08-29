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
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import { RequestHandler } from '../../shared/types/request-handler';
import { createRequestIdentifier } from '../../shared/handlers';
import { jsonResponse } from '../../shared/handlers';
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
export const isProjectsRequest = createRequestIdentifier([
  'list_projects',
  'get_project',
  'get_project_details',
]);

/**
 * Handles projects feature requests
 */
export const handleProjectsRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
): Promise<{ content: Array<{ type: string; text: string }> }> => {
  switch (request.params.name) {
    case 'list_projects': {
      const args = ListProjectsSchema.parse(request.params.arguments);
      const result = await listProjects(connection, {
        stateFilter: args.stateFilter,
        top: args.top,
        skip: args.skip,
        continuationToken: args.continuationToken,
      });
      return jsonResponse(result);
    }
    case 'get_project': {
      const args = GetProjectSchema.parse(request.params.arguments);
      const result = await getProject(
        connection,
        args.projectId ?? defaultProject,
      );
      return jsonResponse(result);
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
      return jsonResponse(result);
    }
    default:
      throw new Error(`Unknown projects tool: ${request.params.name}`);
  }
};
