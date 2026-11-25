export * from './schemas.ts';
export * from './types.ts';
export { getProject } from './get-project/feature.ts';
export { getProjectDetails } from './get-project-details/feature.ts';
export { listProjects } from './list-projects/feature.ts';
export { listTeams } from './list-teams/feature.ts';

import { defineTool } from '../../shared/registry/tool-registry.ts';
import type { FeatureModule } from '../../shared/registry/tool-registry.ts';
import {
  GetProjectSchema,
  GetProjectDetailsSchema,
  ListProjectsSchema,
  ListTeamsSchema,
} from './schemas.ts';
import { getProject } from './get-project/feature.ts';
import { getProjectDetails } from './get-project-details/feature.ts';
import { listProjects } from './list-projects/feature.ts';
import { listTeams } from './list-teams/feature.ts';

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
    defineTool({
      name: 'list_teams',
      description:
        'List teams in a project or across all projects in the organization/collection',
      schema: ListTeamsSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        const resolvedProjectId = args.allProjects
          ? undefined
          : ctx.resolveOptionalProjectId(args.projectId);
        return await listTeams(connection, {
          projectId: resolvedProjectId,
          allProjects: args.allProjects,
          mine: args.mine,
          top: args.top,
          skip: args.skip,
          expandIdentity: args.expandIdentity,
        });
      },
    }),
  ],
};
