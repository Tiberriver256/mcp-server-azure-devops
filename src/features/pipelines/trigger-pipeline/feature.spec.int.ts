import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { triggerPipeline } from './feature.ts';
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

void describe('triggerPipeline integration', { skip: skipReason }, () => {
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
      throw new Error('No pipelines found for triggerPipeline tests');
    }
    existingPipelineId = pipelineId;
  });

  void test('should trigger a pipeline run', async () => {
    // Arrange - prepare options for running the pipeline
    const options = {
      projectId,
      pipelineId: existingPipelineId,
      // Use previewRun mode to avoid actually triggering pipelines during tests
      previewRun: true,
    };

    // Act - trigger the pipeline
    const run = await triggerPipeline(connection, options);

    // Assert - verify the response
    assert.notStrictEqual(run, undefined);
    // Run ID should be present
    assert.notStrictEqual(run.id, undefined);
    assert.strictEqual(typeof run.id, 'number');
    // Pipeline reference should match the pipeline we triggered
    assert.strictEqual(run.pipeline?.id, existingPipelineId);
    // URL should exist and point to the run
    assert.notStrictEqual(run.url, undefined);
    assert.ok(run.url?.includes('_apis/pipelines'));
  });

  void test('should trigger with custom branch', async () => {
    // Arrange - prepare options with a branch
    const options = {
      projectId,
      pipelineId: existingPipelineId,
      branch: 'main', // Use the main branch
      // Use previewRun mode to avoid actually triggering pipelines during tests
      previewRun: true,
    };

    // Act - trigger the pipeline with custom options
    const run = await triggerPipeline(connection, options);

    // Assert - verify the response
    assert.notStrictEqual(run, undefined);
    assert.notStrictEqual(run.id, undefined);
    // Resources should include the specified branch
    assert.strictEqual(
      run.resources?.repositories?.self?.refName,
      'refs/heads/main',
    );
  });

  void test('should handle non-existent pipeline', async () => {
    const nonExistentPipelineId = 999999;

    await assert.rejects(
      () =>
        triggerPipeline(connection, {
          projectId,
          pipelineId: nonExistentPipelineId,
        }),
      Error,
    );
  });
});
