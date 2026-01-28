import { WebApi } from 'azure-devops-node-api';
import { updatePullRequest } from './feature';
import { createPullRequest } from '../create-pull-request/feature';
import { listWorkItems } from '../../work-items/list-work-items/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('updatePullRequest integration', () => {
  let connection: WebApi;
  let projectName: string;
  let repositoryId: string;
  let defaultBranchRef: string;
  let pullRequestId: number;
  let workItemId: number;

  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 1000);
  const uniqueBranchName = `test-branch-${timestamp}-${randomSuffix}`;
  const uniqueTitle = `Test PR ${timestamp}-${randomSuffix}`;
  const updatedTitle = `Updated PR ${timestamp}-${randomSuffix}`;

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

    // Find an existing work item to use in tests
    const workItems = await listWorkItems(connection, {
      projectId: projectName,
      top: 1,
    });

    if (workItems && workItems.length > 0 && workItems[0].id) {
      workItemId = workItems[0].id;
    }
    if (!workItemId) {
      throw new Error('No work items found for pull request tests');
    }

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

    const refUpdate = {
      name: `refs/heads/${uniqueBranchName}`,
      oldObjectId: '0000000000000000000000000000000000000000',
      newObjectId: commits[0].commitId,
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

    const testPullRequest = await createPullRequest(
      connection,
      projectName,
      repositoryId,
      {
        title: uniqueTitle,
        description: 'Test pull request for integration testing',
        sourceRefName: `refs/heads/${uniqueBranchName}`,
        targetRefName: defaultBranchRef,
        isDraft: true,
      },
    );

    pullRequestId = testPullRequest.pullRequestId!;
  });

  afterAll(async () => {
    const gitApi = await connection.getGitApi();

    if (pullRequestId) {
      try {
        const pullRequest = await gitApi.getPullRequestById(
          pullRequestId,
          projectName,
        );

        if (pullRequest && pullRequest.status === 1) {
          await gitApi.updatePullRequest(
            {
              status: 2,
            },
            repositoryId,
            pullRequestId,
            projectName,
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_) {
        // Ignore cleanup errors
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
      // Ignore cleanup errors
    }
  });

  test('should update pull request title and description', async () => {
    const updatedDescription = 'Updated description for integration testing';

    const result = await updatePullRequest({
      projectId: projectName,
      repositoryId,
      pullRequestId,
      title: updatedTitle,
      description: updatedDescription,
    });

    expect(result).toBeDefined();
    expect(result.pullRequestId).toBe(pullRequestId);
    expect(result.title).toBe(updatedTitle);
    expect(result.description).toBe(updatedDescription);
  }, 30000);

  test('should update pull request draft status', async () => {
    const result = await updatePullRequest({
      projectId: projectName,
      repositoryId,
      pullRequestId,
      isDraft: false,
    });

    expect(result).toBeDefined();
    expect(result.pullRequestId).toBe(pullRequestId);
    expect(result.isDraft).toBe(false);
  }, 30000);

  test('should add work item links to pull request', async () => {
    const result = await updatePullRequest({
      projectId: projectName,
      repositoryId,
      pullRequestId,
      addWorkItemIds: [workItemId],
    });

    expect(result).toBeDefined();
    expect(result.pullRequestId).toBe(pullRequestId);

    const gitApi = await connection.getGitApi();

    await new Promise((resolve) => setTimeout(resolve, 5000));

    const workItemRefs = await gitApi.getPullRequestWorkItemRefs(
      repositoryId,
      pullRequestId,
      projectName,
    );

    expect(workItemRefs).toBeDefined();
    expect(Array.isArray(workItemRefs)).toBe(true);

    const hasWorkItem = workItemRefs.some(
      (ref) => ref.id !== undefined && Number(ref.id) === workItemId,
    );
    expect(hasWorkItem).toBe(true);
  }, 60000);
});
