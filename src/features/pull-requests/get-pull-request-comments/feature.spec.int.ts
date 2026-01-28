import { WebApi } from 'azure-devops-node-api';
import {
  ItemContentType,
  VersionControlChangeType,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { getPullRequestComments } from './feature';
import { addPullRequestComment } from '../add-pull-request-comment/feature';
import { createPullRequest } from '../create-pull-request/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('getPullRequestComments integration', () => {
  let connection: WebApi;
  let projectName: string;
  let repositoryId: string;
  let defaultBranchRef: string;
  let pullRequestId: number;
  let testThreadId: number;

  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 1000);
  const uniqueBranchName = `comments-fetch-branch-${timestamp}-${randomSuffix}`;

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

    const pr = await createPullRequest(connection, projectName, repositoryId, {
      title: `PR comment fetch test ${timestamp}-${randomSuffix}`,
      description: 'PR created for get-pull-request-comments integration tests',
      sourceRefName: `refs/heads/${uniqueBranchName}`,
      targetRefName: defaultBranchRef,
      isDraft: true,
    });

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

  test('should get all comment threads from pull request with file path and line number', async () => {
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

    expect(threads).toBeDefined();
    expect(Array.isArray(threads)).toBe(true);
    expect(threads.length).toBeGreaterThan(0);

    const firstThread = threads[0];
    expect(firstThread.id).toBeDefined();
    expect(firstThread.comments).toBeDefined();
    expect(Array.isArray(firstThread.comments)).toBe(true);
    expect(firstThread.comments!.length).toBeGreaterThan(0);

    const firstComment = firstThread.comments![0];
    expect(firstComment.content).toBeDefined();
    expect(firstComment.id).toBeDefined();
    expect(firstComment.publishedDate).toBeDefined();
    expect(firstComment.author).toBeDefined();

    // Fields may be undefined depending on comment type, but should exist
    expect(firstComment).toHaveProperty('filePath');
    expect(firstComment).toHaveProperty('rightFileStart');
    expect(firstComment).toHaveProperty('rightFileEnd');
    expect(firstComment).toHaveProperty('leftFileStart');
    expect(firstComment).toHaveProperty('leftFileEnd');
  }, 30000);

  test('should get a specific comment thread by ID with file path and line number', async () => {
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

    expect(threads).toBeDefined();
    expect(Array.isArray(threads)).toBe(true);
    expect(threads.length).toBe(1);

    const thread = threads[0];
    expect(thread.id).toBe(testThreadId);
    expect(thread.comments).toBeDefined();
    expect(Array.isArray(thread.comments)).toBe(true);
    expect(thread.comments!.length).toBeGreaterThan(0);

    const comment = thread.comments![0];
    expect(comment.content).toBe(
      `Test comment thread ${timestamp}-${randomSuffix}`,
    );

    expect(comment).toHaveProperty('filePath');
    expect(comment).toHaveProperty('rightFileStart');
    expect(comment).toHaveProperty('rightFileEnd');
    expect(comment).toHaveProperty('leftFileStart');
    expect(comment).toHaveProperty('leftFileEnd');
  }, 30000);

  test('should handle pagination with top parameter', async () => {
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

    expect(paginatedThreads).toBeDefined();
    expect(Array.isArray(paginatedThreads)).toBe(true);
    expect(paginatedThreads.length).toBe(1);
    expect(paginatedThreads.length).toBeLessThanOrEqual(allThreads.length);

    const thread = paginatedThreads[0];
    expect(thread.id).toBeDefined();
    expect(thread.comments).toBeDefined();
    expect(Array.isArray(thread.comments)).toBe(true);
    expect(thread.comments!.length).toBeGreaterThan(0);

    const comment = thread.comments![0];
    expect(comment).toHaveProperty('filePath');
    expect(comment).toHaveProperty('rightFileStart');
    expect(comment).toHaveProperty('rightFileEnd');
    expect(comment).toHaveProperty('leftFileStart');
    expect(comment).toHaveProperty('leftFileEnd');
  }, 30000);
});
