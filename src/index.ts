import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as dotenv from 'dotenv';
import { createAzureDevOpsServer, testConnection } from './server';
import { AzureDevOpsConfig } from './types/config';

// Load environment variables
dotenv.config();

// Log version info
console.log('Azure DevOps MCP Server - Starting up');
console.log('Azure DevOps Node API Version:', require('azure-devops-node-api/package.json').version);
console.log('MCP SDK Version:', require('@modelcontextprotocol/sdk/package.json').version);

// Create the server configuration from environment variables
const config: AzureDevOpsConfig = {
  organizationUrl: process.env.AZURE_DEVOPS_ORG_URL || '',
  personalAccessToken: process.env.AZURE_DEVOPS_PAT || '',
  defaultProject: process.env.AZURE_DEVOPS_DEFAULT_PROJECT,
  apiVersion: process.env.AZURE_DEVOPS_API_VERSION
};

// Validate the required configuration
if (!config.organizationUrl) {
  console.error('Error: AZURE_DEVOPS_ORG_URL environment variable is required');
  process.exit(1);
}

if (!config.personalAccessToken) {
  console.error('Error: AZURE_DEVOPS_PAT environment variable is required');
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
