#!/usr/bin/env node
/**
 * Entry point for the Azure DevOps MCP Server
 */

import { createAzureDevOpsServer } from './server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { AzureDevOpsConfig } from './shared/types';
import { AuthenticationMethod } from './shared/auth/auth-factory';

/**
 * Normalize auth method string to a valid AuthenticationMethod enum value
 * in a case-insensitive manner
 *
 * @param authMethodStr The auth method string from environment variable
 * @returns A valid AuthenticationMethod value
 */
export function normalizeAuthMethod(
  authMethodStr?: string,
): AuthenticationMethod {
  if (!authMethodStr) {
    return AuthenticationMethod.AzureIdentity; // Default
  }

  // Convert to lowercase for case-insensitive comparison
  const normalizedMethod = authMethodStr.toLowerCase();

  // Check against known enum values (as lowercase strings)
  if (
    normalizedMethod === AuthenticationMethod.PersonalAccessToken.toLowerCase()
  ) {
    return AuthenticationMethod.PersonalAccessToken;
  } else if (
    normalizedMethod === AuthenticationMethod.AzureIdentity.toLowerCase()
  ) {
    return AuthenticationMethod.AzureIdentity;
  } else if (normalizedMethod === AuthenticationMethod.AzureCli.toLowerCase()) {
    return AuthenticationMethod.AzureCli;
  }

  // If not recognized, log a warning and use the default
  process.stderr.write(
    `WARNING: Unrecognized auth method '${authMethodStr}'. Using default (${AuthenticationMethod.AzureIdentity}).\n`,
  );
  return AuthenticationMethod.AzureIdentity;
}

// Load environment variables
dotenv.config();

function getConfig(): AzureDevOpsConfig {
  // Debug log the environment variables to help diagnose issues
  process.stderr.write(`DEBUG - Environment variables in getConfig():
  AZURE_DEVOPS_ORG_URL: ${process.env.AZURE_DEVOPS_ORG_URL || 'NOT SET'}
  AZURE_DEVOPS_AUTH_METHOD: ${process.env.AZURE_DEVOPS_AUTH_METHOD || 'NOT SET'}
  AZURE_DEVOPS_PAT: ${process.env.AZURE_DEVOPS_PAT ? 'SET (hidden)' : 'NOT SET'}
  AZURE_DEVOPS_DEFAULT_PROJECT: ${process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'NOT SET'}
  AZURE_DEVOPS_API_VERSION: ${process.env.AZURE_DEVOPS_API_VERSION || 'NOT SET'}
  NODE_ENV: ${process.env.NODE_ENV || 'NOT SET'}
\n`);

  return {
    organizationUrl: process.env.AZURE_DEVOPS_ORG_URL || '',
    authMethod: normalizeAuthMethod(process.env.AZURE_DEVOPS_AUTH_METHOD),
    personalAccessToken: process.env.AZURE_DEVOPS_PAT,
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
