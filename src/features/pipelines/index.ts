// Re-export types
export * from './types';

// Re-export features
export * from './list-pipelines';
export * from './get-pipeline';
export * from './trigger-pipeline';
export * from './list-pipeline-runs';
export * from './get-pipeline-run';
export * from './get-pipeline-run-logs';
export * from './download-pipeline-run-logs';
export * from './read-downloaded-log';

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
import { ListPipelineRunsSchema } from './list-pipeline-runs/schema';
import { GetPipelineRunSchema } from './get-pipeline-run/schema';
import { GetPipelineRunLogsSchema } from './get-pipeline-run-logs/schema';
import { DownloadPipelineRunLogsSchema } from './download-pipeline-run-logs/schema';
import {
  ReadDownloadedLogSchema,
  ListDownloadedLogsSchema,
} from './read-downloaded-log/schema';
import { listPipelines } from './list-pipelines';
import { getPipeline } from './get-pipeline';
import { triggerPipeline } from './trigger-pipeline';
import { listPipelineRuns } from './list-pipeline-runs/feature';
import { getPipelineRun } from './get-pipeline-run/feature';
import { getPipelineRunLogs } from './get-pipeline-run-logs/feature';
import { downloadPipelineRunLogs } from './download-pipeline-run-logs/feature';
import {
  readDownloadedLog,
  listDownloadedLogs,
} from './read-downloaded-log/feature';
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
    'trigger_pipeline',
    'list_pipeline_runs',
    'get_pipeline_run',
    'get_pipeline_run_logs',
    'download_pipeline_run_logs',
    'read_downloaded_log',
    'list_downloaded_logs',
  ].includes(toolName);
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
    case 'get_pipeline_run_logs': {
      const args = GetPipelineRunLogsSchema.parse(request.params.arguments);
      const result = await getPipelineRunLogs(connection, {
        ...args,
        projectId: args.projectId ?? defaultProject,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'download_pipeline_run_logs': {
      const args = DownloadPipelineRunLogsSchema.parse(
        request.params.arguments,
      );
      const result = await downloadPipelineRunLogs(connection, {
        ...args,
        projectId: args.projectId ?? defaultProject,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'read_downloaded_log': {
      const args = ReadDownloadedLogSchema.parse(request.params.arguments);
      const result = await readDownloadedLog(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'list_downloaded_logs': {
      const args = ListDownloadedLogsSchema.parse(request.params.arguments);
      const result = await listDownloadedLogs(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    default:
      throw new Error(`Unknown pipelines tool: ${request.params.name}`);
  }
};
