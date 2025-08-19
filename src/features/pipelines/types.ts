// Re-export the Pipeline interface from the Azure DevOps API
import {
  Pipeline,
  Run,
} from 'azure-devops-node-api/interfaces/PipelinesInterfaces';

/**
 * Options for listing pipelines
 */
export interface ListPipelinesOptions {
  projectId: string;
  orderBy?: string;
  top?: number;
  continuationToken?: string;
}

/**
 * Options for getting a pipeline
 */
export interface GetPipelineOptions {
  projectId: string;
  organizationId?: string;
  pipelineId: number;
  pipelineVersion?: number;
}

/**
 * Options for triggering a pipeline
 */
export interface TriggerPipelineOptions {
  projectId: string;
  pipelineId: number;
  branch?: string;
  variables?: Record<string, { value: string; isSecret?: boolean }>;
  templateParameters?: Record<string, string>;
  stagesToSkip?: string[];
}

/**
 * Options for listing pipeline runs
 */
export interface ListPipelineRunsOptions {
  projectId: string;
  pipelineId: number;
  top?: number;
}

/**
 * Options for getting a pipeline run
 */
export interface GetPipelineRunOptions {
  projectId: string;
  pipelineId: number;
  runId: number;
}

/**
 * Options for getting pipeline run logs
 */
export interface GetPipelineRunLogsOptions {
  projectId: string;
  pipelineId: number;
  runId: number;
  logId?: number;
  fetchContent?: boolean;
  expand?: 'none' | 'signedContent';
}

/**
 * Options for downloading pipeline run logs
 */
export interface DownloadPipelineRunLogsOptions {
  projectId?: string;
  pipelineId: number;
  runId: number;
  outputDir?: string;
}

/**
 * Options for reading a downloaded log file
 */
export interface ReadDownloadedLogOptions {
  downloadPath: string;
  fileName: string;
  offset?: number;
  limit?: number;
}

/**
 * Options for getting pipeline log content directly
 */
export interface GetPipelineLogContentOptions {
  projectId?: string;
  pipelineId: number;
  runId: number;
  logId: number;
  offset?: number;
  limit?: number;
  includeDownloadPath?: boolean;
}

export { Pipeline, Run };
