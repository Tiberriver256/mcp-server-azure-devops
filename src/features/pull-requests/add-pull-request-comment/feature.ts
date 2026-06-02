import { WebApi } from 'azure-devops-node-api';
import {
  Comment,
  CommentThreadStatus,
  CommentType,
  GitPullRequestCommentThread,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzureDevOpsError } from '../../../shared/errors';
import { AddPullRequestCommentOptions, AddCommentResponse } from '../types';
import {
  transformCommentThreadStatus,
  transformCommentType,
} from '../../../shared/enums';

function parseThreadStatus(
  status: string | undefined,
): CommentThreadStatus | undefined {
  switch (status) {
    case 'active':
      return CommentThreadStatus.Active;
    case 'fixed':
      return CommentThreadStatus.Fixed;
    case 'wontFix':
      return CommentThreadStatus.WontFix;
    case 'closed':
      return CommentThreadStatus.Closed;
    case 'pending':
      return CommentThreadStatus.Pending;
    case 'byDesign':
      return CommentThreadStatus.ByDesign;
    case 'unknown':
      return CommentThreadStatus.Unknown;
    default:
      return undefined;
  }
}

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
  projectId: string | undefined,
  repositoryId: string | undefined,
  pullRequestId: number,
  options: AddPullRequestCommentOptions,
): Promise<AddCommentResponse> {
  try {
    const gitApi = await connection.getGitApi();
    const project = projectId || undefined;

    let resolvedRepositoryId = repositoryId;
    if (!resolvedRepositoryId) {
      const pr = await gitApi.getPullRequestById(pullRequestId, project);
      resolvedRepositoryId = pr?.repository?.id;
    }

    if (!resolvedRepositoryId) {
      throw new Error(
        'repositoryId is required (or must be derivable from pullRequestId)',
      );
    }

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
        resolvedRepositoryId,
        pullRequestId,
        options.threadId,
        project,
      );

      if (!createdComment) {
        throw new Error('Failed to create pull request comment');
      }

      // Also update the thread status if one was specified
      let updatedThread: GitPullRequestCommentThread | undefined;
      if (options.status) {
        const threadStatus = parseThreadStatus(options.status);

        if (threadStatus !== undefined) {
          updatedThread = await gitApi.updateThread(
            { status: threadStatus },
            resolvedRepositoryId,
            pullRequestId,
            options.threadId,
            project,
          );
        }
      }

      return {
        comment: {
          ...createdComment,
          commentType: transformCommentType(createdComment.commentType),
        },
        ...(updatedThread && {
          thread: {
            ...updatedThread,
            status: transformCommentThreadStatus(updatedThread.status),
            comments: updatedThread.comments?.map((c) => ({
              ...c,
              commentType: transformCommentType(c.commentType),
            })),
          },
        }),
      };
    }
    // Case 2: Create new thread with comment
    else {
      // Map status string to CommentThreadStatus enum
      const threadStatus = parseThreadStatus(options.status);

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
        resolvedRepositoryId,
        pullRequestId,
        project,
      );

      if (
        !createdThread ||
        !createdThread.comments ||
        createdThread.comments.length === 0
      ) {
        throw new Error('Failed to create pull request comment thread');
      }

      return {
        comment: {
          ...createdThread.comments[0],
          commentType: transformCommentType(
            createdThread.comments[0].commentType,
          ),
        },
        thread: {
          ...createdThread,
          status: transformCommentThreadStatus(createdThread.status),
          comments: createdThread.comments?.map((comment) => ({
            ...comment,
            commentType: transformCommentType(comment.commentType),
          })),
        },
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
