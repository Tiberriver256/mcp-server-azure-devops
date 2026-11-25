export * from './schemas.ts';
export * from './types.ts';
export { listIterations } from './list-iterations/feature.ts';
export { listTeamIterations } from './list-team-iterations/feature.ts';
export { getTeamSettings } from './get-team-settings/feature.ts';
export { getIterationWorkItems } from './get-iteration-work-items/feature.ts';

import { defineTool } from '../../shared/registry/tool-registry.ts';
import type { RegisteredTool } from '../../shared/registry/tool-registry.ts';
import {
  GetIterationWorkItemsSchema,
  GetTeamSettingsSchema,
  ListIterationsSchema,
  ListTeamIterationsSchema,
} from './schemas.ts';
import { listIterations } from './list-iterations/feature.ts';
import { listTeamIterations } from './list-team-iterations/feature.ts';
import { getTeamSettings } from './get-team-settings/feature.ts';
import {
  assertValidIterationId,
  getIterationWorkItems,
} from './get-iteration-work-items/feature.ts';

export const workTools: readonly RegisteredTool[] = [
  defineTool({
    name: 'list_iterations',
    description:
      'List project iteration (sprint) classification nodes with both integer id and UUID identifier',
    schema: ListIterationsSchema,
    readOnly: true,
    handler: async (ctx, args) => {
      const connection = await ctx.getWebApi(args.organizationId);
      return await listIterations(connection, {
        projectId: ctx.resolveProjectId(args.projectId),
        path: args.path,
        depth: args.depth,
      });
    },
  }),
  defineTool({
    name: 'list_team_iterations',
    description:
      'List configured sprint iterations for a team, optionally filtered by past, current, or future timeframe',
    schema: ListTeamIterationsSchema,
    readOnly: true,
    handler: async (ctx, args) => {
      const connection = await ctx.getWebApi(args.organizationId);
      return await listTeamIterations(connection, {
        projectId: ctx.resolveProjectId(args.projectId),
        teamId: args.teamId,
        timeframe: args.timeframe,
      });
    },
  }),
  defineTool({
    name: 'get_team_settings',
    description:
      'Get sprint and board settings for a team, optionally including default and allowed area paths',
    schema: GetTeamSettingsSchema,
    readOnly: true,
    handler: async (ctx, args) => {
      const connection = await ctx.getWebApi(args.organizationId);
      return await getTeamSettings(connection, {
        projectId: ctx.resolveProjectId(args.projectId),
        teamId: args.teamId,
        includeAreaPaths: args.includeAreaPaths,
      });
    },
  }),
  defineTool({
    name: 'get_iteration_work_items',
    description:
      'Get work item relations assigned to a team iteration by iteration UUID, with optional batched work item detail hydration',
    schema: GetIterationWorkItemsSchema,
    readOnly: true,
    handler: async (ctx, args) => {
      const iterationId = assertValidIterationId(args.iterationId);
      const connection = await ctx.getWebApi(args.organizationId);
      return await getIterationWorkItems(connection, {
        projectId: ctx.resolveProjectId(args.projectId),
        teamId: args.teamId,
        iterationId,
        includeWorkItemDetails: args.includeWorkItemDetails,
        fields: args.fields,
      });
    },
  }),
];

export const workFeature: {
  readonly toolset: 'work';
  readonly tools: readonly RegisteredTool[];
} = {
  toolset: 'work' as const,
  tools: workTools,
};
