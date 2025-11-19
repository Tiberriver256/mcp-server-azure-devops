import { WebApi } from 'azure-devops-node-api';
import { getPipelineTimeline } from './feature';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';

describe('getPipelineTimeline unit', () => {
  let mockConnection: WebApi;
  let mockBuildApi: any;
  let mockRestGet: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();

    mockRestGet = jest.fn();
    mockBuildApi = {
      rest: { get: mockRestGet },
      createRequestOptions: jest
        .fn()
        .mockReturnValue({ acceptHeader: 'application/json' }),
    };

    mockConnection = {
      serverUrl: 'https://dev.azure.com/testorg',
      getBuildApi: jest.fn().mockResolvedValue(mockBuildApi),
    } as unknown as WebApi;
  });

  it('retrieves the pipeline timeline with optional timeline id', async () => {
    mockRestGet.mockResolvedValue({
      statusCode: 200,
      result: {
        records: [
          { id: '1', state: 'completed', result: 'succeeded' },
          { id: '2', state: 'inProgress', result: 'none' },
        ],
      },
      headers: {},
    });

    const result = await getPipelineTimeline(mockConnection, {
      projectId: 'test-project',
      runId: 101,
      timelineId: 'timeline-1',
    });

    expect(result).toEqual({
      records: [
        { id: '1', state: 'completed', result: 'succeeded' },
        { id: '2', state: 'inProgress', result: 'none' },
      ],
    });
    expect(mockRestGet).toHaveBeenCalledTimes(1);
    const [requestUrl] = mockRestGet.mock.calls[0];
    const url = new URL(requestUrl);
    expect(url.pathname).toContain('/build/builds/101/timeline');
    expect(url.searchParams.get('timelineId')).toBe('timeline-1');
    expect(url.searchParams.get('api-version')).toBe('7.1');
  });

  it('throws resource not found when API returns 404', async () => {
    mockRestGet.mockResolvedValue({
      statusCode: 404,
      result: null,
      headers: {},
    });

    await expect(
      getPipelineTimeline(mockConnection, {
        projectId: 'test-project',
        runId: 101,
      }),
    ).rejects.toBeInstanceOf(AzureDevOpsResourceNotFoundError);
  });

  it('maps authentication errors', async () => {
    mockRestGet.mockRejectedValue(new Error('401 Unauthorized'));

    await expect(
      getPipelineTimeline(mockConnection, {
        projectId: 'test-project',
        runId: 101,
      }),
    ).rejects.toBeInstanceOf(AzureDevOpsAuthenticationError);
  });

  it('wraps unexpected errors', async () => {
    mockRestGet.mockRejectedValue(new Error('Boom'));

    await expect(
      getPipelineTimeline(mockConnection, {
        projectId: 'test-project',
        runId: 101,
      }),
    ).rejects.toBeInstanceOf(AzureDevOpsError);
  });

  it('filters records by state and result when filters provided', async () => {
    mockRestGet.mockResolvedValue({
      statusCode: 200,
      result: {
        records: [
          { id: '1', state: 'completed', result: 'succeeded' },
          { id: '2', state: 'completed', result: 'failed' },
          { id: '3', state: 'inProgress', result: 'none' },
        ],
      },
      headers: {},
    });

    const result = await getPipelineTimeline(mockConnection, {
      projectId: 'test-project',
      runId: 101,
      state: ['completed'],
      result: 'succeeded',
    });

    expect(result).toEqual({
      records: [{ id: '1', state: 'completed', result: 'succeeded' }],
    });
  });
});
