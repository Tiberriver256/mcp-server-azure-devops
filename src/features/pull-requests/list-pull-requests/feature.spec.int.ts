import { WebApi } from 'azure-devops-node-api';
import { PullRequest } from '../types';
import { listPullRequests } from './feature';
import { createPullRequest } from '../create-pull-request/feature';

import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers';

describe('listPullRequests integration', () => {
  let connection: WebApi | null = null;
  let testPullRequest: PullRequest | null = null;
  let projectName: string;
  let repositoryName: string;

  // Generate unique branch name and PR title using timestamp
  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 1000);
  const uniqueBranchName = `test-branch-${timestamp}-${randomSuffix}`;
  const uniqueTitle = `Test PR ${timestamp}-${randomSuffix}`;

  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();

    // Set up project and repository names from environment
    projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
    repositoryName = process.env.AZURE_DEVOPS_DEFAULT_REPOSITORY || '';

    // Skip setup if integration tests should be skipped
    if (shouldSkipIntegrationTest() || !connection) {
      return;
    }
  });

  afterAll(async () => {
    // Clean up created resources if needed
    if (
      testPullRequest &&
      testPullRequest.pullRequestId &&
      !shouldSkipIntegrationTest()
    ) {
      try {
        // Abandon the test pull request if it was created
        const gitApi = await connection?.getGitApi();
        if (gitApi) {
          await gitApi.updatePullRequest(
            {
              status: 2, // 2 = Abandoned
            },
            repositoryName,
            testPullRequest.pullRequestId,
            projectName,
          );
        }
      } catch (error) {
        console.error('Error cleaning up test pull request:', error);
      }
    }
  });

  test('should list pull requests from repository', async () => {
    // Skip if integration tests should be skipped
    if (shouldSkipIntegrationTest() || !connection) {
      console.log('Skipping test due to missing connection');
      return;
    }

    // Skip if repository name is not defined
    if (!repositoryName) {
      console.log('Skipping test due to missing repository name');
      return;
    }

    try {
      // Create a branch for testing
      const gitApi = await connection.getGitApi();

      // Get the default branch info
      const repository = await gitApi.getRepository(
        repositoryName,
        projectName,
      );

      if (!repository || !repository.defaultBranch) {
        throw new Error('Cannot find repository or default branch');
      }

      // Get the commit to branch from
      const commits = await gitApi.getCommits(
        repositoryName,
        {
          itemVersion: {
            versionType: 0, // commit
            version: repository.defaultBranch.replace('refs/heads/', ''),
          },
          $top: 1,
        },
        projectName,
      );

      if (!commits || commits.length === 0) {
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
        repositoryName,
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
        repositoryName,
        {
          title: uniqueTitle,
          description: 'Test pull request for integration testing',
          sourceRefName: `refs/heads/${uniqueBranchName}`,
          targetRefName: repository.defaultBranch,
          isDraft: true,
        },
      );

      // List pull requests
      const pullRequests = await listPullRequests(
        connection,
        projectName,
        repositoryName,
        { projectId: projectName, repositoryId: repositoryName },
      );

      // Verify
      expect(pullRequests).toBeDefined();
      expect(pullRequests.value).toBeDefined();
      expect(Array.isArray(pullRequests.value)).toBe(true);
      expect(typeof pullRequests.count).toBe('number');
      expect(typeof pullRequests.hasMoreResults).toBe('boolean');

      // Find our test PR in the list
      const foundPR = pullRequests.value.find(
        (pr) => pr.pullRequestId === testPullRequest?.pullRequestId,
      );
      expect(foundPR).toBeDefined();
      expect(foundPR?.title).toBe(uniqueTitle);

      // Test with filters
      const filteredPRs = await listPullRequests(
        connection,
        projectName,
        repositoryName,
        {
          projectId: projectName,
          repositoryId: repositoryName,
          status: 'active',
          top: 5,
        },
      );

      expect(filteredPRs).toBeDefined();
      expect(filteredPRs.value).toBeDefined();
      expect(Array.isArray(filteredPRs.value)).toBe(true);
      expect(filteredPRs.count).toBeGreaterThanOrEqual(0);
    } catch (error) {
      console.error('Test error:', error);
      throw error;
    }
  }, 30000); // 30 second timeout for integration test
});
