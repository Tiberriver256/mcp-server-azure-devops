import { WebApi } from 'azure-devops-node-api';
import { listPipelines } from './feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';

describe('listPipelines integration', () => {
  let connection: WebApi | null = null;

  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();

    // TODO: Implement createPipeline functionality and create test pipelines here
    // Currently there is no way to create pipelines, so we can't ensure data exists like in list-work-items tests
    // In the future, we should add code similar to list-work-items to create test pipelines
  });

  it('should list pipelines in a project', async () => {
    // Skip if no connection is available or no project specified
    if (
      shouldSkipIntegrationTest() ||
      !connection ||
      !process.env.AZURE_DEVOPS_PROJECT
    ) {
      console.log(
        'Skipping listPipelines integration test - no connection or project available',
      );
      return;
    }

    const projectId = process.env.AZURE_DEVOPS_PROJECT;

    const pipelines = await listPipelines(connection, { projectId });
    expect(Array.isArray(pipelines)).toBe(true);

    // If there are pipelines, check their structure
    if (pipelines.length > 0) {
      const pipeline = pipelines[0];
      expect(pipeline.id).toBeDefined();
      expect(pipeline.name).toBeDefined();
      expect(pipeline.folder).toBeDefined();
      expect(pipeline.revision).toBeDefined();
      expect(pipeline.url).toBeDefined();
    }
  });
});
