import { WebApi } from 'azure-devops-node-api';
import { getWorkItemComments } from './feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers';
import { defaultProject } from '../../../utils/environment';

// Skip tests if no PAT is available
const hasPat = process.env.AZURE_DEVOPS_PAT && process.env.AZURE_DEVOPS_ORG_URL;
const describeOrSkip = hasPat ? describe : describe.skip;

describeOrSkip('getWorkItemComments (Integration)', () => {
  let connection: WebApi;

  beforeAll(async () => {
    if (shouldSkipIntegrationTest()) {
      return;
    }

    const conn = await getTestConnection();
    if (!conn) {
      throw new Error('Failed to establish connection');
    }
    connection = conn;
  });

  // Skip all tests if integration tests are disabled
  beforeEach(() => {
    if (shouldSkipIntegrationTest()) {
      jest.resetAllMocks();
      return;
    }
  });

  it('should get comments for a work item', async () => {
    // Skip test if integration tests are disabled
    if (shouldSkipIntegrationTest()) {
      return;
    }

    // This test requires a valid work item ID to exist in the project.
    // Please replace 1 with a valid work item ID.
    const result = await getWorkItemComments(connection, defaultProject, 1, {
      top: 1,
    });

    expect(result).toBeDefined();
    expect(result.comments).toBeDefined();
    expect(Array.isArray(result.comments)).toBe(true);
  });

  it('should throw error for non-existent work item', async () => {
    // Skip test if integration tests are disabled
    if (shouldSkipIntegrationTest()) {
      return;
    }

    await expect(
      getWorkItemComments(connection, defaultProject, 999999),
    ).rejects.toThrow();
  });

  it('should handle pagination parameters', async () => {
    // Skip test if integration tests are disabled
    if (shouldSkipIntegrationTest()) {
      return;
    }

    // This test requires a valid work item ID to exist in the project.
    // Please replace 1 with a valid work item ID.
    const result = await getWorkItemComments(connection, defaultProject, 1, {
      top: 5,
    });

    expect(result).toBeDefined();
    if (result.comments) {
      expect(result.comments.length).toBeLessThanOrEqual(5);
    }
  });
});
