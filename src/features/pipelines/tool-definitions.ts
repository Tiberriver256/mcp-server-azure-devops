import { toJsonSchema } from '../../shared/utils/to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import { ListPipelinesSchema } from './list-pipelines/schema';
import { GetPipelineSchema } from './get-pipeline/schema';
import { ListPipelineRunsSchema } from './list-pipeline-runs/schema';
import { GetPipelineRunSchema } from './get-pipeline-run/schema';
import { DownloadPipelineArtifactSchema } from './download-pipeline-artifact/schema';
import { GetPipelineTimelineSchema } from './pipeline-timeline/schema';
import { GetPipelineLogSchema } from './get-pipeline-log/schema';
import { TriggerPipelineSchema } from './trigger-pipeline/schema';

/**
 * List of pipelines tools
 */
export const pipelinesTools: ToolDefinition[] = [
  {
    name: 'list_pipelines',
    description: 'List pipelines in a project',
    inputSchema: toJsonSchema(ListPipelinesSchema),
    mcp_enabled: true,
  },
  {
    name: 'get_pipeline',
    description: 'Get details of a specific pipeline',
    inputSchema: toJsonSchema(GetPipelineSchema),
    mcp_enabled: true,
  },
  {
    name: 'list_pipeline_runs',
    description: 'List recent runs for a pipeline',
    inputSchema: toJsonSchema(ListPipelineRunsSchema),
    mcp_enabled: true,
  },
  {
    name: 'get_pipeline_run',
    description: 'Get details for a specific pipeline run',
    inputSchema: toJsonSchema(GetPipelineRunSchema),
    mcp_enabled: true,
  },
  {
    name: 'download_pipeline_artifact',
    description:
      'Download a file from a pipeline run artifact and return its textual content',
    inputSchema: toJsonSchema(DownloadPipelineArtifactSchema),
    mcp_enabled: true,
  },
  {
    name: 'pipeline_timeline',
    description:
      'Retrieve the timeline of stages and jobs for a pipeline run, to reduce the amount of data returned, you can filter by state and result',
    inputSchema: toJsonSchema(GetPipelineTimelineSchema),
    mcp_enabled: true,
  },
  {
    name: 'get_pipeline_log',
    description:
      'Retrieve a specific pipeline log using the timeline log identifier',
    inputSchema: toJsonSchema(GetPipelineLogSchema),
    mcp_enabled: true,
  },
  {
    name: 'trigger_pipeline',
    description: 'Trigger a pipeline run',
    inputSchema: toJsonSchema(TriggerPipelineSchema),
    mcp_enabled: true,
  },
];
