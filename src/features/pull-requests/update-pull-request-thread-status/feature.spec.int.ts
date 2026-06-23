import { WebApi } from 'azure-devops-node-api';
import {
  ItemContentType,
  VersionControlChangeType,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { updatePullRequestThreadStatus } from './feature';
import { addPullRequestComment } from '../add-pull-request-comment/feature';
import { createPullRequest } from '../create-pull-request/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('updatePullRequestThreadStatus integration', () => {
  let connection: WebApi;
  let projectName: string;
  let repositoryId: string;
  let defaultBranchRef: string;
  let pullRequestId: number;
  let threadId: number;

  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 1000);
  const uniqueBranchName = `thread-status-test-${timestamp}-${randomSuffix}`;

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

    const changedFilePath = `/mcp-thread-status-test-${timestamp}.md`;

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
            comment: 'Add file for PR thread status integration tests',
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
      title: `PR thread status test ${timestamp}-${randomSuffix}`,
      description: 'PR created for thread status integration tests',
      sourceRefName: `refs/heads/${uniqueBranchName}`,
      targetRefName: defaultBranchRef,
      isDraft: true,
    });

    pullRequestId = pr.pullRequestId!;

    // Create an initial active thread
    const commentResult = await addPullRequestComment(
      connection,
      projectName,
      repositoryId,
      pullRequestId,
      {
        projectId: projectName,
        repositoryId,
        pullRequestId,
        content: 'Initial thread comment to be updated',
        status: 'active',
      },
    );

    threadId = commentResult.thread!.id!;
  });

  afterAll(async () => {
    const gitApi = await connection.getGitApi();

    if (pullRequestId) {
      try {
        await gitApi.updatePullRequest(
          {
            status: 2, // Abandoned
          },
          repositoryId,
          pullRequestId,
          projectName,
        );
      } catch {
        // ignore cleanup errors
      }
    }

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
    } catch {
      // ignore cleanup errors
    }
  });

  test('should update thread status to fixed', async () => {
    const result = await updatePullRequestThreadStatus(
      connection,
      projectName,
      repositoryId,
      pullRequestId,
      threadId,
      {
        pullRequestId,
        threadId,
        status: 'fixed',
      },
    );

    expect(result.thread).toBeDefined();
    expect(result.thread.status).toBe('fixed');
  }, 30000);

  test('should update thread status to closed', async () => {
    const result = await updatePullRequestThreadStatus(
      connection,
      projectName,
      repositoryId,
      pullRequestId,
      threadId,
      {
        pullRequestId,
        threadId,
        status: 'closed',
      },
    );

    expect(result.thread).toBeDefined();
    expect(result.thread.status).toBe('closed');
  }, 30000);
});
