import { WebApi } from 'azure-devops-node-api';
import { AzureDevOpsError } from '../../../shared/errors';
import {
  GetPullRequestCommentsOptions,
  CommentThreadWithStringEnums,
} from '../types';
import { GitPullRequestCommentThread } from 'azure-devops-node-api/interfaces/GitInterfaces';
import {
  transformCommentThreadStatus,
  transformCommentType,
} from '../../../shared/enums';

/**
 * Get comments from a pull request
 *
 * @param connection The Azure DevOps WebApi connection
 * @param projectId The ID or name of the project
 * @param repositoryId The ID or name of the repository
 * @param pullRequestId The ID of the pull request
 * @param options Options for filtering comments
 * @returns Array of comment threads with their comments
 */
export async function getPullRequestComments(
  connection: WebApi,
  projectId: string,
  repositoryId: string,
  pullRequestId: number,
  options: GetPullRequestCommentsOptions,
): Promise<CommentThreadWithStringEnums[]> {
  try {
    const gitApi = await connection.getGitApi();

    if (options.threadId) {
      // If a specific thread is requested, only return that thread
      const thread = await gitApi.getPullRequestThread(
        repositoryId,
        pullRequestId,
        options.threadId,
        projectId,
      );
      return thread ? [transformThread(thread)] : [];
    } else {
      // Otherwise, get all threads
      const threads = await gitApi.getThreads(
        repositoryId,
        pullRequestId,
        projectId,
        undefined, // iteration
        options.includeDeleted ? 1 : undefined, // Convert boolean to number (1 = include deleted)
      );

      // Transform and return all threads (with pagination if top is specified)
      const transformedThreads = (threads || []).map(transformThread);
      if (options.top) {
        return transformedThreads.slice(0, options.top);
      }
      return transformedThreads;
    }
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to get pull request comments: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Transform a comment thread to include filePath and lineNumber fields
 * @param thread The original comment thread
 * @returns Transformed comment thread with additional fields
 */
function transformThread(
  thread: GitPullRequestCommentThread,
): CommentThreadWithStringEnums {
  if (!thread.comments) {
    return {
      ...thread,
      status: transformCommentThreadStatus(thread.status),
      comments: undefined,
    };
  }

  // Get file path and positions from thread context
  const filePath = thread.threadContext?.filePath;
  const leftFileStart =
    thread.threadContext && 'leftFileStart' in thread.threadContext
      ? thread.threadContext.leftFileStart
      : undefined;
  const leftFileEnd =
    thread.threadContext && 'leftFileEnd' in thread.threadContext
      ? thread.threadContext.leftFileEnd
      : undefined;
  const rightFileStart =
    thread.threadContext && 'rightFileStart' in thread.threadContext
      ? thread.threadContext.rightFileStart
      : undefined;
  const rightFileEnd =
    thread.threadContext && 'rightFileEnd' in thread.threadContext
      ? thread.threadContext.rightFileEnd
      : undefined;

  // Transform each comment to include the new fields and string enums
  const transformedComments = thread.comments.map((comment) => ({
    ...comment,
    filePath,
    leftFileStart,
    leftFileEnd,
    rightFileStart,
    rightFileEnd,
    // Transform enum values to strings
    commentType: transformCommentType(comment.commentType),
  }));

  return {
    ...thread,
    comments: transformedComments,
    // Transform thread status to string
    status: transformCommentThreadStatus(thread.status),
  };
}
