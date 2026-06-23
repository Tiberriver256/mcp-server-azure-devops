import { WebApi } from 'azure-devops-node-api';
import { GitPullRequestCommentThread } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzureDevOpsError } from '../../../shared/errors';
import {
  UpdatePullRequestThreadStatusOptions,
  UpdatePullRequestThreadStatusResponse,
} from '../types';
import {
  commentThreadStatusMapper,
  transformCommentThreadStatus,
  transformCommentType,
} from '../../../shared/enums';

/**
 * Update the status of a pull request comment thread
 *
 * @param connection The Azure DevOps WebApi connection
 * @param projectId The ID or name of the project
 * @param repositoryId The ID or name of the repository (optional)
 * @param pullRequestId The ID of the pull request
 * @param threadId The ID of the thread to update
 * @param options Options containing the new status
 * @returns The updated comment thread
 */
export async function updatePullRequestThreadStatus(
  connection: WebApi,
  projectId: string | undefined,
  repositoryId: string | undefined,
  pullRequestId: number,
  threadId: number,
  options: UpdatePullRequestThreadStatusOptions,
): Promise<UpdatePullRequestThreadStatusResponse> {
  try {
    const gitApi = await connection.getGitApi();
    const project = projectId || undefined;

    let resolvedRepositoryId = repositoryId || options.repositoryId;
    if (!resolvedRepositoryId) {
      const pr = await gitApi.getPullRequestById(pullRequestId, project);
      resolvedRepositoryId = pr?.repository?.id;
    }

    if (!resolvedRepositoryId) {
      throw new Error(
        'repositoryId is required (or must be derivable from pullRequestId)',
      );
    }

    // Map status string to CommentThreadStatus enum using commentThreadStatusMapper
    const mappedStatus = commentThreadStatusMapper.toEnum(options.status);
    if (mappedStatus === undefined) {
      throw new Error(`Invalid status value: ${options.status}`);
    }

    // Create the updated thread payload
    const threadUpdate: GitPullRequestCommentThread = {
      status: mappedStatus,
    };

    const updatedThread = await gitApi.updateThread(
      threadUpdate,
      resolvedRepositoryId,
      pullRequestId,
      threadId,
      project,
    );

    if (!updatedThread) {
      throw new Error('Failed to update pull request thread status');
    }

    // Transform comments inside the thread to have string enums
    const transformedComments = updatedThread.comments?.map((comment) => {
      // Get file path and positions from thread context if applicable
      const filePath = updatedThread.threadContext?.filePath;
      const leftFileStart =
        updatedThread.threadContext &&
        'leftFileStart' in updatedThread.threadContext
          ? updatedThread.threadContext.leftFileStart
          : undefined;
      const leftFileEnd =
        updatedThread.threadContext &&
        'leftFileEnd' in updatedThread.threadContext
          ? updatedThread.threadContext.leftFileEnd
          : undefined;
      const rightFileStart =
        updatedThread.threadContext &&
        'rightFileStart' in updatedThread.threadContext
          ? updatedThread.threadContext.rightFileStart
          : undefined;
      const rightFileEnd =
        updatedThread.threadContext &&
        'rightFileEnd' in updatedThread.threadContext
          ? updatedThread.threadContext.rightFileEnd
          : undefined;

      return {
        ...comment,
        filePath,
        leftFileStart,
        leftFileEnd,
        rightFileStart,
        rightFileEnd,
        commentType: transformCommentType(comment.commentType),
      };
    });

    return {
      thread: {
        ...updatedThread,
        status: transformCommentThreadStatus(updatedThread.status),
        comments: transformedComments,
      },
    };
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to update pull request thread status: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
