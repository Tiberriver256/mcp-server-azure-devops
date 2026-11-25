import { getPullRequestChanges } from './feature';
import { AzureDevOpsError } from '../../../shared/errors';
import { Readable } from 'stream';

describe('getPullRequestChanges unit', () => {
  test('should retrieve changes, evaluations, and patches', async () => {
    const mockGitApi = {
      getPullRequest: jest.fn().mockResolvedValue({
        sourceRefName: 'refs/heads/feature',
        targetRefName: 'refs/heads/main',
      }),
      getPullRequestIterations: jest.fn().mockResolvedValue([{ id: 1 }]),
      getPullRequestIterationChanges: jest.fn().mockResolvedValue({
        changeEntries: [
          {
            item: {
              path: '/file.txt',
              objectId: 'new',
              originalObjectId: 'old',
            },
          },
        ],
      }),
      getBlobContent: jest.fn().mockImplementation((_: string, sha: string) => {
        const content = sha === 'new' ? 'new content\n' : 'old content\n';
        const stream = new Readable();
        stream.push(content);
        stream.push(null);
        return Promise.resolve(stream);
      }),
    };
    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
      getPolicyApi: jest.fn().mockResolvedValue({
        getPolicyEvaluations: jest.fn().mockResolvedValue([{ id: '1' }]),
      }),
    };

    const result = await getPullRequestChanges(mockConnection, {
      projectId: 'p',
      repositoryId: 'r',
      pullRequestId: 1,
    });

    expect(result.changes).toEqual({
      changeEntries: [
        {
          item: { path: '/file.txt', objectId: 'new', originalObjectId: 'old' },
        },
      ],
    });
    expect(result.evaluations).toHaveLength(1);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('/file.txt');
    expect(result.files[0].patch).toContain('-old content');
    expect(result.files[0].patch).toContain('+new content');
    expect(result.sourceRefName).toBe('refs/heads/feature');
    expect(result.targetRefName).toBe('refs/heads/main');
    expect(mockGitApi.getPullRequest).toHaveBeenCalledWith('r', 1, 'p');
  });

  test('uses project GUID from pullRequest metadata in policy artifactId and propagates non-size-limit stream errors', async () => {
    const getPolicyEvaluations = jest.fn().mockResolvedValue([]);
    const mockGitApi = {
      getPullRequest: jest.fn().mockResolvedValue({
        sourceRefName: 'refs/heads/feature',
        targetRefName: 'refs/heads/main',
        repository: { project: { id: 'guid-1111-2222' } },
      }),
      getPullRequestIterations: jest.fn().mockResolvedValue([{ id: 1 }]),
      getPullRequestIterationChanges: jest.fn().mockResolvedValue({
        changeEntries: [{ item: { path: '/broken.txt', objectId: 'obj-1' } }],
      }),
      getBlobContent: jest.fn().mockImplementation(() => {
        return new Readable({
          read() {
            this.destroy(new Error('network timeout while reading blob'));
          },
        });
      }),
    };
    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue(mockGitApi),
      getPolicyApi: jest.fn().mockResolvedValue({ getPolicyEvaluations }),
    };

    await expect(
      getPullRequestChanges(mockConnection, {
        projectId: 'MyProjectName',
        repositoryId: 'r',
        pullRequestId: 9,
      }),
    ).rejects.toThrow('network timeout while reading blob');

    expect(getPolicyEvaluations).toHaveBeenCalledWith(
      'MyProjectName',
      'vstfs:///CodeReview/CodeReviewId/guid-1111-2222/9',
    );
  });

  test('should throw when no iterations found', async () => {
    const mockConnection: any = {
      getGitApi: jest.fn().mockResolvedValue({
        getPullRequest: jest.fn().mockResolvedValue({
          sourceRefName: 'refs/heads/source',
          targetRefName: 'refs/heads/target',
        }),
        getPullRequestIterations: jest.fn().mockResolvedValue([]),
      }),
    };

    await expect(
      getPullRequestChanges(mockConnection, {
        projectId: 'p',
        repositoryId: 'r',
        pullRequestId: 1,
      }),
    ).rejects.toThrow(AzureDevOpsError);
  });
});
