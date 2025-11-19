#!/usr/bin/env node
/**
 * Entry point for the Azure DevOps MCP Server
 */

import { createAzureDevOpsServer } from './server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { AzureDevOpsConfig } from './shared/types';
import { AuthenticationMethod } from './shared/auth/auth-factory';
import { DomainsManager } from './shared/domains';

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

/**
 * Parse command line arguments for domains and read-only mode
 */
function parseCliArgs(): {
  domains?: string[];
  readOnly: boolean;
} {
  const args = process.argv.slice(2);
  let domains: string[] | undefined;
  let readOnly = false;

  // Parse --domains argument
  const domainsIndex = args.indexOf('--domains');
  if (domainsIndex > -1) {
    const domainArgs: string[] = [];
    for (let i = domainsIndex + 1; i < args.length; i++) {
      if (args[i].startsWith('--')) break;
      domainArgs.push(args[i]);
    }
    // Flatten comma-separated values
    domains = domainArgs.flatMap((d) => d.split(',').map((v) => v.trim()));
  }

  // Parse --read-only flag
  readOnly = args.includes('--read-only');

  return { domains, readOnly };
}

async function main() {
  try {
    // Parse CLI arguments
    const { domains, readOnly } = parseCliArgs();

    // Create domains manager
    const domainsManager = new DomainsManager(domains);
    const enabledDomains = domainsManager.getEnabledDomains();

    // Log configuration
    process.stderr.write(
      `Domain filtering: ${domains ? `enabled (${Array.from(enabledDomains).join(', ')})` : 'disabled (all domains)'}\n`,
    );
    process.stderr.write(`Read-only mode: ${readOnly ? 'enabled' : 'disabled'}\n`);

    // Create the server with configuration
    const server = createAzureDevOpsServer(getConfig(), enabledDomains, readOnly);

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
