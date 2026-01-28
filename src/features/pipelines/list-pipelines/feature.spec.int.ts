import { WebApi } from 'azure-devops-node-api';
import { listPipelines } from './feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers';

const shouldSkip = shouldSkipIntegrationTest();
const projectId = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || '';
const hasProjectId = Boolean(projectId);
const describeOrSkip = !shouldSkip && hasProjectId ? describe : describe.skip;

describeOrSkip('listPipelines integration', () => {
  let connection: WebApi;

  beforeAll(async () => {
    // Get a real connection using environment variables
    const testConnection = await getTestConnection();
    if (!testConnection) {
      throw new Error(
        'Connection should be available when integration tests are enabled',
      );
    }
    connection = testConnection;

    // TODO: Implement createPipeline functionality and create test pipelines here
    // Currently there is no way to create pipelines, so we can't ensure data exists like in list-work-items tests
    // In the future, we should add code similar to list-work-items to create test pipelines
  });

  it('should list pipelines in a project', async () => {
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
