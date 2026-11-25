import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import {
  ItemContentType,
  VersionControlChangeType,
} from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import { getPullRequestComments } from './feature.ts';
import { addPullRequestComment } from '../add-pull-request-comment/feature.ts';
import { createPullRequest } from '../create-pull-request/feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'getPullRequestComments integration',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    let connection: WebApi;
    let projectName: string;
    let repositoryId: string;
    let defaultBranchRef: string;
    let pullRequestId: number;
    let testThreadId: number;

    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 1000);
    const uniqueBranchName = `comments-fetch-branch-${timestamp}-${randomSuffix}`;

    before(async () => {
      projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || '';
      if (!projectName) {
        throw new Error(
          'AZURE_DEVOPS_DEFAULT_PROJECT must be set for this test',
        );
      }

      const testConnection = await getTestConnection();
      if (!testConnection) {
        throw new Error(
          'Connection should be available when integration tests are enabled',
        );
      }
      connection = testConnection;

      const gitApi = await connection.getGitApi();

      repositoryId = process.env.AZURE_DEVOPS_DEFAULT_REPOSITORY || '';
      if (!repositoryId) {
        const repos = await gitApi.getRepositories(projectName);
        if (!repos || repos.length === 0 || !repos[0].id) {
          throw new Error(
            'No repositories found. Set AZURE_DEVOPS_DEFAULT_REPOSITORY to run pull request integration tests.',
          );
        }
        repositoryId = repos[0].id;
      }

      const repository = await gitApi.getRepository(repositoryId, projectName);
      defaultBranchRef = repository.defaultBranch || 'refs/heads/main';

      const defaultBranchName = defaultBranchRef.replace('refs/heads/', '');
      const commits = await gitApi.getCommits(
        repositoryId,
        {
          $top: 1,
          itemVersion: {
            version: defaultBranchName,
            versionType: 0,
          },
        },
        projectName,
      );

      if (!commits || commits.length === 0 || !commits[0].commitId) {
        throw new Error('No commits found in repository');
      }

      const baseCommitId = commits[0].commitId;

      // Create the branch
      const refUpdate = {
        name: `refs/heads/${uniqueBranchName}`,
        oldObjectId: '0000000000000000000000000000000000000000',
        newObjectId: baseCommitId,
      };

      const updateResult = await gitApi.updateRefs(
        [refUpdate],
        repositoryId,
        projectName,
      );

      if (
        !updateResult ||
        updateResult.length === 0 ||
        !updateResult[0].success
      ) {
        throw new Error('Failed to create new branch');
      }

      // Add a commit so the PR has a diff
      await gitApi.createPush(
        {
          refUpdates: [
            {
              name: `refs/heads/${uniqueBranchName}`,
              oldObjectId: baseCommitId,
            },
          ],
          commits: [
            {
              comment: 'Add file for PR comment fetch integration tests',
              changes: [
                {
                  changeType: VersionControlChangeType.Add,
                  item: { path: `/mcp-pr-comments-fetch-${timestamp}.md` },
                  newContent: {
                    content: `# PR comment fetch test\n\n${new Date().toISOString()}\n`,
                    contentType: ItemContentType.RawText,
                  },
                },
              ],
            },
          ],
        },
        repositoryId,
        projectName,
      );

      const pr = await createPullRequest(
        connection,
        projectName,
        repositoryId,
        {
          title: `PR comment fetch test ${timestamp}-${randomSuffix}`,
          description:
            'PR created for get-pull-request-comments integration tests',
          sourceRefName: `refs/heads/${uniqueBranchName}`,
          targetRefName: defaultBranchRef,
          isDraft: true,
        },
      );

      pullRequestId = pr.pullRequestId!;

      const thread = await addPullRequestComment(
        connection,
        projectName,
        repositoryId,
        pullRequestId,
        {
          projectId: projectName,
          repositoryId,
          pullRequestId,
          content: `Test comment thread ${timestamp}-${randomSuffix}`,
          status: 'active',
        },
      );

      testThreadId = thread.thread!.id!;
    });

    after(async () => {
      if (!connection || !repositoryId || !projectName) {
        return;
      }

      const gitApi = await connection.getGitApi();

      if (pullRequestId) {
        try {
          await gitApi.updatePullRequest(
            {
              status: 2,
            },
            repositoryId,
            pullRequestId,
            projectName,
          );
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_) {
          // ignore cleanup errors
        }
      }

      // Best-effort: delete the temporary branch
      try {
        const refs = await gitApi.getRefs(
          repositoryId,
          projectName,
          `heads/${uniqueBranchName}`,
        );
        const branchObjectId = refs?.[0]?.objectId;
        if (branchObjectId) {
          await gitApi.updateRefs(
            [
              {
                name: `refs/heads/${uniqueBranchName}`,
                oldObjectId: branchObjectId,
                newObjectId: '0000000000000000000000000000000000000000',
              },
            ],
            repositoryId,
            projectName,
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_) {
        // ignore cleanup errors
      }
    });

    void test(
      'should get all comment threads from pull request with file path and line number',
      { timeout: 30000 },
      async () => {
        const threads = await getPullRequestComments(
          connection,
          projectName,
          repositoryId,
          pullRequestId,
          {
            projectId: projectName,
            repositoryId,
            pullRequestId,
          },
        );

        assert.notStrictEqual(threads, undefined);
        assert.strictEqual(Array.isArray(threads), true);
        assert.ok(threads.length > 0);

        const firstThread = threads[0];
        assert.notStrictEqual(firstThread.id, undefined);
        assert.notStrictEqual(firstThread.comments, undefined);
        assert.strictEqual(Array.isArray(firstThread.comments), true);
        assert.ok(firstThread.comments!.length > 0);

        const firstComment = firstThread.comments![0];
        assert.notStrictEqual(firstComment.content, undefined);
        assert.notStrictEqual(firstComment.id, undefined);
        assert.notStrictEqual(firstComment.publishedDate, undefined);
        assert.notStrictEqual(firstComment.author, undefined);

        // Fields may be undefined depending on comment type, but should exist
        assert.ok(Object.hasOwn(firstComment, 'filePath'));
        assert.ok(Object.hasOwn(firstComment, 'rightFileStart'));
        assert.ok(Object.hasOwn(firstComment, 'rightFileEnd'));
        assert.ok(Object.hasOwn(firstComment, 'leftFileStart'));
        assert.ok(Object.hasOwn(firstComment, 'leftFileEnd'));
      },
    );

    void test(
      'should get a specific comment thread by ID with file path and line number',
      { timeout: 30000 },
      async () => {
        const threads = await getPullRequestComments(
          connection,
          projectName,
          repositoryId,
          pullRequestId,
          {
            projectId: projectName,
            repositoryId,
            pullRequestId,
            threadId: testThreadId,
          },
        );

        assert.notStrictEqual(threads, undefined);
        assert.strictEqual(Array.isArray(threads), true);
        assert.strictEqual(threads.length, 1);

        const thread = threads[0];
        assert.strictEqual(thread.id, testThreadId);
        assert.notStrictEqual(thread.comments, undefined);
        assert.strictEqual(Array.isArray(thread.comments), true);
        assert.ok(thread.comments!.length > 0);

        const comment = thread.comments![0];
        assert.strictEqual(
          comment.content,
          `Test comment thread ${timestamp}-${randomSuffix}`,
        );

        assert.ok(Object.hasOwn(comment, 'filePath'));
        assert.ok(Object.hasOwn(comment, 'rightFileStart'));
        assert.ok(Object.hasOwn(comment, 'rightFileEnd'));
        assert.ok(Object.hasOwn(comment, 'leftFileStart'));
        assert.ok(Object.hasOwn(comment, 'leftFileEnd'));
      },
    );

    void test(
      'should handle pagination with top parameter',
      { timeout: 30000 },
      async () => {
        const allThreads = await getPullRequestComments(
          connection,
          projectName,
          repositoryId,
          pullRequestId,
          {
            projectId: projectName,
            repositoryId,
            pullRequestId,
          },
        );

        const paginatedThreads = await getPullRequestComments(
          connection,
          projectName,
          repositoryId,
          pullRequestId,
          {
            projectId: projectName,
            repositoryId,
            pullRequestId,
            top: 1,
          },
        );

        assert.notStrictEqual(paginatedThreads, undefined);
        assert.strictEqual(Array.isArray(paginatedThreads), true);
        assert.strictEqual(paginatedThreads.length, 1);
        assert.ok(paginatedThreads.length <= allThreads.length);

        const thread = paginatedThreads[0];
        assert.notStrictEqual(thread.id, undefined);
        assert.notStrictEqual(thread.comments, undefined);
        assert.strictEqual(Array.isArray(thread.comments), true);
        assert.ok(thread.comments!.length > 0);

        const comment = thread.comments![0];
        assert.ok(Object.hasOwn(comment, 'filePath'));
        assert.ok(Object.hasOwn(comment, 'rightFileStart'));
        assert.ok(Object.hasOwn(comment, 'rightFileEnd'));
        assert.ok(Object.hasOwn(comment, 'leftFileStart'));
        assert.ok(Object.hasOwn(comment, 'leftFileEnd'));
      },
    );
  },
);
