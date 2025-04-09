import {
  GitRepository,
  GitBranchStats,
  GitRef,
  GitItem,
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

/**
 * Options for getting all repositories tree
 */
export interface GetAllRepositoriesTreeOptions {
  organizationId: string;
  projectId: string;
  repositoryPattern?: string;
  depth?: number;
  pattern?: string;
}

/**
 * Repository tree item representation for output
 */
export interface RepositoryTreeItem {
  name: string;
  path: string;
  isFolder: boolean;
  level: number;
}

/**
 * Repository tree response for a single repository
 */
export interface RepositoryTreeResponse {
  name: string;
  tree: RepositoryTreeItem[];
  stats: {
    directories: number;
    files: number;
  };
  error?: string;
}

/**
 * Complete all repositories tree response
 */
export interface AllRepositoriesTreeResponse {
  repositories: RepositoryTreeResponse[];
}

// Re-export GitRepository type for convenience
export type { GitRepository, GitBranchStats, GitRef, GitItem };
