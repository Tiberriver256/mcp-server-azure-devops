import { WebApi } from 'azure-devops-node-api';
import {
  Comment,
  CommentThreadStatus,
  CommentType,
  GitPullRequestCommentThread,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzureDevOpsError } from '../../../shared/errors';
import { AddPullRequestCommentOptions } from '../types';

/**
 * Add a comment to a pull request
 *
 * @param connection The Azure DevOps WebApi connection
 * @param projectId The ID or name of the project
 * @param repositoryId The ID or name of the repository
 * @param pullRequestId The ID of the pull request
 * @param options Options for adding the comment
 * @returns The created comment or thread
 */
export async function addPullRequestComment(
  connection: WebApi,
  projectId: string,
  repositoryId: string,
  pullRequestId: number,
  options: AddPullRequestCommentOptions,
): Promise<{ comment: Comment; thread?: GitPullRequestCommentThread }> {
  try {
    const gitApi = await connection.getGitApi();

    // Create comment object
    const comment: Comment = {
      content: options.content,
      commentType: CommentType.Text, // Default to Text type
      parentCommentId: options.parentCommentId,
    };

    // Case 1: Add comment to an existing thread
    if (options.threadId) {
      const createdComment = await gitApi.createComment(
        comment,
        repositoryId,
        pullRequestId,
        options.threadId,
        projectId,
      );

      if (!createdComment) {
        throw new Error('Failed to create pull request comment');
      }

      return { comment: createdComment };
    }
    // Case 2: Create new thread with comment
    else {
      // Map status string to CommentThreadStatus enum
      let threadStatus: CommentThreadStatus | undefined;
      if (options.status) {
        switch (options.status) {
          case 'active':
            threadStatus = CommentThreadStatus.Active;
            break;
          case 'fixed':
            threadStatus = CommentThreadStatus.Fixed;
            break;
          case 'wontFix':
            threadStatus = CommentThreadStatus.WontFix;
            break;
          case 'closed':
            threadStatus = CommentThreadStatus.Closed;
            break;
          case 'pending':
            threadStatus = CommentThreadStatus.Pending;
            break;
        }
      }

      // Create thread with comment
      const thread: GitPullRequestCommentThread = {
        comments: [comment],
        status: threadStatus,
      };

      // Add file context if specified (file comment)
      if (options.filePath) {
        thread.threadContext = {
          filePath: options.filePath,
          // Only add line information if provided
          rightFileStart: options.lineNumber
            ? {
                line: options.lineNumber,
                offset: 1, // Default to start of line
              }
            : undefined,
          rightFileEnd: options.lineNumber
            ? {
                line: options.lineNumber,
                offset: 1, // Default to start of line
              }
            : undefined,
        };
      }

      const createdThread = await gitApi.createThread(
        thread,
        repositoryId,
        pullRequestId,
        projectId,
      );

      if (
        !createdThread ||
        !createdThread.comments ||
        createdThread.comments.length === 0
      ) {
        throw new Error('Failed to create pull request comment thread');
      }

      return {
        comment: createdThread.comments[0],
        thread: createdThread,
      };
    }
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to add pull request comment: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
