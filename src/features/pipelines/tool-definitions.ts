import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import { ListPipelinesSchema } from './list-pipelines/schema';
import { GetPipelineSchema } from './get-pipeline/schema';
import { TriggerPipelineSchema } from './trigger-pipeline/schema';
import { ListPipelineRunsSchema } from './list-pipeline-runs/schema';
import { GetPipelineRunSchema } from './get-pipeline-run/schema';
import { GetPipelineRunLogsSchema } from './get-pipeline-run-logs/schema';

/**
 * List of pipelines tools
 */
export const pipelinesTools: ToolDefinition[] = [
  {
    name: 'list_pipelines',
    description: 'List pipelines in a project',
    inputSchema: zodToJsonSchema(ListPipelinesSchema),
  },
  {
    name: 'get_pipeline',
    description: 'Get details of a specific pipeline',
    inputSchema: zodToJsonSchema(GetPipelineSchema),
  },
  {
    name: 'trigger_pipeline',
    description: 'Trigger a pipeline run',
    inputSchema: zodToJsonSchema(TriggerPipelineSchema),
  },
  {
    name: 'list_pipeline_runs',
    description: 'List recent runs for a specific pipeline',
    inputSchema: zodToJsonSchema(ListPipelineRunsSchema),
  },
  {
    name: 'get_pipeline_run',
    description: 'Get details of a specific pipeline run',
    inputSchema: zodToJsonSchema(GetPipelineRunSchema),
  },
  {
    name: 'get_pipeline_run_logs',
    description: 'Get logs from a specific pipeline run',
    inputSchema: zodToJsonSchema(GetPipelineRunLogsSchema),
  },
];
