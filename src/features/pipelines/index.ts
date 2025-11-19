// Re-export types
export * from './types';

// Re-export features
export * from './list-pipelines';
export * from './get-pipeline';
export * from './list-pipeline-runs';
export * from './get-pipeline-run';
export * from './download-pipeline-artifact';
export * from './pipeline-timeline';
export * from './get-pipeline-log';
export * from './trigger-pipeline';

// Export tool definitions
export * from './tool-definitions';

import {
  CallToolRequest,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import {
  RequestIdentifier,
  RequestHandler,
} from '../../shared/types/request-handler';
import { ListPipelinesSchema } from './list-pipelines';
import { GetPipelineSchema } from './get-pipeline';
import { ListPipelineRunsSchema } from './list-pipeline-runs';
import { GetPipelineRunSchema } from './get-pipeline-run';
import { DownloadPipelineArtifactSchema } from './download-pipeline-artifact';
import { GetPipelineTimelineSchema } from './pipeline-timeline';
import { GetPipelineLogSchema } from './get-pipeline-log';
import { TriggerPipelineSchema } from './trigger-pipeline';
import { listPipelines } from './list-pipelines';
import { getPipeline } from './get-pipeline';
import { listPipelineRuns } from './list-pipeline-runs';
import { getPipelineRun } from './get-pipeline-run';
import { downloadPipelineArtifact } from './download-pipeline-artifact';
import { getPipelineTimeline } from './pipeline-timeline';
import { getPipelineLog } from './get-pipeline-log';
import { triggerPipeline } from './trigger-pipeline';
import { defaultProject } from '../../utils/environment';

/**
 * Checks if the request is for the pipelines feature
 */
export const isPipelinesRequest: RequestIdentifier = (
  request: CallToolRequest,
): boolean => {
  const toolName = request.params.name;
  return [
    'list_pipelines',
    'get_pipeline',
    'list_pipeline_runs',
    'get_pipeline_run',
    'download_pipeline_artifact',
    'pipeline_timeline',
    'get_pipeline_log',
    'trigger_pipeline',
  ].includes(toolName);
};

/**
 * Handles pipelines feature requests
 */
export const handlePipelinesRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
): Promise<CallToolResult> => {
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
    case 'list_pipeline_runs': {
      const args = ListPipelineRunsSchema.parse(request.params.arguments);
      const result = await listPipelineRuns(connection, {
        ...args,
        projectId: args.projectId ?? defaultProject,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'get_pipeline_run': {
      const args = GetPipelineRunSchema.parse(request.params.arguments);
      const result = await getPipelineRun(connection, {
        ...args,
        projectId: args.projectId ?? defaultProject,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'download_pipeline_artifact': {
      const args = DownloadPipelineArtifactSchema.parse(
        request.params.arguments,
      );
      const result = await downloadPipelineArtifact(connection, {
        ...args,
        projectId: args.projectId ?? defaultProject,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'pipeline_timeline': {
      const args = GetPipelineTimelineSchema.parse(request.params.arguments);
      const result = await getPipelineTimeline(connection, {
        ...args,
        projectId: args.projectId ?? defaultProject,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'get_pipeline_log': {
      const args = GetPipelineLogSchema.parse(request.params.arguments);
      const result = await getPipelineLog(connection, {
        ...args,
        projectId: args.projectId ?? defaultProject,
      });
      const text =
        typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      return {
        content: [{ type: 'text', text }],
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
