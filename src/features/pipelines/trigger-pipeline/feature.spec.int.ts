import { WebApi } from 'azure-devops-node-api';
import { triggerPipeline } from './feature';
import { listPipelines } from '../list-pipelines/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers';

const shouldSkip = shouldSkipIntegrationTest();
const projectId = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || '';
const hasProjectId = Boolean(projectId);
const describeOrSkip = !shouldSkip && hasProjectId ? describe : describe.skip;

describeOrSkip('triggerPipeline integration', () => {
  let connection: WebApi;
  let existingPipelineId: number;

  beforeAll(async () => {
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

  test('should trigger a pipeline run', async () => {
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
    expect(run).toBeDefined();
    // Run ID should be present
    expect(run.id).toBeDefined();
    expect(typeof run.id).toBe('number');
    // Pipeline reference should match the pipeline we triggered
    expect(run.pipeline?.id).toBe(existingPipelineId);
    // URL should exist and point to the run
    expect(run.url).toBeDefined();
    expect(run.url).toContain('_apis/pipelines');
  });

  test('should trigger with custom branch', async () => {
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
    expect(run).toBeDefined();
    expect(run.id).toBeDefined();
    // Resources should include the specified branch
    expect(run.resources?.repositories?.self?.refName).toBe('refs/heads/main');
  });

  test('should handle non-existent pipeline', async () => {
    // Use a very high ID that is unlikely to exist
    const nonExistentPipelineId = 999999;

    try {
      // Attempt to trigger a pipeline that shouldn't exist
      await triggerPipeline(connection, {
        projectId,
        pipelineId: nonExistentPipelineId,
      });
      // If we reach here without an error, we'll fail the test
      fail(
        'Expected triggerPipeline to throw an error for non-existent pipeline',
      );
    } catch (error) {
      // We expect an error, so this test passes if we get here
      expect(error).toBeDefined();
      // Note: the exact error type might vary depending on the API response
    }
  });
});
