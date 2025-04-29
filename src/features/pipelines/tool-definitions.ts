import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import { ListPipelinesSchema } from './list-pipelines/schema';
import { GetPipelineSchema } from './get-pipeline/schema';
import { TriggerPipelineSchema } from './trigger-pipeline/schema';

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
];
