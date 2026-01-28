import { WebApi } from 'azure-devops-node-api';
import { createPullRequest } from './feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import { GitRefUpdate } from 'azure-devops-node-api/interfaces/GitInterfaces';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('createPullRequest integration', () => {
  let connection: WebApi;
  let projectName: string;
  let repositoryId: string;
  let defaultBranchRef: string;
  let createdPullRequestId: number | undefined;
  let createdBranchName: string | undefined;

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

    if (createdPullRequestId) {
      try {
        await gitApi.updatePullRequest(
          {
            status: 2, // Abandoned
          },
          repositoryId,
          createdPullRequestId,
          projectName,
        );
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_) {
        // Ignore cleanup errors
      }
    }

    if (createdBranchName) {
      try {
        const refs = await gitApi.getRefs(
          repositoryId,
          projectName,
          `heads/${createdBranchName}`,
        );

        const branchObjectId = refs?.[0]?.objectId;
        if (branchObjectId) {
          await gitApi.updateRefs(
            [
              {
                name: `refs/heads/${createdBranchName}`,
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
    }
  });

  test('should create a new pull request in Azure DevOps', async () => {
    // Create a unique title using timestamp to avoid conflicts
    const uniqueTitle = `Test Pull Request ${new Date().toISOString()}`;

    // Create a unique branch name
    const uniqueBranchName = `test-branch-${new Date().getTime()}`;

    const gitApi = await connection.getGitApi();

    const defaultBranchName = defaultBranchRef.replace('refs/heads/', '');
    const refs = await gitApi.getRefs(
      repositoryId,
      projectName,
      `heads/${defaultBranchName}`,
    );

    if (!refs || refs.length === 0 || !refs[0].objectId) {
      throw new Error(`Could not find default branch ${defaultBranchRef}`);
    }

    const defaultBranchObjectId = refs[0].objectId;

    // Create a new branch from default
    const refUpdate: GitRefUpdate = {
      name: `refs/heads/${uniqueBranchName}`,
      oldObjectId: '0000000000000000000000000000000000000000',
      newObjectId: defaultBranchObjectId,
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

    createdBranchName = uniqueBranchName;

    const result = await createPullRequest(
      connection,
      projectName,
      repositoryId,
      {
        title: uniqueTitle,
        description:
          'This is a test pull request created by an integration test',
        sourceRefName: `refs/heads/${uniqueBranchName}`,
        targetRefName: defaultBranchRef,
        isDraft: true,
      },
    );

    createdPullRequestId = result.pullRequestId;

    expect(result).toBeDefined();
    expect(result.pullRequestId).toBeDefined();
    expect(result.title).toBe(uniqueTitle);
    expect(result.description).toBe(
      'This is a test pull request created by an integration test',
    );
    expect(result.sourceRefName).toBe(`refs/heads/${uniqueBranchName}`);
    expect(result.targetRefName).toBe(defaultBranchRef);
    expect(result.isDraft).toBe(true);
  });
});
