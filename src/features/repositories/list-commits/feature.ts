import type { WebApi } from 'azure-devops-node-api';
import { GitVersionType } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzureDevOpsError } from '../../../shared/errors';
import { buildGitChangesDiffs } from '../../../shared/utils/git-diff';
import type {
  CommitWithContent,
  ListCommitsOptions,
  ListCommitsResponse,
} from '../types';

/**
 * List commits on a branch including their file-level diffs with bounded
 * concurrency, blob size limits, and binary file guards.
 */
export async function listCommits(
  connection: WebApi,
  options: ListCommitsOptions,
): Promise<ListCommitsResponse> {
  try {
    const gitApi = await connection.getGitApi();
    const commits = await gitApi.getCommits(
      options.repositoryId,
      {
        itemVersion: {
          version: options.branchName,
          versionType: GitVersionType.Branch,
        },
        $top: options.top ?? 10,
        $skip: options.skip,
      },
      options.projectId,
    );

    if (!commits || commits.length === 0) {
      return { commits: [] };
    }

    const commitsWithContent: CommitWithContent[] = [];

    for (const commit of commits) {
      const commitId = commit.commitId;
      if (!commitId) {
        continue;
      }

      const commitChanges = await gitApi.getChanges(
        commitId,
        options.repositoryId,
        options.projectId,
      );
      const changeEntries = commitChanges?.changes ?? [];
      const files = await buildGitChangesDiffs(
        gitApi,
        options.repositoryId,
        options.projectId,
        changeEntries,
      );

      commitsWithContent.push({
        commitId,
        comment: commit.comment,
        author: commit.author,
        committer: commit.committer,
        url: commit.url,
        parents: commit.parents,
        files,
      });
    }

    return { commits: commitsWithContent };
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to list commits: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
