export * from './schemas';
export * from './types';
export { getProject } from './get-project/feature';
export { getProjectDetails } from './get-project-details/feature';
export { listProjects } from './list-projects/feature';

import { defineTool } from '../../shared/registry/tool-registry';
import type { FeatureModule } from '../../shared/registry/tool-registry';
import {
  GetProjectSchema,
  GetProjectDetailsSchema,
  ListProjectsSchema,
} from './schemas';
import { getProject } from './get-project/feature';
import { getProjectDetails } from './get-project-details/feature';
import { listProjects } from './list-projects/feature';

export const projectsFeature: FeatureModule = {
  toolset: 'projects',
  tools: [
    defineTool({
      name: 'list_projects',
      description: 'List all projects in an organization',
      schema: ListProjectsSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        return await listProjects(connection, {
          stateFilter: args.stateFilter,
          top: args.top,
          skip: args.skip,
          continuationToken: args.continuationToken,
        });
      },
    }),
    defineTool({
      name: 'get_project',
      description: 'Get details of a specific project',
      schema: GetProjectSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        return await getProject(
          connection,
          ctx.resolveProjectId(args.projectId),
        );
      },
    }),
    defineTool({
      name: 'get_project_details',
      description:
        'Get comprehensive details of a project including process, work item types, and teams',
      schema: GetProjectDetailsSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        return await getProjectDetails(connection, {
          projectId: ctx.resolveProjectId(args.projectId),
          includeProcess: args.includeProcess,
          includeWorkItemTypes: args.includeWorkItemTypes,
          includeFields: args.includeFields,
          includeTeams: args.includeTeams,
          expandTeamIdentity: args.expandTeamIdentity,
        });
      },
    }),
  ],
};
