/**
 * Pipeline interface representing a pipeline in Azure DevOps
 */
export interface Pipeline {
  id: number;
  name: string;
  folder: string;
  revision: number;
  url: string;
}

/**
 * Pipeline run interface representing a pipeline run in Azure DevOps
 */
export interface PipelineRun {
  id: number;
  name: string;
  state: string;
  result?: string;
  createdDate: string;
  finishedDate?: string;
  url: string;
}

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
 * Options for listing pipeline runs
 */
export interface ListPipelineRunsOptions {
  project: string;
  pipelineId: number;
}

/**
 * Options for running a pipeline
 */
export interface RunPipelineOptions {
  project: string;
  pipelineId: number;
  pipelineVersion?: number;
  parameters?: Record<string, string>;
  variables?: Record<string, string>;
  resources?: Record<string, any>;
  stagesToSkip?: string[];
}
