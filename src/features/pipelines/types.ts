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
 * Options for listing runs of a pipeline
 */
export interface ListPipelineRunsOptions {
  projectId: string;
  pipelineId: number;
  top?: number;
  continuationToken?: string;
  branch?: string;
  state?:
    | 'notStarted'
    | 'inProgress'
    | 'completed'
    | 'cancelling'
    | 'postponed';
  result?: 'succeeded' | 'partiallySucceeded' | 'failed' | 'canceled' | 'none';
  createdFrom?: string;
  createdTo?: string;
  orderBy?: 'createdDate desc' | 'createdDate asc';
}

/**
 * Result of listing pipeline runs
 */
export interface ListPipelineRunsResult {
  runs: Run[];
  continuationToken?: string;
}

/**
 * Options for retrieving a single pipeline run
 */
export interface GetPipelineRunOptions {
  projectId: string;
  runId: number;
  pipelineId?: number;
}

export interface PipelineArtifactItem {
  path: string;
  itemType: 'file' | 'folder';
  size?: number;
}

export interface PipelineRunArtifact {
  name: string;
  type?: string;
  source?: string;
  downloadUrl?: string;
  resourceUrl?: string;
  containerId?: number;
  rootPath?: string;
  signedContentUrl?: string;
  /** Sorted list of files/folders discovered inside the artifact */
  items?: PipelineArtifactItem[];
  /** Indicates the artifact has more items than were returned */
  itemsTruncated?: boolean;
}

export interface PipelineRunDetails extends Run {
  artifacts?: PipelineRunArtifact[];
}

export interface DownloadPipelineArtifactOptions {
  projectId: string;
  runId: number;
  artifactPath: string;
  pipelineId?: number;
}

export interface PipelineArtifactContent {
  artifact: string;
  path: string;
  content: string;
}

/**
 * Options for retrieving the timeline of a pipeline run
 */
export interface GetPipelineTimelineOptions {
  projectId: string;
  runId: number;
  timelineId?: string;
  pipelineId?: number;
  state?: string | string[];
  result?: string | string[];
}

export type PipelineTimeline = Record<string, unknown>;

/**
 * Options for retrieving a specific pipeline log
 */
export interface GetPipelineLogOptions {
  projectId: string;
  runId: number;
  logId: number;
  pipelineId?: number;
  format?: 'plain' | 'json';
  startLine?: number;
  endLine?: number;
}

export type PipelineLogContent = unknown;

export { Pipeline, Run };
