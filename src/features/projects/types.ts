import type {
  TeamProject,
  WebApiTeam,
} from 'azure-devops-node-api/interfaces/CoreInterfaces.js';

/**
 * Options for listing projects
 */
export interface ListProjectsOptions {
  stateFilter?: number;
  top?: number;
  skip?: number;
  continuationToken?: number;
}

/**
 * Options for listing teams
 */
export interface ListTeamsOptions {
  projectId?: string;
  allProjects?: boolean;
  mine?: boolean;
  top?: number;
  skip?: number;
  expandIdentity?: boolean;
}

// Re-export TeamProject and WebApiTeam types for convenience
export type { TeamProject, WebApiTeam };
