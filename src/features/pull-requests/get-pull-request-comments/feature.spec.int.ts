import { WebApi } from 'azure-devops-node-api';
import { getPullRequestComments } from './feature';
import { listPullRequests } from '../list-pull-requests/feature';
import { addPullRequestComment } from '../add-pull-request-comment/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';

describe('getPullRequestComments integration', () => {
  let connection: WebApi | null = null;
  let projectName: string;
  let repositoryName: string;
  let pullRequestId: number;
  let testThreadId: number;

  // Generate unique identifiers using timestamp for comment content
  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 1000);

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

    try {
      // Find an active pull request to use for testing
      const pullRequests = await listPullRequests(
        connection,
        projectName,
        repositoryName,
        {
          projectId: projectName,
          repositoryId: repositoryName,
          status: 'active',
          top: 1,
        },
      );

      if (!pullRequests || pullRequests.value.length === 0) {
        throw new Error('No active pull requests found for testing');
      }

      pullRequestId = pullRequests.value[0].pullRequestId!;
      console.log(`Using existing pull request #${pullRequestId} for testing`);

      // Create a test comment thread that we can use for specific thread tests
      const result = await addPullRequestComment(
        connection,
        projectName,
        repositoryName,
        pullRequestId,
        {
          projectId: projectName,
          repositoryId: repositoryName,
          pullRequestId,
          content: `Test comment thread ${timestamp}-${randomSuffix}`,
          status: 'active',
        },
      );

      testThreadId = result.thread!.id!;
      console.log(`Created test comment thread #${testThreadId} for testing`);
    } catch (error) {
      console.error('Error in test setup:', error);
      throw error;
    }
  });

  test('should get all comment threads from pull request', async () => {
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

    const threads = await getPullRequestComments(
      connection,
      projectName,
      repositoryName,
      pullRequestId,
      {
        projectId: projectName,
        repositoryId: repositoryName,
        pullRequestId,
      },
    );

    // Verify threads were returned
    expect(threads).toBeDefined();
    expect(Array.isArray(threads)).toBe(true);
    expect(threads.length).toBeGreaterThan(0);

    // Verify thread structure
    const firstThread = threads[0];
    expect(firstThread.id).toBeDefined();
    expect(firstThread.comments).toBeDefined();
    expect(Array.isArray(firstThread.comments)).toBe(true);
    expect(firstThread.comments!.length).toBeGreaterThan(0);

    // Verify comment structure
    const firstComment = firstThread.comments![0];
    expect(firstComment.content).toBeDefined();
    expect(firstComment.id).toBeDefined();
    expect(firstComment.publishedDate).toBeDefined();
    expect(firstComment.author).toBeDefined();
  }, 30000); // 30 second timeout for integration test

  test('should get a specific comment thread by ID', async () => {
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

    const threads = await getPullRequestComments(
      connection,
      projectName,
      repositoryName,
      pullRequestId,
      {
        projectId: projectName,
        repositoryId: repositoryName,
        pullRequestId,
        threadId: testThreadId,
      },
    );

    // Verify only one thread was returned
    expect(threads).toBeDefined();
    expect(Array.isArray(threads)).toBe(true);
    expect(threads.length).toBe(1);

    // Verify it's the correct thread
    const thread = threads[0];
    expect(thread.id).toBe(testThreadId);
    expect(thread.comments).toBeDefined();
    expect(Array.isArray(thread.comments)).toBe(true);
    expect(thread.comments!.length).toBeGreaterThan(0);

    // Verify the comment content matches what we created
    const comment = thread.comments![0];
    expect(comment.content).toBe(
      `Test comment thread ${timestamp}-${randomSuffix}`,
    );
  }, 30000); // 30 second timeout for integration test

  test('should handle pagination with top parameter', async () => {
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

    // Get all threads first to compare
    const allThreads = await getPullRequestComments(
      connection,
      projectName,
      repositoryName,
      pullRequestId,
      {
        projectId: projectName,
        repositoryId: repositoryName,
        pullRequestId,
      },
    );

    // Then get with pagination
    const paginatedThreads = await getPullRequestComments(
      connection,
      projectName,
      repositoryName,
      pullRequestId,
      {
        projectId: projectName,
        repositoryId: repositoryName,
        pullRequestId,
        top: 1,
      },
    );

    // Verify pagination
    expect(paginatedThreads).toBeDefined();
    expect(Array.isArray(paginatedThreads)).toBe(true);
    expect(paginatedThreads.length).toBe(1);
    expect(paginatedThreads.length).toBeLessThanOrEqual(allThreads.length);

    // Verify the thread structure is the same
    const thread = paginatedThreads[0];
    expect(thread.id).toBeDefined();
    expect(thread.comments).toBeDefined();
    expect(Array.isArray(thread.comments)).toBe(true);
    expect(thread.comments!.length).toBeGreaterThan(0);
  }, 30000); // 30 second timeout for integration test

  test('should handle includeDeleted parameter', async () => {
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

    const threads = await getPullRequestComments(
      connection,
      projectName,
      repositoryName,
      pullRequestId,
      {
        projectId: projectName,
        repositoryId: repositoryName,
        pullRequestId,
        includeDeleted: true,
      },
    );

    // We can only verify the call succeeds, as we can't guarantee deleted comments exist
    expect(threads).toBeDefined();
    expect(Array.isArray(threads)).toBe(true);
  }, 30000); // 30 second timeout for integration test
});
