import { WebApi } from 'azure-devops-node-api';
import { PullRequest } from '../types';
import { getPullRequest } from './feature';
import { createPullRequest } from '../create-pull-request/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('getPullRequest integration', () => {
  let connection: WebApi;
  let projectName: string;
  let repositoryId: string;
  let defaultBranchRef: string;
  let testPullRequest: PullRequest | null = null;

  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 1000);
  const uniqueBranchName = `get-pr-branch-${timestamp}-${randomSuffix}`;
  const uniqueTitle = `Get PR ${timestamp}-${randomSuffix}`;

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
    // Normalize to repository GUID so downstream asserts and calls are stable
    if (repository.id) {
      repositoryId = repository.id;
    }
    defaultBranchRef = repository.defaultBranch || 'refs/heads/main';
  });

  afterAll(async () => {
    const gitApi = await connection.getGitApi();

    if (testPullRequest?.pullRequestId) {
      try {
        await gitApi.updatePullRequest(
          { status: 2 }, // Abandoned
          repositoryId,
          testPullRequest.pullRequestId,
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      // ignore cleanup errors
    }
  });

  test('should fetch pull request by id without repository id', async () => {
    const gitApi = await connection.getGitApi();

    const defaultBranchName = defaultBranchRef.replace('refs/heads/', '');
    const commits = await gitApi.getCommits(
      repositoryId,
      {
        itemVersion: { versionType: 0, version: defaultBranchName },
        $top: 1,
      },
      projectName,
    );

    if (!commits?.[0]?.commitId) {
      throw new Error('Cannot find commits in repository');
    }

    const updateResult = await gitApi.updateRefs(
      [
        {
          name: `refs/heads/${uniqueBranchName}`,
          oldObjectId: '0000000000000000000000000000000000000000',
          newObjectId: commits[0].commitId,
        },
      ],
      repositoryId,
      projectName,
    );

    if (!updateResult?.[0]?.success) {
      throw new Error('Failed to create new branch');
    }

    testPullRequest = await createPullRequest(
      connection,
      projectName,
      repositoryId,
      {
        title: uniqueTitle,
        description: 'Test pull request for getPullRequest integration test',
        sourceRefName: `refs/heads/${uniqueBranchName}`,
        targetRefName: defaultBranchRef,
        isDraft: true,
      },
    );

    const result = await getPullRequest(connection, {
      projectId: projectName,
      pullRequestId: testPullRequest.pullRequestId!,
    });

    expect(result.pullRequestId).toBe(testPullRequest.pullRequestId);
    expect(result.title).toBe(uniqueTitle);
    expect(result.repository?.id).toBe(repositoryId);
  }, 60000);
});
