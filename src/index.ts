import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as dotenv from 'dotenv';
import { createAzureDevOpsServer, testConnection } from './server';
import { AzureDevOpsConfig } from './types/config';
import { AuthenticationMethod } from './auth';

// Create a safe console logging function that won't interfere with MCP protocol
function safeLog(message: string) {
  process.stderr.write(`${message}\n`);
}

// Load environment variables
dotenv.config();

// Log version info
safeLog('Azure DevOps MCP Server - Starting up');
safeLog(`Azure DevOps Node API Version: ${require('azure-devops-node-api/package.json').version}`);
safeLog(`MCP SDK Version: ${require('@modelcontextprotocol/sdk/package.json').version}`);

// Determine the authentication method from environment variables
let authMethod = AuthenticationMethod.AzureIdentity; // Default to Azure Identity
safeLog('Using Azure Identity authentication by default');
if (process.env.AZURE_DEVOPS_AUTH_METHOD) {
  const method = process.env.AZURE_DEVOPS_AUTH_METHOD.toLowerCase();
  if (method === 'azure-identity') {
    authMethod = AuthenticationMethod.AzureIdentity;
    safeLog('Using Azure Identity authentication');
  } else if (method === 'azure-cli') {
    authMethod = AuthenticationMethod.AzureCli;
    safeLog('Using Azure CLI authentication');
  } else if (method === 'pat') {
    authMethod = AuthenticationMethod.PersonalAccessToken;
    safeLog('Using Personal Access Token authentication');
  } else {
    safeLog(`Unknown authentication method: ${method}, falling back to Azure Identity`);
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
  safeLog('Error: AZURE_DEVOPS_ORG_URL environment variable is required');
  process.exit(1);
}

// Validate PAT if using PAT authentication
if (config.authMethod === AuthenticationMethod.PersonalAccessToken && !config.personalAccessToken) {
  safeLog('Error: AZURE_DEVOPS_PAT environment variable is required when using PAT authentication');
  process.exit(1);
}

// Create the server
export const server = createAzureDevOpsServer(config);

// Run the server
export async function runServer() {
  // Test the connection to Azure DevOps
  const connectionSuccessful = await testConnection(config);
  
  if (!connectionSuccessful) {
    safeLog('Error: Failed to connect to Azure DevOps API');
    process.exit(1);
  }
  
  safeLog('Successfully connected to Azure DevOps API');
  safeLog(`Organization URL: ${config.organizationUrl}`);
  safeLog(`Authentication Method: ${config.authMethod}`);
  
  if (config.defaultProject) {
    safeLog(`Default Project: ${config.defaultProject}`);
  }
  
  // Connect the server to the stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  safeLog('Azure DevOps MCP Server running on stdio');
}

// Start the server
runServer().catch(error => {
  safeLog(`Fatal error in main(): ${error}`);
  process.exit(1);
});
