import { DefaultAzureCredential, AzureCliCredential, ChainedTokenCredential } from '@azure/identity';
import { WebApi } from 'azure-devops-node-api';
import { BearerCredentialHandler } from 'azure-devops-node-api/handlers/bearertoken';

/**
 * Test Azure Identity authentication with Azure DevOps
 */
async function testAzureIdentity() {
  try {
    console.log('Testing Azure Identity authentication...');
    
    // Test DefaultAzureCredential
    console.log('Testing DefaultAzureCredential...');
    const defaultCredential = new DefaultAzureCredential();
    await testCredential('DefaultAzureCredential', defaultCredential);
    
    // Test AzureCliCredential
    console.log('Testing AzureCliCredential...');
    const cliCredential = new AzureCliCredential();
    await testCredential('AzureCliCredential', cliCredential);
    
    // Test ChainedTokenCredential with AzureCliCredential as fallback
    console.log('Testing ChainedTokenCredential...');
    const chainedCredential = new ChainedTokenCredential(
      new AzureCliCredential()
    );
    await testCredential('ChainedTokenCredential', chainedCredential);
    
  } catch (error) {
    console.error('Error testing Azure Identity:', error);
  }
}

/**
 * Test a specific credential with Azure DevOps
 * 
 * @param name The name of the credential
 * @param credential The credential to test
 */
async function testCredential(name: string, credential: any) {
  try {
    // Azure DevOps requires the 499b84ac-1321-427f-aa17-267ca6975798/.default scope
    // This is the Azure DevOps resource ID
    const azureDevOpsResourceId = '499b84ac-1321-427f-aa17-267ca6975798';
    const token = await credential.getToken(`${azureDevOpsResourceId}/.default`);
    
    console.log(`${name} token acquired:`, token ? 'Success' : 'Failed');
    
    if (token) {
      // Test the token with Azure DevOps
      const orgUrl = process.env.AZURE_DEVOPS_ORG_URL || '';
      if (!orgUrl) {
        console.error('AZURE_DEVOPS_ORG_URL environment variable is required');
        return;
      }
      
      console.log(`Testing ${name} with Azure DevOps API...`);
      const authHandler = new BearerCredentialHandler(token.token);
      const connection = new WebApi(orgUrl, authHandler);
      
      // Test the connection
      const coreApi = await connection.getCoreApi();
      const projects = await coreApi.getProjects();
      
      console.log(`${name} connection successful. Found ${projects.length} projects.`);
      console.log('Projects:', projects.map(p => p.name).join(', '));
    }
  } catch (error) {
    console.error(`Error testing ${name}:`, error);
  }
}

// Run the test
testAzureIdentity().catch(console.error); 