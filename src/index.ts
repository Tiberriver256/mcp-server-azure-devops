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

/**
 * Format org URL for logs: host + pathname only (no secrets).
 */
function formatOrgUrlForLog(organizationUrl: string): string {
  try {
    const url = new URL(organizationUrl);
    const path = url.pathname.replace(/\/$/, '');
    return `${url.host}${path}` || url.host;
  } catch {
    return organizationUrl ? '(invalid org URL)' : '(not set)';
  }
}

/**
 * Describe how AZURE_DEVOPS_DEFAULT_PROJECT was provided.
 */
function describeDefaultProject(envValue: string | undefined): string {
  if (envValue === undefined) {
    return 'omitted';
  }
  if (envValue === '') {
    return 'empty string';
  }
  return `set (${envValue})`;
}

function isDebugLoggingEnabled(): boolean {
  const level = (
    process.env.AZURE_DEVOPS_LOG_LEVEL ||
    process.env.LOG_LEVEL ||
    ''
  ).toLowerCase();
  return level === 'debug';
}

function getConfig(): AzureDevOpsConfig {
  const organizationUrl = process.env.AZURE_DEVOPS_ORG_URL || '';
  const orgDisplay = formatOrgUrlForLog(organizationUrl);
  const authMethod = normalizeAuthMethod(process.env.AZURE_DEVOPS_AUTH_METHOD);
  const apiVersionEnv = process.env.AZURE_DEVOPS_API_VERSION;
  const patPresent = Boolean(process.env.AZURE_DEVOPS_PAT);

  // Always-on one-liner (stdio-safe)
  process.stderr.write(
    `Azure DevOps MCP Server starting (org=${orgDisplay})\n`,
  );

  // Verbose dump only when debug logging is enabled
  if (isDebugLoggingEnabled()) {
    process.stderr.write(`DEBUG - Config:
  org: ${orgDisplay}
  authMethod: ${authMethod}
  patPresent: ${patPresent}
  defaultProject: ${describeDefaultProject(process.env.AZURE_DEVOPS_DEFAULT_PROJECT)}
  apiVersion: ${apiVersionEnv ? `set (${apiVersionEnv})` : 'default'}
\n`);
  }

  return {
    organizationUrl,
    authMethod,
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
