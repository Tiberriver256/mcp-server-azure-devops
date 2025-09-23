import { WebApi } from 'azure-devops-node-api';
import { updatePullRequest } from './feature';
import { createPullRequest } from '../create-pull-request/feature';
import { listWorkItems } from '../../work-items/list-work-items/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';

describe('updatePullRequest integration', () => {
  let connection: WebApi | null = null;
  let projectName: string;
  let repositoryName: string;
  let pullRequestId: number;
  let workItemId: number | null = null;

  // Generate unique identifiers using timestamp
  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 1000);
  const uniqueBranchName = `test-branch-${timestamp}-${randomSuffix}`;
  const uniqueTitle = `Test PR ${timestamp}-${randomSuffix}`;
  const updatedTitle = `Updated PR ${timestamp}-${randomSuffix}`;

  beforeAll(async () => {
    // Skip if integration tests should be skipped
    if (shouldSkipIntegrationTest()) {
      return;
    }

    // Get a real connection using environment variables
    connection = await getTestConnection();

    // Get project and repository names from environment variables
    projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
    repositoryName =
      process.env.AZURE_DEVOPS_DEFAULT_REPOSITORY || 'DefaultRepo';

    // Find an existing work item to use in tests
    if (!connection) {
      throw new Error('Connection is null');
    }
    const workItems = await listWorkItems(connection, {
      projectId: projectName,
      top: 1, // Just need one work item
    });

    if (workItems && workItems.length > 0 && workItems[0].id) {
      workItemId = workItems[0].id;
    }

    // Create a test pull request or find an existing one
    const gitApi = await connection.getGitApi();

    // Get the default branch's object ID
    const repository = await gitApi.getRepository(repositoryName, projectName);
    const defaultBranch =
      repository.defaultBranch?.replace('refs/heads/', '') || 'main';

    // Get the latest commit on the default branch
    const commits = await gitApi.getCommits(
      repositoryName,
      {
        $top: 1,
        itemVersion: {
          version: defaultBranch,
          versionType: 0, // 0 = branch
        },
      },
      projectName,
    );

    if (!commits || commits.length === 0) {
      throw new Error('No commits found in repository');
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
    const testPullRequest = await createPullRequest(
      connection,
      projectName,
      repositoryName,
      {
        title: uniqueTitle,
        description: 'Test pull request for integration testing',
        sourceRefName: `refs/heads/${uniqueBranchName}`,
        targetRefName: repository.defaultBranch || 'refs/heads/main',
        isDraft: true,
      },
    );

    pullRequestId = testPullRequest.pullRequestId!;
  });

  afterAll(async () => {
    // Clean up created resources
    if (!shouldSkipIntegrationTest() && connection && pullRequestId) {
      try {
        // Check the current state of the pull request
        const gitApi = await connection.getGitApi();
        const pullRequest = await gitApi.getPullRequestById(
          pullRequestId,
          projectName,
        );

        // Only try to abandon if it's still active (status 1)
        if (pullRequest && pullRequest.status === 1) {
          await gitApi.updatePullRequest(
            {
              status: 2, // 2 = Abandoned
            },
            repositoryName,
            pullRequestId,
            projectName,
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_) {
        // Ignore cleanup errors
      }
    }
  });

  test('should update pull request title and description', async () => {
    // Skip if integration tests should be skipped
    if (shouldSkipIntegrationTest() || !connection) {
      console.log('Skipping test due to missing connection');
      return;
    }

    const updatedDescription = 'Updated description for integration testing';

    const result = await updatePullRequest({
      projectId: projectName,
      repositoryId: repositoryName,
      pullRequestId,
      title: updatedTitle,
      description: updatedDescription,
    });

    // Verify the update was successful
    expect(result).toBeDefined();
    expect(result.pullRequestId).toBe(pullRequestId);
    expect(result.title).toBe(updatedTitle);
    expect(result.description).toBe(updatedDescription);
  }, 30000); // 30 second timeout for integration test

  test('should update pull request draft status', async () => {
    // Skip if integration tests should be skipped
    if (shouldSkipIntegrationTest() || !connection) {
      console.log('Skipping test due to missing connection');
      return;
    }

    // Mark as not a draft
    const result = await updatePullRequest({
      projectId: projectName,
      repositoryId: repositoryName,
      pullRequestId,
      isDraft: false,
    });

    // Verify the update was successful
    expect(result).toBeDefined();
    expect(result.pullRequestId).toBe(pullRequestId);
    expect(result.isDraft).toBe(false);
  }, 30000); // 30 second timeout for integration test

  test('should add work item links to pull request', async () => {
    // Skip if no work items were found
    if (shouldSkipIntegrationTest()) {
      console.log('Skipping test due to missing connection or work item');
      return;
    }

    // Add the work item link
    const result = await updatePullRequest({
      projectId: projectName,
      repositoryId: repositoryName,
      pullRequestId,
      addWorkItemIds: [workItemId!],
    });

    // Verify the update was successful
    expect(result).toBeDefined();
    expect(result.pullRequestId).toBe(pullRequestId);

    // Get the pull request work items using the proper API
    const gitApi = await connection!.getGitApi();

    // Add a delay to allow Azure DevOps to process the work item link
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Use the getPullRequestWorkItemRefs method to get the work items
    const workItemRefs = await gitApi.getPullRequestWorkItemRefs(
      repositoryName,
      pullRequestId,
      projectName,
    );

    // Verify that work items are linked
    expect(workItemRefs).toBeDefined();
    expect(Array.isArray(workItemRefs)).toBe(true);

    // Check if our work item is in the list
    const hasWorkItem = workItemRefs.some(
      (ref) => ref.id !== undefined && Number(ref.id) === workItemId,
    );
    expect(hasWorkItem).toBe(true);
  }, 60000); // 60 second timeout for integration test

  test('should remove work item links from pull request', async () => {
    // Skip if no work items were found
    if (shouldSkipIntegrationTest()) {
      console.log('Skipping test due to missing connection or work item');
      return;
    }

    // First ensure the work item is linked
    try {
      await updatePullRequest({
        projectId: projectName,
        repositoryId: repositoryName,
        pullRequestId,
        addWorkItemIds: [workItemId!],
      });

      // Add a delay to allow Azure DevOps to process the work item link
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (error) {
      // If there's an error adding the link, that's okay
      console.log(
        "Error adding work item (already be linked so that's 👍):",
        error instanceof Error ? error.message : String(error),
      );
    }

    // Then remove the work item link
    const result = await updatePullRequest({
      projectId: projectName,
      repositoryId: repositoryName,
      pullRequestId,
      removeWorkItemIds: [workItemId!],
    });

    // Verify the update was successful
    expect(result).toBeDefined();
    expect(result.pullRequestId).toBe(pullRequestId);

    // Get the pull request work items using the proper API
    const gitApi = await connection!.getGitApi();

    // Add a delay to allow Azure DevOps to process the work item unlink
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Use the getPullRequestWorkItemRefs method to get the work items
    const workItemRefs = await gitApi.getPullRequestWorkItemRefs(
      repositoryName,
      pullRequestId,
      projectName,
    );

    // Verify that work items are properly unlinked
    expect(workItemRefs).toBeDefined();
    expect(Array.isArray(workItemRefs)).toBe(true);

    // Check if our work item is not in the list
    const hasWorkItem = workItemRefs.some(
      (ref) => ref.id !== undefined && Number(ref.id) === workItemId,
    );
    expect(hasWorkItem).toBe(false);
  }, 60000); // 60 second timeout for integration test

  test('should add reviewers to pull request', async () => {
    // Skip if integration tests should be skipped
    if (shouldSkipIntegrationTest() || !connection) {
      console.log('Skipping test due to missing connection');
      return;
    }

    // Find an actual user in the organization to use as a reviewer
    const gitApi = await connection.getGitApi();

    // Get the pull request creator as a reviewer (they always exist)
    const pullRequest = await gitApi.getPullRequestById(
      pullRequestId,
      projectName,
    )!;

    // Use the pull request creator's ID as the reviewer
    const reviewer = pullRequest.createdBy!.id!;

    // Add the reviewer
    const result = await updatePullRequest({
      projectId: projectName,
      repositoryId: repositoryName,
      pullRequestId,
      addReviewers: [reviewer],
    });

    // Verify the update was successful
    expect(result).toBeDefined();
    expect(result.pullRequestId).toBe(pullRequestId);

    // Add a delay to allow Azure DevOps to process the reviewer addition
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const reviewers = await gitApi.getPullRequestReviewers(
      repositoryName,
      pullRequestId,
      projectName,
    );

    // Verify that the reviewer was added
    expect(reviewers).toBeDefined();
    expect(Array.isArray(reviewers)).toBe(true);

    // Check if our reviewer is in the list by ID
    const hasReviewer = reviewers.some((r) => r.id === reviewer);
    expect(hasReviewer).toBe(true);
  }, 60000); // 60 second timeout for integration test

  test('should remove reviewers from pull request', async () => {
    // Skip if integration tests should be skipped
    if (shouldSkipIntegrationTest() || !connection) {
      console.log('Skipping test due to missing connection');
      return;
    }

    // Find an actual user in the organization to use as a reviewer
    const gitApi = await connection.getGitApi();

    // Get the pull request creator as a reviewer (they always exist)
    const pullRequest = await gitApi.getPullRequestById(
      pullRequestId,
      projectName,
    );

    if (!pullRequest || !pullRequest.createdBy || !pullRequest.createdBy.id) {
      throw new Error('Could not determine pull request creator');
    }

    // Use the pull request creator's ID as the reviewer
    const reviewer = pullRequest.createdBy.id;

    // First ensure the reviewer is added
    try {
      await updatePullRequest({
        projectId: projectName,
        repositoryId: repositoryName,
        pullRequestId,
        addReviewers: [reviewer],
      });

      // Add a delay to allow Azure DevOps to process the reviewer addition
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (error) {
      // If there's an error adding the reviewer, that's okay
      console.log(
        'Error adding reviewer (might already be added):',
        error instanceof Error ? error.message : String(error),
      );
    }

    // Then remove the reviewer
    const result = await updatePullRequest({
      projectId: projectName,
      repositoryId: repositoryName,
      pullRequestId,
      removeReviewers: [reviewer],
    });

    // Verify the update was successful
    expect(result).toBeDefined();
    expect(result.pullRequestId).toBe(pullRequestId);

    // Add a delay to allow Azure DevOps to process the reviewer removal
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const reviewers = await gitApi.getPullRequestReviewers(
      repositoryName,
      pullRequestId,
      projectName,
    );

    // Verify that the reviewer was removed
    expect(reviewers).toBeDefined();
    expect(Array.isArray(reviewers)).toBe(true);

    // Check if our reviewer is not in the list
    const hasReviewer = reviewers.some((r) => r.id === reviewer);
    expect(hasReviewer).toBe(false);
  }, 60000); // 60 second timeout for integration test

  test('should update pull request with additional properties', async () => {
    // Skip if integration tests should be skipped
    if (shouldSkipIntegrationTest() || !connection) {
      console.log('Skipping test due to missing connection');
      return;
    }

    // Use a custom property that Azure DevOps supports
    const customProperty = 'autoComplete';
    const customValue = true;

    const result = await updatePullRequest({
      projectId: projectName,
      repositoryId: repositoryName,
      pullRequestId,
      customProperties: {
        [customProperty]: customValue,
      },
    });

    // Verify the update was successful
    expect(result).toBeDefined();
    expect(result.pullRequestId).toBe(pullRequestId);

    // For autoComplete specifically, we can check if it's in the response
    if (customProperty in result) {
      expect(result[customProperty]).toBe(customValue);
    }
  }, 30000); // 30 second timeout for integration test

  test('should update pull request status to abandoned', async () => {
    // Skip if integration tests should be skipped
    if (shouldSkipIntegrationTest() || !connection) {
      console.log('Skipping test due to missing connection');
      return;
    }

    // Abandon the pull request instead of completing it
    // Completing requires additional setup that's complex for integration tests
    const result = await updatePullRequest({
      projectId: projectName,
      repositoryId: repositoryName,
      pullRequestId,
      status: 'abandoned',
    });

    // Verify the update was successful
    expect(result).toBeDefined();
    expect(result.pullRequestId).toBe(pullRequestId);
    expect(result.status).toBe(2); // 2 = Abandoned
  }, 30000); // 30 second timeout for integration test
});
