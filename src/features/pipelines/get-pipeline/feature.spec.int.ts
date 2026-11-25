import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { getPipeline } from './feature.ts';
import { listPipelines } from '../list-pipelines/feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';

const shouldSkip = shouldSkipIntegrationTest();
const projectId = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || '';
const skipReason = shouldSkip
  ? 'No real Azure DevOps connection available'
  : !projectId
    ? 'AZURE_DEVOPS_DEFAULT_PROJECT is not set'
    : false;

void describe('getPipeline integration', { skip: skipReason }, () => {
  let connection: WebApi;
  let existingPipelineId: number;

  before(async () => {
    // Get a real connection using environment variables
    const testConnection = await getTestConnection();
    if (!testConnection) {
      throw new Error(
        'Connection should be available when integration tests are enabled',
      );
    }
    connection = testConnection;

    // Try to get an existing pipeline ID for testing
    const pipelines = await listPipelines(connection, { projectId });
    const pipelineId = pipelines[0]?.id;
    if (!pipelineId) {
      throw new Error('No pipelines found for getPipeline tests');
    }
    existingPipelineId = pipelineId;
  });

  void test('should get a pipeline by ID', async () => {
    // Act - make an API call to Azure DevOps
    const pipeline = await getPipeline(connection, {
      projectId,
      pipelineId: existingPipelineId,
    });

    // Assert
    assert.notStrictEqual(pipeline, undefined);
    assert.strictEqual(pipeline.id, existingPipelineId);
    assert.notStrictEqual(pipeline.name, undefined);
    assert.strictEqual(typeof pipeline.name, 'string');
    assert.notStrictEqual(pipeline.folder, undefined);
    assert.notStrictEqual(pipeline.revision, undefined);
    assert.notStrictEqual(pipeline.url, undefined);
    assert.ok(pipeline.url?.includes('_apis/pipelines'));
  });

  void test('should throw ResourceNotFoundError for non-existent pipeline', async () => {
    // Use a very high ID that is unlikely to exist
    const nonExistentPipelineId = 999999;

    // Act & Assert - should throw a not found error
    await assert.rejects(
      () =>
        getPipeline(connection, {
          projectId,
          pipelineId: nonExistentPipelineId,
        }),
      /not found/,
    );
  });
});
