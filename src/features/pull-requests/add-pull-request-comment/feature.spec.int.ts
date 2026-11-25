import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import {
  ItemContentType,
  VersionControlChangeType,
} from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import { addPullRequestComment } from './feature.ts';
import { createPullRequest } from '../create-pull-request/feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'addPullRequestComment integration',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    let connection: WebApi;
    let projectName: string;
    let repositoryId: string;
    let defaultBranchRef: string;
    let pullRequestId: number;
    let changedFilePath: string;

    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 1000);
    const uniqueBranchName = `comment-test-branch-${timestamp}-${randomSuffix}`;

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

      // Find the latest commit on the default branch
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

      // Add a commit that introduces a new file so we can comment on it
      changedFilePath = `/mcp-pr-comment-test-${timestamp}.md`;

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
              comment: 'Add file for PR comment integration tests',
              changes: [
                {
                  changeType: VersionControlChangeType.Add,
                  item: { path: changedFilePath },
                  newContent: {
                    content: `# Test File\n\nCreated at ${new Date().toISOString()}\n`,
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
          title: `PR comments test ${timestamp}-${randomSuffix}`,
          description: 'PR created for comment integration tests',
          sourceRefName: `refs/heads/${uniqueBranchName}`,
          targetRefName: defaultBranchRef,
          isDraft: true,
        },
      );

      pullRequestId = pr.pullRequestId!;
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
      'should add a new comment thread to pull request',
      { timeout: 30000 },
      async () => {
        const commentContent = `Test comment ${timestamp}-${randomSuffix}`;

        const result = await addPullRequestComment(
          connection,
          projectName,
          repositoryId,
          pullRequestId,
          {
            projectId: projectName,
            repositoryId,
            pullRequestId,
            content: commentContent,
            status: 'active',
          },
        );

        assert.notStrictEqual(result.comment, undefined);
        assert.strictEqual(result.comment.content, commentContent);
        assert.notStrictEqual(result.thread, undefined);
        assert.strictEqual(result.thread!.status, 'active');
      },
    );

    void test(
      'should add a file comment to pull request',
      { timeout: 30000 },
      async () => {
        const commentContent = `File comment ${timestamp}-${randomSuffix}`;
        const lineNumber = 1;

        const result = await addPullRequestComment(
          connection,
          projectName,
          repositoryId,
          pullRequestId,
          {
            projectId: projectName,
            repositoryId,
            pullRequestId,
            content: commentContent,
            filePath: changedFilePath,
            lineNumber,
            status: 'active',
          },
        );

        assert.notStrictEqual(result.comment, undefined);
        assert.strictEqual(result.comment.content, commentContent);
        assert.notStrictEqual(result.thread, undefined);
        assert.notStrictEqual(result.thread!.threadContext, undefined);
        assert.strictEqual(
          result.thread!.threadContext!.filePath,
          changedFilePath,
        );
        assert.strictEqual(
          result.thread!.threadContext!.rightFileStart!.line,
          lineNumber,
        );
      },
    );

    void test(
      'should add a reply to an existing comment thread',
      { timeout: 30000 },
      async () => {
        const initialComment = await addPullRequestComment(
          connection,
          projectName,
          repositoryId,
          pullRequestId,
          {
            projectId: projectName,
            repositoryId,
            pullRequestId,
            content: `Initial comment ${timestamp}-${randomSuffix}`,
            status: 'active',
          },
        );

        const threadId = initialComment.thread!.id!;
        const replyContent = `Reply comment ${timestamp}-${randomSuffix}`;

        const result = await addPullRequestComment(
          connection,
          projectName,
          repositoryId,
          pullRequestId,
          {
            projectId: projectName,
            repositoryId,
            pullRequestId,
            content: replyContent,
            threadId,
          },
        );

        assert.notStrictEqual(result.comment, undefined);
        assert.strictEqual(result.comment.content, replyContent);
        assert.strictEqual(result.thread, undefined);
      },
    );
  },
);
