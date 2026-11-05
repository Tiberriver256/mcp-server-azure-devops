import { WebApi } from 'azure-devops-node-api';
import {
  Comment,
  CommentThreadStatus,
  CommentType,
  GitPullRequest,
  GitPullRequestCommentThread,
  GitVersionType,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { IGitApi } from 'azure-devops-node-api/GitApi';
import { AzureDevOpsError } from '../../../shared/errors';
import { AddPullRequestCommentOptions, AddCommentResponse } from '../types';
import {
  transformCommentThreadStatus,
  transformCommentType,
} from '../../../shared/enums';

/**
 * Get the length of a line of a file at the source commit of a pull request.
 *
 * A thread anchors on a character range. Ending it at the end of the line, as the web UI does
 * when a line is selected, lets the "Apply change" button of a suggestion replace the line
 * instead of inserting the suggestion in front of it.
 *
 * @param pullRequest The pull request if it was already fetched, to avoid fetching it again
 * @returns The length of the line, or undefined if the file or line cannot be read
 */
async function getLineLength(
  gitApi: IGitApi,
  repositoryId: string,
  pullRequestId: number,
  project: string | undefined,
  filePath: string,
  lineNumber: number,
  pullRequest?: GitPullRequest,
): Promise<number | undefined> {
  try {
    const pr =
      pullRequest ?? (await gitApi.getPullRequestById(pullRequestId, project));
    const commitId = pr?.lastMergeSourceCommit?.commitId;
    if (!commitId) {
      return undefined;
    }

    const item = await gitApi.getItem(
      repositoryId,
      filePath,
      project,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { version: commitId, versionType: GitVersionType.Commit },
      true,
    );

    // A byte order mark is not part of the first line
    const content = item?.content?.replace(/^\uFEFF/, '');
    const line = content?.split(/\r?\n/)[lineNumber - 1];
    return line === undefined ? undefined : line.length;
  } catch {
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

    let pullRequest: GitPullRequest | undefined;
    let resolvedRepositoryId = repositoryId;
    if (!resolvedRepositoryId) {
      pullRequest = await gitApi.getPullRequestById(pullRequestId, project);
      resolvedRepositoryId = pullRequest?.repository?.id;
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

      return {
        comment: {
          ...createdComment,
          commentType: transformCommentType(createdComment.commentType),
        },
      };
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
          case 'byDesign':
            threadStatus = CommentThreadStatus.ByDesign;
            break;
          case 'unknown':
            threadStatus = CommentThreadStatus.Unknown;
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
        thread.threadContext = { filePath: options.filePath };

        // Only add line information if provided
        if (options.lineNumber) {
          const endLineNumber = options.endLineNumber ?? options.lineNumber;
          const endLineLength = await getLineLength(
            gitApi,
            resolvedRepositoryId,
            pullRequestId,
            project,
            options.filePath,
            endLineNumber,
            pullRequest,
          );

          thread.threadContext.rightFileStart = {
            line: options.lineNumber,
            offset: 1,
          };
          // If the length of the end line cannot be determined, fall back to a single-line anchor
          // at the start of lineNumber. Ending the range at the start of endLineNumber instead
          // would make "Apply change" keep that line in place.
          thread.threadContext.rightFileEnd =
            endLineLength === undefined
              ? { line: options.lineNumber, offset: 1 }
              : { line: endLineNumber, offset: endLineLength + 1 };
        }
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
