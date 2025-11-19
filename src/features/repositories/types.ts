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
 * Options for getting a repository tree starting at a specific path
 */
export interface GetRepositoryTreeOptions {
  projectId: string;
  repositoryId: string;
  /**
   * Path within the repository to start from. Defaults to '/'
   */
  path?: string;
  /**
   * Maximum depth to traverse (0 = unlimited)
   */
  depth?: number;
}

/**
 * Options for creating a new branch from an existing one
 */
export interface CreateBranchOptions {
  projectId: string;
  repositoryId: string;
  /** Source branch name to copy from */
  sourceBranch: string;
  /** Name of the new branch to create */
  newBranch: string;
}

/**
 * Description of a single file change for commit creation
 */
export interface FileChange {
  /**
   * Optional path hint for the change. If omitted, the path from the diff
   * header will be used.
   */
  path?: string;
  /** Unified diff patch representing the change */
  patch?: string;
  /**
   * Alternative to patch: exact string to search for in the file.
   * Must be used together with 'replace'. The server will generate the diff.
   */
  search?: string;
  /**
   * Alternative to patch: exact string to replace 'search' with.
   * Must be used together with 'search'. The server will generate the diff.
   */
  replace?: string;
}

/**
 * Options for creating a commit with multiple file changes
 */
export interface CreateCommitOptions {
  projectId: string;
  repositoryId: string;
  branchName: string;
  commitMessage: string;
  changes: FileChange[];
}

/**
 * Options for listing commits within a repository branch
 */
export interface ListCommitsOptions {
  projectId: string;
  repositoryId: string;
  branchName: string;
  top?: number;
  skip?: number;
}

/**
 * Representation of a commit along with the file diffs it touches
 */
export interface CommitWithContent {
  commitId: string;
  comment?: string;
  author?: {
    name?: string;
    email?: string;
    date?: Date;
  };
  committer?: {
    name?: string;
    email?: string;
    date?: Date;
  };
  url?: string;
  parents?: string[];
  files: Array<{ path: string; patch: string }>;
}

/**
 * Response for listing commits with their associated content
 */
export interface ListCommitsResponse {
  commits: CommitWithContent[];
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
