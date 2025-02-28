import { WebApi } from 'azure-devops-node-api';
import * as dotenv from 'dotenv';
import { getPersonalAccessTokenHandler } from 'azure-devops-node-api';

// Load environment variables
dotenv.config();

// This is a simple test file to verify that the Azure DevOps API can be used
// It's not meant to be run in production, just for testing during development

async function testAzureDevOpsApi() {
  console.log('Testing Azure DevOps API...');
  
  // Check if the PAT is set
  const pat = process.env.AZURE_DEVOPS_PAT;
  if (!pat) {
    console.log('AZURE_DEVOPS_PAT environment variable is not set. Skipping API test.');
    return;
  }
  
  // Check if the organization is set
  const org = process.env.AZURE_DEVOPS_ORG;
  if (!org) {
    console.log('AZURE_DEVOPS_ORG environment variable is not set. Skipping API test.');
    return;
  }
  
  try {
    // Create a connection to Azure DevOps
    const orgUrl = `https://dev.azure.com/${org}`;
    const authHandler = getPersonalAccessTokenHandler(pat);
    const webApi = new WebApi(orgUrl, authHandler);
    
    // Get the Core API
    const coreApi = await webApi.getCoreApi();
    
    // List projects
    console.log(`Listing projects for organization: ${org}`);
    const projects = await coreApi.getProjects();
    
    if (projects && projects.length > 0) {
      console.log(`Found ${projects.length} projects:`);
      projects.forEach(project => {
        console.log(`- ${project.name} (${project.id})`);
      });
    } else {
      console.log('No projects found.');
    }
    
    console.log('Azure DevOps API test completed successfully.');
  } catch (error) {
    console.error('Error testing Azure DevOps API:', error);
  }
}

// Run the test
testAzureDevOpsApi(); 