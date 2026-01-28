import { WebApi } from 'azure-devops-node-api';
import {
  ItemContentType,
  VersionControlChangeType,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { addPullRequestComment } from './feature';
import { createPullRequest } from '../create-pull-request/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('addPullRequestComment integration', () => {
  let connection: WebApi;
  let projectName: string;
  let repositoryId: string;
  let defaultBranchRef: string;
  let pullRequestId: number;
  let changedFilePath: string;

  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 1000);
  const uniqueBranchName = `comment-test-branch-${timestamp}-${randomSuffix}`;

  beforeAll(async () => {
    projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || '';
    if (!projectName) {
      throw new Error('AZURE_DEVOPS_DEFAULT_PROJECT must be set for this test');
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

    const pr = await createPullRequest(connection, projectName, repositoryId, {
      title: `PR comments test ${timestamp}-${randomSuffix}`,
      description: 'PR created for comment integration tests',
      sourceRefName: `refs/heads/${uniqueBranchName}`,
      targetRefName: defaultBranchRef,
      isDraft: true,
    });

    pullRequestId = pr.pullRequestId!;
  });

  afterAll(async () => {
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

  test('should add a new comment thread to pull request', async () => {
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

    expect(result.comment).toBeDefined();
    expect(result.comment.content).toBe(commentContent);
    expect(result.thread).toBeDefined();
    expect(result.thread!.status).toBe('active');
  }, 30000);

  test('should add a file comment to pull request', async () => {
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

    expect(result.comment).toBeDefined();
    expect(result.comment.content).toBe(commentContent);
    expect(result.thread).toBeDefined();
    expect(result.thread!.threadContext).toBeDefined();
    expect(result.thread!.threadContext!.filePath).toBe(changedFilePath);
    expect(result.thread!.threadContext!.rightFileStart!.line).toBe(lineNumber);
  }, 30000);

  test('should add a reply to an existing comment thread', async () => {
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

    expect(result.comment).toBeDefined();
    expect(result.comment.content).toBe(replyContent);
    expect(result.thread).toBeUndefined();
  }, 30000);
});
