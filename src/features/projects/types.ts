import type { TeamProject } from 'azure-devops-node-api/interfaces/CoreInterfaces.js';

/**
 * Options for listing projects
 */
export interface ListProjectsOptions {
  stateFilter?: number;
  top?: number;
  skip?: number;
  continuationToken?: number;
}

// Re-export TeamProject type for convenience
export type { TeamProject };
