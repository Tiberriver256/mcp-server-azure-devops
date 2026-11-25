export * from './types.ts';
export { listPipelines } from './list-pipelines/feature.ts';
export { ListPipelinesSchema } from './list-pipelines/schema.ts';
export { getPipeline } from './get-pipeline/feature.ts';
export { GetPipelineSchema } from './get-pipeline/schema.ts';
export {
  listPipelineRuns,
  normalizeBranch,
} from './list-pipeline-runs/feature.ts';
export { ListPipelineRunsSchema } from './list-pipeline-runs/schema.ts';
export { getPipelineRun } from './get-pipeline-run/feature.ts';
export { GetPipelineRunSchema } from './get-pipeline-run/schema.ts';
export {
  downloadPipelineArtifact,
  normalizeArtifactPath,
  buildContainerPathCandidates,
  selectZipEntry,
} from './download-pipeline-artifact/feature.ts';
export { DownloadPipelineArtifactSchema } from './download-pipeline-artifact/schema.ts';
export { getPipelineTimeline } from './pipeline-timeline/feature.ts';
export { GetPipelineTimelineSchema } from './pipeline-timeline/schema.ts';
export { getPipelineLog } from './get-pipeline-log/feature.ts';
export { GetPipelineLogSchema } from './get-pipeline-log/schema.ts';
export { triggerPipeline } from './trigger-pipeline/feature.ts';
export { TriggerPipelineSchema } from './trigger-pipeline/schema.ts';
export * from './run-reference.ts';

import type { WebApi } from 'azure-devops-node-api';
import { AzureDevOpsValidationError } from '../../shared/errors/index.ts';
import { defineTool } from '../../shared/registry/tool-registry.ts';
import type { FeatureModule } from '../../shared/registry/tool-registry.ts';
import type { ToolContext } from '../../shared/session/azure-devops-session.ts';
import { ListPipelinesSchema } from './list-pipelines/schema.ts';
import { GetPipelineSchema } from './get-pipeline/schema.ts';
import { ListPipelineRunsSchema } from './list-pipeline-runs/schema.ts';
import { GetPipelineRunSchema } from './get-pipeline-run/schema.ts';
import { DownloadPipelineArtifactSchema } from './download-pipeline-artifact/schema.ts';
import { GetPipelineTimelineSchema } from './pipeline-timeline/schema.ts';
import { GetPipelineLogSchema } from './get-pipeline-log/schema.ts';
import { TriggerPipelineSchema } from './trigger-pipeline/schema.ts';
import { listPipelines } from './list-pipelines/feature.ts';
import { getPipeline } from './get-pipeline/feature.ts';
import { listPipelineRuns } from './list-pipeline-runs/feature.ts';
import { getPipelineRun } from './get-pipeline-run/feature.ts';
import { downloadPipelineArtifact } from './download-pipeline-artifact/feature.ts';
import { getPipelineTimeline } from './pipeline-timeline/feature.ts';
import { getPipelineLog } from './get-pipeline-log/feature.ts';
import { triggerPipeline } from './trigger-pipeline/feature.ts';
import type { RunReferenceInput } from './run-reference.ts';
import {
  resolvePipelineReference,
  resolveRunReference,
} from './run-reference.ts';

async function withResolvedRun<
  T extends RunReferenceInput & { projectId?: string },
>(
  ctx: ToolContext,
  connection: WebApi,
  args: T,
): Promise<
  Omit<T, 'pipelineName' | 'buildNumber'> & {
    projectId: string;
    runId: number;
    pipelineId?: number;
  }
> {
  const {
    pipelineName: _pipelineName,
    buildNumber: _buildNumber,
    ...rest
  } = args;
  const projectId = ctx.resolveProjectId(args.projectId);
  const resolved = await resolveRunReference(connection, projectId, args);
  return {
    ...rest,
    projectId,
    runId: resolved.runId,
    pipelineId: resolved.pipelineId,
  };
}

async function withResolvedPipeline<
  T extends Pick<RunReferenceInput, 'pipelineId' | 'pipelineName'> & {
    projectId?: string;
  },
>(
  ctx: ToolContext,
  connection: WebApi,
  args: T,
): Promise<
  Omit<T, 'pipelineName'> & { projectId: string; pipelineId: number }
> {
  const { pipelineName: _pipelineName, ...rest } = args;
  const projectId = ctx.resolveProjectId(args.projectId);
  const pipelineId = await resolvePipelineReference(
    connection,
    projectId,
    args,
  );
  if (typeof pipelineId !== 'number') {
    throw new AzureDevOpsValidationError(
      'Either pipelineId or pipelineName is required',
    );
  }
  return { ...rest, projectId, pipelineId };
}

export const pipelinesFeature: FeatureModule = {
  toolset: 'pipelines',
  tools: [
    defineTool({
      name: 'list_pipelines',
      description: 'List pipelines in a project',
      schema: ListPipelinesSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi();
        return await listPipelines(connection, {
          ...args,
          projectId: ctx.resolveProjectId(args.projectId),
        });
      },
    }),
    defineTool({
      name: 'get_pipeline',
      description:
        'Get details of a specific pipeline, identified by pipelineId or pipelineName',
      schema: GetPipelineSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi();
        return await getPipeline(
          connection,
          await withResolvedPipeline(ctx, connection, args),
        );
      },
    }),
    defineTool({
      name: 'list_pipeline_runs',
      description:
        'List recent runs for a pipeline, identified by pipelineId or pipelineName',
      schema: ListPipelineRunsSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi();
        return await listPipelineRuns(
          connection,
          await withResolvedPipeline(ctx, connection, args),
          ctx,
        );
      },
    }),
    defineTool({
      name: 'get_pipeline_run',
      description:
        'Get details for a specific pipeline run. The run can be identified by runId or by pipelineName (or pipelineId) plus buildNumber.',
      schema: GetPipelineRunSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi();
        return await getPipelineRun(
          connection,
          await withResolvedRun(ctx, connection, args),
          ctx,
        );
      },
    }),
    defineTool({
      name: 'download_pipeline_artifact',
      description:
        'Download a file from a pipeline run artifact and return its textual content. The run can be identified by runId or by pipelineName (or pipelineId) plus buildNumber.',
      schema: DownloadPipelineArtifactSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi();
        return await downloadPipelineArtifact(
          connection,
          await withResolvedRun(ctx, connection, args),
          ctx,
        );
      },
    }),
    defineTool({
      name: 'pipeline_timeline',
      description:
        'Retrieve the timeline of stages and jobs for a pipeline run, to reduce the amount of data returned, you can filter by state and result. The run can be identified by runId or by pipelineName (or pipelineId) plus buildNumber.',
      schema: GetPipelineTimelineSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi();
        return await getPipelineTimeline(
          connection,
          await withResolvedRun(ctx, connection, args),
          ctx,
        );
      },
    }),
    defineTool({
      name: 'get_pipeline_log',
      description:
        'Retrieve a specific pipeline log using the timeline log identifier. The run can be identified by runId or by pipelineName (or pipelineId) plus buildNumber.',
      schema: GetPipelineLogSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi();
        return await getPipelineLog(
          connection,
          await withResolvedRun(ctx, connection, args),
          ctx,
        );
      },
    }),
    defineTool({
      name: 'trigger_pipeline',
      description:
        'Trigger a pipeline run. The pipeline can be identified by pipelineId or pipelineName.',
      schema: TriggerPipelineSchema,
      readOnly: false,
      destructive: true,
      idempotent: false,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi();
        return await triggerPipeline(
          connection,
          await withResolvedPipeline(ctx, connection, args),
        );
      },
    }),
  ],
};
