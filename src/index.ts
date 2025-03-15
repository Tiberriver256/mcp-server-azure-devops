import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as dotenv from 'dotenv';
import { createAzureDevOpsServer, testConnection } from './server';
import { AzureDevOpsConfig } from './types/config';
import { AuthenticationMethod } from './auth';

// Load environment variables
dotenv.config();

// Log version info
console.log('Azure DevOps MCP Server - Starting up');
console.log('Azure DevOps Node API Version:', require('azure-devops-node-api/package.json').version);
console.log('MCP SDK Version:', require('@modelcontextprotocol/sdk/package.json').version);

// Determine the authentication method from environment variables
let authMethod = AuthenticationMethod.PersonalAccessToken; // Default to PAT
if (process.env.AZURE_DEVOPS_AUTH_METHOD) {
  const method = process.env.AZURE_DEVOPS_AUTH_METHOD.toLowerCase();
  if (method === 'azure-identity') {
    authMethod = AuthenticationMethod.AzureIdentity;
    console.log('Using Azure Identity authentication');
  } else if (method === 'azure-cli') {
    authMethod = AuthenticationMethod.AzureCli;
    console.log('Using Azure CLI authentication');
  } else if (method === 'pat') {
    authMethod = AuthenticationMethod.PersonalAccessToken;
    console.log('Using Personal Access Token authentication');
  } else {
    console.warn(`Unknown authentication method: ${method}, falling back to PAT`);
  }
}

// Create the server configuration from environment variables
const config: AzureDevOpsConfig = {
  organizationUrl: process.env.AZURE_DEVOPS_ORG_URL || '',
  authMethod: authMethod,
  personalAccessToken: process.env.AZURE_DEVOPS_PAT,
  defaultProject: process.env.AZURE_DEVOPS_DEFAULT_PROJECT,
  apiVersion: process.env.AZURE_DEVOPS_API_VERSION
};

// Validate the required configuration
if (!config.organizationUrl) {
  console.error('Error: AZURE_DEVOPS_ORG_URL environment variable is required');
  process.exit(1);
}

// Validate PAT if using PAT authentication
if (config.authMethod === AuthenticationMethod.PersonalAccessToken && !config.personalAccessToken) {
  console.error('Error: AZURE_DEVOPS_PAT environment variable is required when using PAT authentication');
  process.exit(1);
}

// Create the server
export const server = createAzureDevOpsServer(config);

// Run the server
export async function runServer() {
  // Test the connection to Azure DevOps
  const connectionSuccessful = await testConnection(config);
  
  if (!connectionSuccessful) {
    console.error('Error: Failed to connect to Azure DevOps API');
    process.exit(1);
  }
  
  console.log('Successfully connected to Azure DevOps API');
  console.log(`Organization URL: ${config.organizationUrl}`);
  console.log(`Authentication Method: ${config.authMethod}`);
  
  if (config.defaultProject) {
    console.log(`Default Project: ${config.defaultProject}`);
  }
  
  // Connect the server to the stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.log('Azure DevOps MCP Server running on stdio');
}

// Start the server
runServer().catch(error => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
