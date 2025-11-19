import { WebApi } from 'azure-devops-node-api';
import {
  RunResult,
  RunState,
} from 'azure-devops-node-api/interfaces/PipelinesInterfaces';
import { listPipelineRuns } from './feature';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import { Run } from '../types';

describe('listPipelineRuns unit', () => {
  let mockConnection: WebApi;
  let mockPipelinesApi: any;
  let mockRestGet: jest.Mock;

  const sampleRuns: Run[] = [
    {
      id: 101,
      name: 'Run 101',
      createdDate: new Date('2024-01-01T10:00:00Z'),
      state: RunState.Completed,
      result: RunResult.Succeeded,
      url: 'https://dev.azure.com/org/project/_apis/pipelines/42/runs/101',
      _links: {
        web: { href: 'https://dev.azure.com/org/project/pipelines/run/101' },
      },
    },
  ];

  beforeEach(() => {
    jest.resetAllMocks();

    mockRestGet = jest.fn();

    mockPipelinesApi = {
      rest: { get: mockRestGet },
      createRequestOptions: jest
        .fn()
        .mockReturnValue({ acceptHeader: 'application/json' }),
      formatResponse: jest.fn().mockImplementation((result: any) => {
        if (!result) {
          return [];
        }
        return result.value ?? [];
      }),
    };

    mockConnection = {
      serverUrl: 'https://dev.azure.com/testorg',
      getPipelinesApi: jest.fn().mockResolvedValue(mockPipelinesApi),
    } as unknown as WebApi;
  });

  it('returns runs with continuation token from headers', async () => {
    mockRestGet.mockResolvedValue({
      statusCode: 200,
      result: { value: sampleRuns },
      headers: { 'x-ms-continuationtoken': 'token-from-header' },
    });

    const result = await listPipelineRuns(mockConnection, {
      projectId: 'test-project',
      pipelineId: 42,
    });

    expect(mockConnection.getPipelinesApi).toHaveBeenCalled();
    expect(mockRestGet).toHaveBeenCalled();
    expect(result.runs).toEqual(sampleRuns);
    expect(result.continuationToken).toBe('token-from-header');

    const [requestUrl] = mockRestGet.mock.calls[0];
    const url = new URL(requestUrl);
    expect(url.searchParams.get('api-version')).toBe('7.1');
    expect(url.searchParams.get('$top')).toBe('50');
  });

  it('applies filters, pagination, and branch normalization', async () => {
    mockRestGet.mockResolvedValue({
      statusCode: 200,
      result: { value: [], continuationToken: 'body-token' },
      headers: {},
    });

    const createdFrom = '2024-01-01T00:00:00Z';
    const createdTo = '2024-01-31T23:59:59Z';

    await listPipelineRuns(mockConnection, {
      projectId: 'test-project',
      pipelineId: 42,
      top: 20,
      continuationToken: 'next-token',
      branch: 'main',
      state: 'completed',
      result: 'succeeded',
      createdFrom,
      createdTo,
      orderBy: 'createdDate asc',
    });

    const [requestUrl] = mockRestGet.mock.calls[0];
    const url = new URL(requestUrl);

    expect(url.searchParams.get('$top')).toBe('20');
    expect(url.searchParams.get('continuationToken')).toBe('next-token');
    expect(url.searchParams.get('branch')).toBe('refs/heads/main');
    expect(url.searchParams.get('state')).toBe('completed');
    expect(url.searchParams.get('result')).toBe('succeeded');
    expect(url.searchParams.get('createdDate/min')).toBe(createdFrom);
    expect(url.searchParams.get('createdDate/max')).toBe(createdTo);
    expect(url.searchParams.get('orderBy')).toBe('createdDate asc');
  });

  it('clamps top to 100 and preserves ref-prefixed branches', async () => {
    mockRestGet.mockResolvedValue({
      statusCode: 200,
      result: { value: [] },
      headers: {},
    });

    await listPipelineRuns(mockConnection, {
      projectId: 'test-project',
      pipelineId: 42,
      top: 150,
      branch: 'refs/heads/develop',
    });

    const [requestUrl] = mockRestGet.mock.calls[0];
    const url = new URL(requestUrl);

    expect(url.searchParams.get('$top')).toBe('100');
    expect(url.searchParams.get('branch')).toBe('refs/heads/develop');
  });

  it('extracts continuation token from body when header missing', async () => {
    mockRestGet.mockResolvedValue({
      statusCode: 200,
      result: { value: [], continuationToken: 'body-token' },
      headers: {},
    });

    const result = await listPipelineRuns(mockConnection, {
      projectId: 'test-project',
      pipelineId: 42,
    });

    expect(result.continuationToken).toBe('body-token');
  });

  it('throws resource not found when API returns 404', async () => {
    mockRestGet.mockResolvedValue({
      statusCode: 404,
      result: null,
      headers: {},
    });

    await expect(
      listPipelineRuns(mockConnection, {
        projectId: 'test-project',
        pipelineId: 999,
      }),
    ).rejects.toBeInstanceOf(AzureDevOpsResourceNotFoundError);
  });

  it('maps authentication errors', async () => {
    mockRestGet.mockRejectedValue(new Error('401 Unauthorized'));

    await expect(
      listPipelineRuns(mockConnection, {
        projectId: 'test-project',
        pipelineId: 42,
      }),
    ).rejects.toBeInstanceOf(AzureDevOpsAuthenticationError);
  });

  it('wraps unexpected errors', async () => {
    mockRestGet.mockRejectedValue(new Error('Boom'));

    await expect(
      listPipelineRuns(mockConnection, {
        projectId: 'test-project',
        pipelineId: 42,
      }),
    ).rejects.toBeInstanceOf(AzureDevOpsError);
  });
});
