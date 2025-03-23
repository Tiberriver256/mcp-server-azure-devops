#!/usr/bin/env node
/**
 * Entry point for the Azure DevOps MCP Server
 */

import { createAzureDevOpsServer } from './server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { AzureDevOpsConfig } from './shared/types';

// Load environment variables
dotenv.config();

function getConfig(): AzureDevOpsConfig {
  return {
    organizationUrl: process.env.AZURE_DEVOPS_ORG_URL || '',
    authMethod: (process.env.AZURE_DEVOPS_AUTH_METHOD || 'pat') as any,
    personalAccessToken: process.env.AZURE_DEVOPS_PAT || '',
    defaultProject: process.env.AZURE_DEVOPS_DEFAULT_PROJECT,
    apiVersion: process.env.AZURE_DEVOPS_API_VERSION,
  };
}

async function main() {
  try {
    // Create the server with configuration
    const server = createAzureDevOpsServer(getConfig());
    
    // Connect to stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    process.stderr.write('Azure DevOps MCP Server running on stdio\n');
  } catch (error) {
    process.stderr.write(`Error starting server: ${error}\n`);
    process.exit(1);
  }
}

// Start the server when this script is run directly
if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Fatal error in main(): ${error}\n`);
    process.exit(1);
  });
}

// Export the server and related components
export * from './server'; 