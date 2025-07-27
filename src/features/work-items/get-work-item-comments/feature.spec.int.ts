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
    const result = await getWorkItemComments(connection, 1, defaultProject);

    expect(result).toBeDefined();
    expect(result.comments).toBeDefined();
    expect(Array.isArray(result.comments)).toBe(true);
  });

  it('should throw error for non-existent work item', async () => {
    await expect(
      getWorkItemComments(connection, 999999, defaultProject),
    ).rejects.toThrow();
  });

  it('should handle pagination parameters', async () => {
    const result = await getWorkItemComments(connection, 1, defaultProject, 5);

    expect(result).toBeDefined();
    if (result.comments) {
      expect(result.comments.length).toBeLessThanOrEqual(5);
    }
  });
});
