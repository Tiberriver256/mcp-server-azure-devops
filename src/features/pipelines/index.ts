export * from './types';
export { listPipelines } from './list-pipelines/feature';
export { ListPipelinesSchema } from './list-pipelines/schema';
export { getPipeline } from './get-pipeline/feature';
export { GetPipelineSchema } from './get-pipeline/schema';
export {
  listPipelineRuns,
  normalizeBranch,
} from './list-pipeline-runs/feature';
export { ListPipelineRunsSchema } from './list-pipeline-runs/schema';
export { getPipelineRun } from './get-pipeline-run/feature';
export { GetPipelineRunSchema } from './get-pipeline-run/schema';
export {
  downloadPipelineArtifact,
  normalizeArtifactPath,
  buildContainerPathCandidates,
  selectZipEntry,
} from './download-pipeline-artifact/feature';
export { DownloadPipelineArtifactSchema } from './download-pipeline-artifact/schema';
export { getPipelineTimeline } from './pipeline-timeline/feature';
export { GetPipelineTimelineSchema } from './pipeline-timeline/schema';
export { getPipelineLog } from './get-pipeline-log/feature';
export { GetPipelineLogSchema } from './get-pipeline-log/schema';
export { triggerPipeline } from './trigger-pipeline/feature';
export { TriggerPipelineSchema } from './trigger-pipeline/schema';
export * from './run-reference';

import type { WebApi } from 'azure-devops-node-api';
import { defineTool } from '../../shared/registry/tool-registry';
import type { FeatureModule } from '../../shared/registry/tool-registry';
import type { ToolContext } from '../../shared/session/azure-devops-session';
import { ListPipelinesSchema } from './list-pipelines/schema';
import { GetPipelineSchema } from './get-pipeline/schema';
import { ListPipelineRunsSchema } from './list-pipeline-runs/schema';
import { GetPipelineRunSchema } from './get-pipeline-run/schema';
import { DownloadPipelineArtifactSchema } from './download-pipeline-artifact/schema';
import { GetPipelineTimelineSchema } from './pipeline-timeline/schema';
import { GetPipelineLogSchema } from './get-pipeline-log/schema';
import { TriggerPipelineSchema } from './trigger-pipeline/schema';
import { listPipelines } from './list-pipelines/feature';
import { getPipeline } from './get-pipeline/feature';
import { listPipelineRuns } from './list-pipeline-runs/feature';
import { getPipelineRun } from './get-pipeline-run/feature';
import { downloadPipelineArtifact } from './download-pipeline-artifact/feature';
import { getPipelineTimeline } from './pipeline-timeline/feature';
import { getPipelineLog } from './get-pipeline-log/feature';
import { triggerPipeline } from './trigger-pipeline/feature';
import type { RunReferenceInput } from './run-reference';
import { resolvePipelineReference, resolveRunReference } from './run-reference';

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
    throw new Error('Either pipelineId or pipelineName is required');
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
