import { WebApi } from 'azure-devops-node-api';
import { createWorkItem } from './feature';
import { getTestConnection, shouldSkipIntegrationTest } from '@/shared/test/test-helpers';
import { CreateWorkItemOptions } from '../types';

describe('createWorkItem integration', () => {
  let connection: WebApi | null = null;
  
  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();
  });
  
  test('should create a new work item in Azure DevOps', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      return;
    }
    
    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error('Connection should be available when test is not skipped');
    }
    
    // Create a unique title using timestamp to avoid conflicts
    const uniqueTitle = `Test Work Item ${new Date().toISOString()}`;
    
    // For a true integration test, use a real project
    const projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
    const workItemType = 'Task'; // Assumes 'Task' type exists in the project
    
    const options: CreateWorkItemOptions = {
      title: uniqueTitle,
      description: 'This is a test work item created by an integration test',
      priority: 2
    };
    
    // Act - make an actual API call to Azure DevOps
    const result = await createWorkItem(connection, projectName, workItemType, options);
    
    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    
    // Verify fields match what we set
    expect(result.fields).toBeDefined();
    if (result.fields) {
      expect(result.fields['System.Title']).toBe(uniqueTitle);
      expect(result.fields['Microsoft.VSTS.Common.Priority']).toBe(2);
    }
  });
  
  test('should create a work item with additional fields', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      return;
    }
    
    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error('Connection should be available when test is not skipped');
    }
    
    // Create a unique title using timestamp to avoid conflicts
    const uniqueTitle = `Test Work Item with Fields ${new Date().toISOString()}`;
    
    // For a true integration test, use a real project
    const projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
    const workItemType = 'Task';
    
    const options: CreateWorkItemOptions = {
      title: uniqueTitle,
      description: 'This is a test work item with additional fields',
      priority: 1,
      additionalFields: {
        'System.Tags': 'Integration Test,Automated'
      }
    };
    
    // Act - make an actual API call to Azure DevOps
    const result = await createWorkItem(connection, projectName, workItemType, options);
    
    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    
    // Verify fields match what we set
    expect(result.fields).toBeDefined();
    if (result.fields) {
      expect(result.fields['System.Title']).toBe(uniqueTitle);
      expect(result.fields['Microsoft.VSTS.Common.Priority']).toBe(1);
      expect(result.fields['System.Tags']).toBe('Integration Test; Automated');
    }
  });
}); 