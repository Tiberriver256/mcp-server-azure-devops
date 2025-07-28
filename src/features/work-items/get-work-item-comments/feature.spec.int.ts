import { WebApi } from 'azure-devops-node-api';
import { getWorkItemComments } from './feature';
import { getTestConnection } from '../../../shared/test/test-helpers';
import { defaultProject } from '../../../utils/environment';

describe('getWorkItemComments', () => {
  let connection: WebApi;

  beforeAll(async () => {
    const conn = await getTestConnection();
    if (!conn) {
      throw new Error('Failed to establish connection');
    }
    connection = conn;
  });

  it('should get comments for a work item', async () => {
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
    await expect(
      getWorkItemComments(connection, defaultProject, 999999),
    ).rejects.toThrow();
  });

  it('should handle pagination parameters', async () => {
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
