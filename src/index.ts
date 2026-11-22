#!/usr/bin/env node
/**
 * Entry point for the Azure DevOps MCP Server
 */

import { createAzureDevOpsServer } from './server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { AzureDevOpsConfig } from './shared/types';
import { AuthenticationMethod } from './shared/auth/auth-factory';
import {
  parseBooleanOption,
  parseCliToolFilterArgs,
  parseCsvList,
} from './shared/config/tool-filter';

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
dotenv.config({ quiet: true });

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

function isDebugLoggingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const level = (
    env.AZURE_DEVOPS_LOG_LEVEL ||
    env.LOG_LEVEL ||
    ''
  ).toLowerCase();
  return level === 'debug';
}

export function getConfig(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): AzureDevOpsConfig {
  const organizationUrl = env.AZURE_DEVOPS_ORG_URL || '';
  const orgDisplay = formatOrgUrlForLog(organizationUrl);
  const authMethod = normalizeAuthMethod(env.AZURE_DEVOPS_AUTH_METHOD);
  const apiVersionEnv = env.AZURE_DEVOPS_API_VERSION;
  const patPresent = Boolean(env.AZURE_DEVOPS_PAT);

  const cliFilters = parseCliToolFilterArgs(argv);
  const toolsets =
    cliFilters.toolsets ?? parseCsvList(env.AZURE_DEVOPS_TOOLSETS);
  const enabledTools =
    cliFilters.enabledTools ?? parseCsvList(env.AZURE_DEVOPS_ENABLED_TOOLS);
  const disabledTools =
    cliFilters.disabledTools ?? parseCsvList(env.AZURE_DEVOPS_DISABLED_TOOLS);
  const readOnly =
    cliFilters.readOnly ??
    parseBooleanOption(env.AZURE_DEVOPS_READ_ONLY, 'AZURE_DEVOPS_READ_ONLY');

  // Always-on one-liner (stdio-safe)
  process.stderr.write(
    `Azure DevOps MCP Server starting (org=${orgDisplay})\n`,
  );

  // Verbose dump only when debug logging is enabled
  if (isDebugLoggingEnabled(env)) {
    process.stderr.write(`DEBUG - Config:
  org: ${orgDisplay}
  authMethod: ${authMethod}
  patPresent: ${patPresent}
  defaultProject: ${describeDefaultProject(env.AZURE_DEVOPS_DEFAULT_PROJECT)}
  apiVersion: ${apiVersionEnv ? `set (${apiVersionEnv})` : 'default'}
  toolsets: ${toolsets ? toolsets.join(', ') : 'all'}
  enabledTools: ${enabledTools ? enabledTools.join(', ') : 'all'}
  disabledTools: ${disabledTools ? disabledTools.join(', ') : 'none'}
  readOnly: ${Boolean(readOnly)}
\n`);
  }

  return {
    organizationUrl,
    authMethod,
    personalAccessToken: env.AZURE_DEVOPS_PAT,
    defaultProject: env.AZURE_DEVOPS_DEFAULT_PROJECT,
    apiVersion: env.AZURE_DEVOPS_API_VERSION,
    toolsets,
    enabledTools,
    disabledTools,
    readOnly,
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
  main().catch((error: unknown) => {
    process.stderr.write(`Fatal error in main(): ${error}\n`);
    process.exit(1);
  });
}

// Export the server and related components
export * from './server';
