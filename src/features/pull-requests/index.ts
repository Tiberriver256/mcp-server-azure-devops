export * from './schemas';
export * from './types';
export { createPullRequest } from './create-pull-request/feature';
export { getPullRequest } from './get-pull-request/feature';
export { listPullRequests } from './list-pull-requests/feature';
export { getPullRequestComments } from './get-pull-request-comments/feature';
export { addPullRequestComment } from './add-pull-request-comment/feature';
export { updatePullRequest } from './update-pull-request/feature';
export { getPullRequestChanges } from './get-pull-request-changes/feature';
export {
  getPullRequestChecks,
  parseNumeric,
} from './get-pull-request-checks/feature';
export { updatePullRequestThreadStatus } from './update-pull-request-thread-status/feature';
export { mergePullRequest } from './merge-pull-request/feature';

import { defineTool } from '../../shared/registry/tool-registry';
import type { FeatureModule } from '../../shared/registry/tool-registry';
import {
  AddPullRequestCommentSchema,
  CreatePullRequestSchema,
  GetPullRequestChangesSchema,
  GetPullRequestChecksSchema,
  GetPullRequestCommentsSchema,
  GetPullRequestSchema,
  ListPullRequestsSchema,
  MergePullRequestSchema,
  UpdatePullRequestSchema,
  UpdatePullRequestThreadStatusSchema,
} from './schemas';
import { createPullRequest } from './create-pull-request/feature';
import { getPullRequest } from './get-pull-request/feature';
import { listPullRequests } from './list-pull-requests/feature';
import { getPullRequestComments } from './get-pull-request-comments/feature';
import { addPullRequestComment } from './add-pull-request-comment/feature';
import { updatePullRequest } from './update-pull-request/feature';
import { getPullRequestChanges } from './get-pull-request-changes/feature';
import { getPullRequestChecks } from './get-pull-request-checks/feature';
import { updatePullRequestThreadStatus } from './update-pull-request-thread-status/feature';
import { mergePullRequest } from './merge-pull-request/feature';

export const pullRequestsFeature: FeatureModule = {
  toolset: 'pull-requests',
  tools: [
    defineTool({
      name: 'create_pull_request',
      description:
        'Create a new pull request, including reviewers, linked work items, and optional tags',
      schema: CreatePullRequestSchema,
      readOnly: false,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        return await createPullRequest(
          connection,
          ctx.resolveProjectId(args.projectId),
          args.repositoryId,
          args,
        );
      },
    }),
    defineTool({
      name: 'get_pull_request',
      description:
        'Get a pull request by ID (no repositoryId required; best for Azure DevOps Server where PR IDs are project-scoped)',
      schema: GetPullRequestSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        return await getPullRequest(connection, {
          projectId: args.projectId,
          pullRequestId: args.pullRequestId,
        });
      },
    }),
    defineTool({
      name: 'list_pull_requests',
      description: 'List pull requests in a repository',
      schema: ListPullRequestsSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        const projectId = ctx.resolveProjectId(args.projectId);
        return await listPullRequests(
          connection,
          projectId,
          args.repositoryId,
          {
            projectId,
            repositoryId: args.repositoryId,
            status: args.status,
            creatorId: args.creatorId,
            reviewerId: args.reviewerId,
            sourceRefName: args.sourceRefName,
            targetRefName: args.targetRefName,
            top: args.top,
            skip: args.skip,
          },
        );
      },
    }),
    defineTool({
      name: 'get_pull_request_comments',
      description: 'Get comments from a specific pull request',
      schema: GetPullRequestCommentsSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        const projectId = ctx.resolveProjectId(args.projectId);
        return await getPullRequestComments(
          connection,
          projectId,
          args.repositoryId,
          args.pullRequestId,
          {
            projectId,
            repositoryId: args.repositoryId,
            pullRequestId: args.pullRequestId,
            threadId: args.threadId,
            includeDeleted: args.includeDeleted,
            top: args.top,
          },
        );
      },
    }),
    defineTool({
      name: 'add_pull_request_comment',
      description:
        'Add a comment to a pull request (repositoryId optional; derived from pullRequestId when omitted)',
      schema: AddPullRequestCommentSchema,
      readOnly: false,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        const projectId = ctx.resolveProjectId(args.projectId);
        return await addPullRequestComment(
          connection,
          projectId,
          args.repositoryId,
          args.pullRequestId,
          {
            projectId,
            repositoryId: args.repositoryId,
            pullRequestId: args.pullRequestId,
            content: args.content,
            threadId: args.threadId,
            parentCommentId: args.parentCommentId,
            filePath: args.filePath,
            lineNumber: args.lineNumber,
            endLineNumber: args.endLineNumber,
            status: args.status,
          },
        );
      },
    }),
    defineTool({
      name: 'update_pull_request',
      description:
        'Update an existing pull request with new properties, manage reviewers and work items, and add or remove tags',
      schema: UpdatePullRequestSchema,
      readOnly: false,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        return await updatePullRequest(
          {
            ...args,
            projectId: ctx.resolveProjectId(args.projectId),
          },
          connection,
        );
      },
    }),
    defineTool({
      name: 'get_pull_request_changes',
      description:
        'Get the files changed in a pull request, their unified diffs, source/target branch names, and the status of policy evaluations',
      schema: GetPullRequestChangesSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        return await getPullRequestChanges(connection, {
          projectId: ctx.resolveProjectId(args.projectId),
          repositoryId: args.repositoryId,
          pullRequestId: args.pullRequestId,
        });
      },
    }),
    defineTool({
      name: 'get_pull_request_checks',
      description: [
        'Summarize the latest status checks and policy evaluations for a pull request.',
        '- Surfaces pipeline and run identifiers so you can jump straight to the blocking validation.',
        '- Pair with pipeline tools (e.g., get_pipeline_run, pipeline_timeline) to inspect failures in depth.',
      ].join('\n'),
      schema: GetPullRequestChecksSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        return await getPullRequestChecks(connection, {
          projectId: ctx.resolveProjectId(args.projectId),
          repositoryId: args.repositoryId,
          pullRequestId: args.pullRequestId,
        });
      },
    }),
    defineTool({
      name: 'update_pull_request_thread_status',
      description:
        'Update the status of a comment thread in a pull request (repositoryId optional; derived from pullRequestId when omitted)',
      schema: UpdatePullRequestThreadStatusSchema,
      readOnly: false,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        return await updatePullRequestThreadStatus(
          connection,
          ctx.resolveProjectId(args.projectId),
          args.repositoryId,
          args.pullRequestId,
          args.threadId,
          args,
        );
      },
    }),
    defineTool({
      name: 'merge_pull_request',
      description:
        'Complete (merge) an active pull request immediately or enable/cancel auto-complete with merge strategy, source branch deletion, work item transitions, and policy bypass options (repositoryId optional; derived from pullRequestId when omitted; works on both Azure DevOps Services and Azure DevOps Server)',
      schema: MergePullRequestSchema,
      readOnly: false,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi();
        return await mergePullRequest(connection, {
          ...args,
          projectId: ctx.resolveOptionalProjectId(args.projectId),
        });
      },
    }),
  ],
};
