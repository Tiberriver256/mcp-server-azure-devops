import { WebApi } from 'azure-devops-node-api';
import { addPullRequestComment } from './feature';
import { listPullRequests } from '../list-pull-requests/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';

describe('addPullRequestComment integration', () => {
  let connection: WebApi | null = null;
  let projectName: string;
  let repositoryName: string;
  let pullRequestId: number;

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
    } catch (error) {
      console.error('Error in test setup:', error);
      throw error;
    }
  });

  test('should add a new comment thread to pull request', async () => {
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

    const commentContent = `Test comment ${timestamp}-${randomSuffix}`;

    const result = await addPullRequestComment(
      connection,
      projectName,
      repositoryName,
      pullRequestId,
      {
        projectId: projectName,
        repositoryId: repositoryName,
        pullRequestId,
        content: commentContent,
        status: 'active',
      },
    );

    // Verify the comment was created
    expect(result.comment).toBeDefined();
    expect(result.comment.content).toBe(commentContent);
    expect(result.thread).toBeDefined();
    expect(result.thread!.status).toBe('active'); // Transformed to string
  }, 30000); // 30 second timeout for integration test

  test('should add a file comment to pull request', async () => {
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

    const commentContent = `File comment ${timestamp}-${randomSuffix}`;
    const filePath = '/README.md'; // Assuming README.md exists in the repo
    const lineNumber = 1;

    const result = await addPullRequestComment(
      connection,
      projectName,
      repositoryName,
      pullRequestId,
      {
        projectId: projectName,
        repositoryId: repositoryName,
        pullRequestId,
        content: commentContent,
        filePath,
        lineNumber,
        status: 'active',
      },
    );

    // Verify the file comment was created
    expect(result.comment).toBeDefined();
    expect(result.comment.content).toBe(commentContent);
    expect(result.thread).toBeDefined();
    expect(result.thread!.threadContext).toBeDefined();
    expect(result.thread!.threadContext!.filePath).toBe(filePath);
    expect(result.thread!.threadContext!.rightFileStart!.line).toBe(lineNumber);
  }, 30000); // 30 second timeout for integration test

  test('should add a reply to an existing comment thread', async () => {
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

    // First create a thread
    const initialComment = await addPullRequestComment(
      connection,
      projectName,
      repositoryName,
      pullRequestId,
      {
        projectId: projectName,
        repositoryId: repositoryName,
        pullRequestId,
        content: `Initial comment ${timestamp}-${randomSuffix}`,
        status: 'active',
      },
    );

    const threadId = initialComment.thread!.id!;
    const replyContent = `Reply comment ${timestamp}-${randomSuffix}`;

    // Add a reply to the thread
    const result = await addPullRequestComment(
      connection,
      projectName,
      repositoryName,
      pullRequestId,
      {
        projectId: projectName,
        repositoryId: repositoryName,
        pullRequestId,
        content: replyContent,
        threadId,
      },
    );

    // Verify the reply was created
    expect(result.comment).toBeDefined();
    expect(result.comment.content).toBe(replyContent);
    expect(result.thread).toBeUndefined(); // No thread returned for replies
  }, 30000); // 30 second timeout for integration test
});
