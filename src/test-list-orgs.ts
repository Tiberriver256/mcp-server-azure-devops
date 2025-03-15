import { AuthenticationMethod } from './auth';
import { listOrganizations } from './operations/organizations';

/**
 * Test listing Azure DevOps organizations using Azure Identity
 */
async function testListOrganizations() {
  try {
    console.log('Testing listing organizations with Azure Identity...');
    
    const result = await listOrganizations({
      organizationUrl: 'https://dev.azure.com/unused', // This URL isn't actually used for listing organizations
      authMethod: AuthenticationMethod.AzureIdentity
    });
    
    console.log('Organizations found:', result.length);
    console.log('Organizations:', result);
    
  } catch (error) {
    console.error('Error listing organizations:', error);
  }
}

// Run the test
testListOrganizations().catch(console.error); 