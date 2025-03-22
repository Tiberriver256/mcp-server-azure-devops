import { WebApi } from 'azure-devops-node-api';
import { getWorkItem } from './feature';
import { getTestConnection, shouldSkipIntegrationTest } from '../__test__/test-helpers';
import { WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';

describe('getWorkItem integration', () => {
  let connection: WebApi | null = null;
  
  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();
  });
  
  // This test requires that work item #1 exists in the default project
  test('should retrieve a real work item from Azure DevOps', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      return;
    }
    
    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error('Connection should be available when test is not skipped');
    }
    
    // For a true integration test, use a known work item ID that exists
    const workItemId = 1; // This assumes work item #1 exists in your project
    
    // Act - make an actual API call to Azure DevOps
    const result = await getWorkItem(connection, workItemId);
    
    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.id).toBe(workItemId);
    
    // Verify fields exist
    expect(result.fields).toBeDefined();
    if (result.fields) {
      // Don't make assumptions about specific field values, just verify structure
      expect(result.fields['System.Title']).toBeDefined();
    }
  });
  
  test('should retrieve work item with expanded relations', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      return;
    }
    
    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error('Connection should be available when test is not skipped');
    }
    
    // For a true integration test, use a known work item ID that exists
    const workItemId = 1; // This assumes work item #1 exists in your project
    
    // Act - make an actual API call to Azure DevOps with expanded relations
    const result = await getWorkItem(connection, workItemId, WorkItemExpand.Relations);
    
    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.id).toBe(workItemId);
    
    // When using expand, we may get additional information beyond just fields
    // For example, revision, url, _links, etc.
    expect(result._links || result.url || result.rev).toBeTruthy();
    
    // Verify fields exist
    expect(result.fields).toBeDefined();
    if (result.fields) {
      expect(result.fields['System.Title']).toBeDefined();
    }
  });
}); 