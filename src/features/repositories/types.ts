import { GitRepository } from 'azure-devops-node-api/interfaces/GitInterfaces';

/**
 * Options for listing repositories
 */
export interface ListRepositoriesOptions {
  projectId: string;
  includeLinks?: boolean;
}

// Re-export GitRepository type for convenience
export type { GitRepository };
