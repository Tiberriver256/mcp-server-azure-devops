import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { listPipelines } from './feature.ts';
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

void describe('listPipelines integration', { skip: skipReason }, () => {
  let connection: WebApi;

  before(async () => {
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

  void it('should list pipelines in a project', async () => {
    const pipelines = await listPipelines(connection, { projectId });
    assert.strictEqual(Array.isArray(pipelines), true);

    // If there are pipelines, check their structure
    if (pipelines.length > 0) {
      const pipeline = pipelines[0];
      assert.notStrictEqual(pipeline.id, undefined);
      assert.notStrictEqual(pipeline.name, undefined);
      assert.notStrictEqual(pipeline.folder, undefined);
      assert.notStrictEqual(pipeline.revision, undefined);
      assert.notStrictEqual(pipeline.url, undefined);
    }
  });
});
