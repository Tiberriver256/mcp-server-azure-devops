import {
  GitRepository,
  GitBranchStats,
  GitRef,
} from 'azure-devops-node-api/interfaces/GitInterfaces';

/**
 * Options for listing repositories
 */
export interface ListRepositoriesOptions {
  projectId: string;
  includeLinks?: boolean;
}

/**
 * Options for getting repository details
 */
export interface GetRepositoryDetailsOptions {
  projectId: string;
  repositoryId: string;
  includeStatistics?: boolean;
  includeRefs?: boolean;
  refFilter?: string;
  branchName?: string;
}

/**
 * Repository details response
 */
export interface RepositoryDetails {
  repository: GitRepository;
  statistics?: {
    branches: GitBranchStats[];
  };
  refs?: {
    value: GitRef[];
    count: number;
  };
}

// Re-export GitRepository type for convenience
export type { GitRepository, GitBranchStats, GitRef };
