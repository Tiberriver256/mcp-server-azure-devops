import assert from 'node:assert/strict';
import { beforeEach, describe, mock, test } from 'node:test';
import type { Mock } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { triggerPipeline } from './feature.ts';
import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors/index.ts';

type RunPipelineFn = (
  runParameters: Record<string, unknown>,
  projectId: string,
  pipelineId: number,
) => Promise<unknown>;

// Unit tests should only focus on isolated logic
void describe('triggerPipeline unit', () => {
  let mockConnection: WebApi;
  let mockGetPipelinesApi: Mock<() => Promise<unknown>>;
  let mockRunPipeline: Mock<RunPipelineFn>;

  beforeEach(() => {
    mockRunPipeline = mock.fn<RunPipelineFn>(() =>
      Promise.reject(new Error('Unexpected runPipeline call')),
    );
    const mockPipelinesApi = {
      runPipeline: mockRunPipeline,
    };
    mockGetPipelinesApi = mock.fn(() => Promise.resolve(mockPipelinesApi));

    // Mock WebApi with a server URL
    mockConnection = {
      serverUrl: 'https://dev.azure.com/testorg',
      getPipelinesApi: mockGetPipelinesApi,
    } as unknown as WebApi;
  });

  void test('should trigger a pipeline with basic options', async () => {
    // Arrange
    const mockRun = { id: 123, name: 'Run 123' };
    mockRunPipeline.mock.mockImplementation(() => Promise.resolve(mockRun));

    // Act
    const result = await triggerPipeline(mockConnection, {
      projectId: 'testproject',
      pipelineId: 4,
      branch: 'main',
    });

    // Assert
    assert.strictEqual(mockGetPipelinesApi.mock.callCount(), 1);
    assert.strictEqual(mockRunPipeline.mock.callCount(), 1);
    const callArgs = mockRunPipeline.mock.calls[0]?.arguments;
    assert.ok(callArgs);
    assert.strictEqual(callArgs.length, 3);
    assert.deepStrictEqual(callArgs[0].resources, {
      repositories: {
        self: {
          refName: 'refs/heads/main',
        },
      },
    });
    assert.strictEqual(callArgs[1], 'testproject');
    assert.strictEqual(callArgs[2], 4);
    assert.strictEqual(result, mockRun);
  });

  void test('should trigger a pipeline with variables', async () => {
    // Arrange
    const mockRun = { id: 123, name: 'Run 123' };
    mockRunPipeline.mock.mockImplementation(() => Promise.resolve(mockRun));

    // Act
    const result = await triggerPipeline(mockConnection, {
      projectId: 'testproject',
      pipelineId: 4,
      variables: {
        var1: { value: 'value1' },
        var2: { value: 'value2', isSecret: true },
      },
    });

    // Assert
    assert.strictEqual(mockRunPipeline.mock.callCount(), 1);
    const callArgs = mockRunPipeline.mock.calls[0]?.arguments;
    assert.ok(callArgs);
    assert.strictEqual(callArgs.length, 3);
    assert.deepStrictEqual(callArgs[0].variables, {
      var1: { value: 'value1' },
      var2: { value: 'value2', isSecret: true },
    });
    assert.strictEqual(callArgs[1], 'testproject');
    assert.strictEqual(callArgs[2], 4);
    assert.strictEqual(result, mockRun);
  });

  void test('should handle authentication errors', async () => {
    // Arrange
    const authError = new Error('Authentication failed');
    mockRunPipeline.mock.mockImplementation(() => Promise.reject(authError));

    // Act & Assert
    await assert.rejects(
      () =>
        triggerPipeline(mockConnection, {
          projectId: 'testproject',
          pipelineId: 4,
        }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsAuthenticationError);
        assert.match(err.message, /Failed to authenticate/);
        return true;
      },
    );
  });

  void test('should handle resource not found errors and null 404 responses', async () => {
    // Arrange
    const notFoundError = new Error('Pipeline not found');
    mockRunPipeline.mock.mockImplementation(() =>
      Promise.reject(notFoundError),
    );

    // Act & Assert
    await assert.rejects(
      () =>
        triggerPipeline(mockConnection, {
          projectId: 'testproject',
          pipelineId: 999,
        }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsResourceNotFoundError);
        assert.match(err.message, /Pipeline or project not found/);
        return true;
      },
    );

    // typed-rest-client resolves HTTP 404 to null instead of rejecting
    mockRunPipeline.mock.mockImplementation(() => Promise.resolve(null));
    await assert.rejects(
      () =>
        triggerPipeline(mockConnection, {
          projectId: 'testproject',
          pipelineId: 999999,
        }),
      AzureDevOpsResourceNotFoundError,
    );
  });

  void test('does not double-prefix refs/heads/ branch values', async () => {
    const mockRun = { id: 124, name: 'Run 124' };
    mockRunPipeline.mock.mockImplementation(() => Promise.resolve(mockRun));

    await triggerPipeline(mockConnection, {
      projectId: 'testproject',
      pipelineId: 4,
      branch: 'refs/heads/release/1.0',
    });

    assert.strictEqual(mockRunPipeline.mock.callCount(), 1);
    const callArgs = mockRunPipeline.mock.calls[0]?.arguments;
    assert.ok(callArgs);
    assert.strictEqual(callArgs.length, 3);
    assert.deepStrictEqual(callArgs[0].resources, {
      repositories: {
        self: {
          refName: 'refs/heads/release/1.0',
        },
      },
    });
    assert.strictEqual(callArgs[1], 'testproject');
    assert.strictEqual(callArgs[2], 4);
  });

  void test('should wrap other errors', async () => {
    // Arrange
    const testError = new Error('Some other error');
    mockRunPipeline.mock.mockImplementation(() => Promise.reject(testError));

    // Act & Assert
    await assert.rejects(
      () =>
        triggerPipeline(mockConnection, {
          projectId: 'testproject',
          pipelineId: 4,
        }),
      (err: unknown) => {
        assert.ok(err instanceof AzureDevOpsError);
        assert.match(err.message, /Failed to trigger pipeline/);
        return true;
      },
    );
  });
});
