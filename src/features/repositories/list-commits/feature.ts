import { WebApi } from 'azure-devops-node-api';
import {
  GitChange,
  GitVersionType,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { createTwoFilesPatch } from 'diff';
import { AzureDevOpsError } from '../../../shared/errors';
import {
  CommitWithContent,
  ListCommitsOptions,
  ListCommitsResponse,
} from '../types';

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  return await new Promise<string>((resolve, reject) => {
    stream.on('data', (c) => chunks.push(Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * List commits on a branch including their file level diffs
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

    const getBlobText = async (objId?: string): Promise<string> => {
      if (!objId) {
        return '';
      }
      const stream = await gitApi.getBlobContent(
        options.repositoryId,
        objId,
        options.projectId,
      );
      return stream ? await streamToString(stream) : '';
    };

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

      const files = await Promise.all(
        changeEntries.map(async (entry: GitChange) => {
          const path = entry.item?.path || entry.originalPath || '';
          const [oldContent, newContent] = await Promise.all([
            getBlobText(entry.item?.originalObjectId),
            getBlobText(entry.item?.objectId),
          ]);
          const patch = createTwoFilesPatch(
            entry.originalPath || path,
            path,
            oldContent,
            newContent,
          );
          return { path, patch };
        }),
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
