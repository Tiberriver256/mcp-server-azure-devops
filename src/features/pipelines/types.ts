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
}

/**
 * Options for getting a pipeline run
 */
export interface GetPipelineRunOptions {
  projectId: string;
  pipelineId: number;
  runId: number;
}

export { Pipeline, Run };
