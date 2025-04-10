import { WebApi } from 'azure-devops-node-api';
import { createPullRequest } from './feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import { GitRefUpdate } from 'azure-devops-node-api/interfaces/GitInterfaces';

describe('createPullRequest integration', () => {
  let connection: WebApi | null = null;

  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();
  });

  test('should create a new pull request in Azure DevOps', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      return;
    }

    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error(
        'Connection should be available when test is not skipped',
      );
    }

    // Create a unique title using timestamp to avoid conflicts
    const uniqueTitle = `Test Pull Request ${new Date().toISOString()}`;

    // For a true integration test, use a real project and repository
    const projectName =
      process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
    const repositoryId =
      process.env.AZURE_DEVOPS_DEFAULT_REPOSITORY || 'DefaultRepo';

    // Create a unique branch name
    const uniqueBranchName = `test-branch-${new Date().getTime()}`;

    // Get the Git API
    const gitApi = await connection.getGitApi();

    // Get the main branch's object ID
    const refs = await gitApi.getRefs(repositoryId, projectName, 'heads/main');
    if (!refs || refs.length === 0) {
      throw new Error('Could not find main branch');
    }

    const mainBranchObjectId = refs[0].objectId;

    // Create a new branch from main
    const refUpdate: GitRefUpdate = {
      name: `refs/heads/${uniqueBranchName}`,
      oldObjectId: '0000000000000000000000000000000000000000', // Required for new branch creation
      newObjectId: mainBranchObjectId,
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

    // Create a pull request with the new branch
    const result = await createPullRequest(
      connection,
      projectName,
      repositoryId,
      {
        title: uniqueTitle,
        description:
          'This is a test pull request created by an integration test',
        sourceRefName: `refs/heads/${uniqueBranchName}`,
        targetRefName: 'refs/heads/main',
        isDraft: true,
      },
    );

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.pullRequestId).toBeDefined();
    expect(result.title).toBe(uniqueTitle);
    expect(result.description).toBe(
      'This is a test pull request created by an integration test',
    );
    expect(result.sourceRefName).toBe(`refs/heads/${uniqueBranchName}`);
    expect(result.targetRefName).toBe('refs/heads/main');
    expect(result.isDraft).toBe(true);
  });
});
