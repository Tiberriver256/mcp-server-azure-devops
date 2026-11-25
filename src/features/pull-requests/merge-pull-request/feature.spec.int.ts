import { randomBytes } from 'crypto';
import type { WebApi } from 'azure-devops-node-api';
import {
  ItemContentType,
  PullRequestAsyncStatus,
  PullRequestStatus,
  VersionControlChangeType,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import { createPullRequest } from '../create-pull-request/feature';
import { mergePullRequest } from './feature';

const EMPTY_OBJECT_ID = '0000000000000000000000000000000000000000';
const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

async function waitForPullRequestMergeCalculation(
  connection: WebApi,
  repositoryId: string,
  pullRequestId: number,
  projectName: string,
  timeoutMs = 15000,
) {
  const gitApi = await connection.getGitApi();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const pr = await gitApi.getPullRequest(
      repositoryId,
      pullRequestId,
      projectName,
    );
    if (
      pr &&
      pr.mergeStatus !== PullRequestAsyncStatus.Queued &&
      pr.mergeStatus !== PullRequestAsyncStatus.NotSet &&
      pr.lastMergeSourceCommit?.commitId
    ) {
      return pr;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
  }

  return await gitApi.getPullRequest(repositoryId, pullRequestId, projectName);
}

async function waitForPullRequestCompletion(
  connection: WebApi,
  repositoryId: string,
  pullRequestId: number,
  projectName: string,
  timeoutMs = 15000,
) {
  const gitApi = await connection.getGitApi();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const pr = await gitApi.getPullRequest(
      repositoryId,
      pullRequestId,
      projectName,
    );
    if (pr && pr.status === PullRequestStatus.Completed) {
      return pr;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
  }

  return await gitApi.getPullRequest(repositoryId, pullRequestId, projectName);
}

describeOrSkip('mergePullRequest integration', () => {
  let connection: WebApi;
  let projectName: string;
  let repositoryId: string;
  let defaultBranchObjectId: string;

  const createdPullRequestIds: number[] = [];
  const createdBranchNames: string[] = [];

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
    const defaultBranchRef = repository.defaultBranch || 'refs/heads/main';
    const defaultBranchName = defaultBranchRef.replace('refs/heads/', '');

    const refs = await gitApi.getRefs(
      repositoryId,
      projectName,
      `heads/${defaultBranchName}`,
    );

    const defaultBranchRefObj = refs?.find((r) => r.name === defaultBranchRef);
    if (!defaultBranchRefObj?.objectId) {
      throw new Error(`Could not find default branch ${defaultBranchRef}`);
    }

    defaultBranchObjectId = defaultBranchRefObj.objectId;
  });

  afterAll(async () => {
    if (!connection || !repositoryId || !projectName) {
      return;
    }

    const gitApi = await connection.getGitApi();

    for (const prId of createdPullRequestIds) {
      try {
        const pr = await gitApi.getPullRequest(repositoryId, prId, projectName);
        if (pr?.status === PullRequestStatus.Active) {
          await gitApi.updatePullRequest(
            { status: PullRequestStatus.Abandoned },
            repositoryId,
            prId,
            projectName,
          );
        }
      } catch {
        // Ignore cleanup errors
      }
    }

    for (const branchName of createdBranchNames) {
      try {
        const refs = await gitApi.getRefs(
          repositoryId,
          projectName,
          `heads/${branchName}`,
        );
        const branchObjectId = refs?.find(
          (r) => r.name === `refs/heads/${branchName}`,
        )?.objectId;
        if (branchObjectId) {
          await gitApi.updateRefs(
            [
              {
                name: `refs/heads/${branchName}`,
                oldObjectId: branchObjectId,
                newObjectId: EMPTY_OBJECT_ID,
              },
            ],
            repositoryId,
            projectName,
          );
        }
      } catch {
        // Ignore cleanup errors (e.g., source branch already deleted on merge)
      }
    }
  });

  test('should enable/cancel auto-complete and merge a pull request between two temporary branches', async () => {
    const gitApi = await connection.getGitApi();
    const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
    const targetBranch = `merge-target-${suffix}`;
    const sourceBranch = `merge-source-${suffix}`;
    const conflictSourceBranch = `merge-conflict-source-${suffix}`;
    const conflictFilePath = `/.merge-pr-int-conflict-${suffix}.txt`;
    const cleanFilePath = `/.merge-pr-int-clean-${suffix}.txt`;

    // Create temporary target branch from default branch head (never touch main!)
    const targetRefResult = await gitApi.updateRefs(
      [
        {
          name: `refs/heads/${targetBranch}`,
          oldObjectId: EMPTY_OBJECT_ID,
          newObjectId: defaultBranchObjectId,
        },
      ],
      repositoryId,
      projectName,
    );
    if (!targetRefResult?.[0]?.success) {
      throw new Error(
        `Failed to create temporary target branch ${targetBranch}`,
      );
    }
    createdBranchNames.push(targetBranch);

    // Push a baseline file commit onto targetBranch and create conflicting commit on conflictSourceBranch
    const targetPush = await gitApi.createPush(
      {
        refUpdates: [
          {
            name: `refs/heads/${targetBranch}`,
            oldObjectId: defaultBranchObjectId,
          },
        ],
        commits: [
          {
            comment: `test: add baseline conflict file on ${targetBranch}`,
            changes: [
              {
                changeType: VersionControlChangeType.Add,
                item: { path: conflictFilePath },
                newContent: {
                  content: 'target branch line\n',
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
    const targetHeadCommitId = targetPush?.commits?.[0]?.commitId;
    if (!targetHeadCommitId) {
      throw new Error('Failed to push commit to temporary target branch');
    }

    // Create conflictSourceBranch from defaultBranchObjectId and push conflicting file
    const conflictRefResult = await gitApi.updateRefs(
      [
        {
          name: `refs/heads/${conflictSourceBranch}`,
          oldObjectId: EMPTY_OBJECT_ID,
          newObjectId: defaultBranchObjectId,
        },
      ],
      repositoryId,
      projectName,
    );
    if (!conflictRefResult?.[0]?.success) {
      throw new Error(
        `Failed to create temporary branch ${conflictSourceBranch}`,
      );
    }
    createdBranchNames.push(conflictSourceBranch);

    await gitApi.createPush(
      {
        refUpdates: [
          {
            name: `refs/heads/${conflictSourceBranch}`,
            oldObjectId: defaultBranchObjectId,
          },
        ],
        commits: [
          {
            comment: `test: add conflicting file on ${conflictSourceBranch}`,
            changes: [
              {
                changeType: VersionControlChangeType.Add,
                item: { path: conflictFilePath },
                newContent: {
                  content: 'conflicting source branch line\n',
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

    // Open a conflicting PR so auto-complete arms without immediately completing on a policy-free temp branch
    const conflictPr = await createPullRequest(
      connection,
      projectName,
      repositoryId,
      {
        title: `Test Auto-Complete PR ${suffix}`,
        description: 'Temporary PR verifying auto-complete enable/cancel',
        sourceRefName: `refs/heads/${conflictSourceBranch}`,
        targetRefName: `refs/heads/${targetBranch}`,
      },
    );
    expect(conflictPr.pullRequestId).toBeDefined();
    createdPullRequestIds.push(conflictPr.pullRequestId!);

    await waitForPullRequestMergeCalculation(
      connection,
      repositoryId,
      conflictPr.pullRequestId!,
      projectName,
    );

    const armedPr = await mergePullRequest(connection, {
      projectId: projectName,
      pullRequestId: conflictPr.pullRequestId!,
      autoComplete: true,
      mergeStrategy: 'squash',
      deleteSourceBranch: true,
    });
    expect(armedPr.autoCompleteSetBy?.id).toBeTruthy();
    expect(armedPr.status).toBe(PullRequestStatus.Active);

    const canceledPr = await mergePullRequest(connection, {
      projectId: projectName,
      pullRequestId: conflictPr.pullRequestId!,
      autoComplete: false,
    });
    expect(canceledPr.autoCompleteSetBy?.id).toBeFalsy();
    expect(canceledPr.status).toBe(PullRequestStatus.Active);

    // Create clean sourceBranch from targetHeadCommitId and push a tiny commit
    const sourceRefResult = await gitApi.updateRefs(
      [
        {
          name: `refs/heads/${sourceBranch}`,
          oldObjectId: EMPTY_OBJECT_ID,
          newObjectId: targetHeadCommitId,
        },
      ],
      repositoryId,
      projectName,
    );
    if (!sourceRefResult?.[0]?.success) {
      throw new Error(
        `Failed to create temporary source branch ${sourceBranch}`,
      );
    }
    createdBranchNames.push(sourceBranch);

    await gitApi.createPush(
      {
        refUpdates: [
          {
            name: `refs/heads/${sourceBranch}`,
            oldObjectId: targetHeadCommitId,
          },
        ],
        commits: [
          {
            comment: `test: add clean file on ${sourceBranch}`,
            changes: [
              {
                changeType: VersionControlChangeType.Add,
                item: { path: cleanFilePath },
                newContent: {
                  content: `merge integration test ${suffix}\n`,
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

    // Open clean PR from sourceBranch -> targetBranch
    const mergePr = await createPullRequest(
      connection,
      projectName,
      repositoryId,
      {
        title: `Test Merge PR ${suffix}`,
        description: 'Temporary PR verifying squash merge and branch deletion',
        sourceRefName: `refs/heads/${sourceBranch}`,
        targetRefName: `refs/heads/${targetBranch}`,
      },
    );
    expect(mergePr.pullRequestId).toBeDefined();
    createdPullRequestIds.push(mergePr.pullRequestId!);

    const calculatedPr = await waitForPullRequestMergeCalculation(
      connection,
      repositoryId,
      mergePr.pullRequestId!,
      projectName,
    );
    expect(calculatedPr.lastMergeSourceCommit?.commitId).toBeTruthy();

    // Complete PR immediately with squash + deleteSourceBranch (deriving repositoryId automatically)
    const completedPr = await mergePullRequest(connection, {
      projectId: projectName,
      pullRequestId: mergePr.pullRequestId!,
      mergeStrategy: 'squash',
      deleteSourceBranch: true,
      mergeCommitMessage: `test: squash merge ${suffix}`,
    });

    const finalPr =
      completedPr.status === PullRequestStatus.Completed
        ? completedPr
        : await waitForPullRequestCompletion(
            connection,
            repositoryId,
            mergePr.pullRequestId!,
            projectName,
          );

    expect(finalPr.status).toBe(PullRequestStatus.Completed);
  }, 60000);
});
