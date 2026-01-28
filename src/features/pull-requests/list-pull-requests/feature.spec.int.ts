import { WebApi } from 'azure-devops-node-api';
import { PullRequest } from '../types';
import { listPullRequests } from './feature';
import { createPullRequest } from '../create-pull-request/feature';

import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('listPullRequests integration', () => {
  let connection: WebApi;
  let projectName: string;
  let repositoryId: string;
  let defaultBranchRef: string;
  let testPullRequest: PullRequest | null = null;

  // Generate unique branch name and PR title using timestamp
  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 1000);
  const uniqueBranchName = `test-branch-${timestamp}-${randomSuffix}`;
  const uniqueTitle = `Test PR ${timestamp}-${randomSuffix}`;

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
  });

  afterAll(async () => {
    const gitApi = await connection.getGitApi();

    // Clean up created resources if needed
    if (testPullRequest && testPullRequest.pullRequestId) {
      try {
        await gitApi.updatePullRequest(
          {
            status: 2, // Abandoned
          },
          repositoryId,
          testPullRequest.pullRequestId,
          projectName,
        );
      } catch (error) {
        console.error('Error cleaning up test pull request:', error);
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

  test('should list pull requests from repository', async () => {
    // Create a branch for testing
    const gitApi = await connection.getGitApi();

    const defaultBranchName = defaultBranchRef.replace('refs/heads/', '');

    // Get the commit to branch from
    const commits = await gitApi.getCommits(
      repositoryId,
      {
        itemVersion: {
          versionType: 0,
          version: defaultBranchName,
        },
        $top: 1,
      },
      projectName,
    );

    if (!commits || commits.length === 0 || !commits[0].commitId) {
      throw new Error('Cannot find commits in repository');
    }

    // Create a new branch
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

    // Create a test pull request
    testPullRequest = await createPullRequest(
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

    // Act - list pull requests
    const result = await listPullRequests(
      connection,
      projectName,
      repositoryId,
      {
        projectId: projectName,
        repositoryId,
        status: 'active',
        top: 10,
      },
    );

    // Assert
    expect(result).toBeDefined();
    expect(result.value).toBeDefined();
    expect(Array.isArray(result.value)).toBe(true);

    // There should be at least our test pull request
    const found = result.value.some(
      (pr) => pr.pullRequestId === testPullRequest?.pullRequestId,
    );
    expect(found).toBe(true);
  }, 60000);
});
