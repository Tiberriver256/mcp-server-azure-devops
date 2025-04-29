// Re-export types
export * from './types';

// Re-export features
export * from './list-pipelines';
export * from './get-pipeline';
export * from './trigger-pipeline';

// Export tool definitions
export * from './tool-definitions';

import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import {
  RequestIdentifier,
  RequestHandler,
} from '../../shared/types/request-handler';
import { ListPipelinesSchema } from './list-pipelines';
import { GetPipelineSchema } from './get-pipeline';
import { TriggerPipelineSchema } from './trigger-pipeline';
import { listPipelines } from './list-pipelines';
import { getPipeline } from './get-pipeline';
import { triggerPipeline } from './trigger-pipeline';
import { defaultProject } from '../../utils/environment';

/**
 * Checks if the request is for the pipelines feature
 */
export const isPipelinesRequest: RequestIdentifier = (
  request: CallToolRequest,
): boolean => {
  const toolName = request.params.name;
  return ['list_pipelines', 'get_pipeline', 'trigger_pipeline'].includes(
    toolName,
  );
};

/**
 * Handles pipelines feature requests
 */
export const handlePipelinesRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
): Promise<{ content: Array<{ type: string; text: string }> }> => {
  switch (request.params.name) {
    case 'list_pipelines': {
      const args = ListPipelinesSchema.parse(request.params.arguments);
      const result = await listPipelines(connection, {
        ...args,
        projectId: args.projectId ?? defaultProject,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'get_pipeline': {
      const args = GetPipelineSchema.parse(request.params.arguments);
      const result = await getPipeline(connection, {
        ...args,
        projectId: args.projectId ?? defaultProject,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'trigger_pipeline': {
      const args = TriggerPipelineSchema.parse(request.params.arguments);
      const result = await triggerPipeline(connection, {
        ...args,
        projectId: args.projectId ?? defaultProject,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    default:
      throw new Error(`Unknown pipelines tool: ${request.params.name}`);
  }
};
