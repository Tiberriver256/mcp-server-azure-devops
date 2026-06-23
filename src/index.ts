#!/usr/bin/env node
/**
 * Entry point for the Azure DevOps MCP Server
 */

import { createAzureDevOpsServer } from './server';
import dotenv from 'dotenv';
import { AzureDevOpsConfig } from './shared/types';
import { AuthenticationMethod } from './shared/auth/auth-factory';
import { formatAzureDevOpsError, isAzureDevOpsError } from './shared/errors';
import { getTransportConfig } from './transports/config';
import { runHttpTransport } from './transports/http';
import { runStdioTransport } from './transports/stdio';

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

export function getConfig(
  env: NodeJS.ProcessEnv = process.env,
): AzureDevOpsConfig {
  // Debug log the environment variables to help diagnose issues
  process.stderr.write(`DEBUG - Environment variables in getConfig():
  AZURE_DEVOPS_ORG_URL: ${env.AZURE_DEVOPS_ORG_URL || 'NOT SET'}
  AZURE_DEVOPS_AUTH_METHOD: ${env.AZURE_DEVOPS_AUTH_METHOD || 'NOT SET'}
  AZURE_DEVOPS_PAT: ${env.AZURE_DEVOPS_PAT ? 'SET (hidden)' : 'NOT SET'}
  AZURE_DEVOPS_DEFAULT_PROJECT: ${env.AZURE_DEVOPS_DEFAULT_PROJECT || 'NOT SET'}
  AZURE_DEVOPS_API_VERSION: ${env.AZURE_DEVOPS_API_VERSION || 'NOT SET'}
  MCP_TRANSPORT: ${env.MCP_TRANSPORT || 'NOT SET'}
  MCP_HOST: ${env.MCP_HOST || 'NOT SET'}
  MCP_PORT: ${env.MCP_PORT || 'NOT SET'}
  NODE_ENV: ${env.NODE_ENV || 'NOT SET'}
\n`);

  return {
    organizationUrl: env.AZURE_DEVOPS_ORG_URL || '',
    authMethod: normalizeAuthMethod(env.AZURE_DEVOPS_AUTH_METHOD),
    personalAccessToken: env.AZURE_DEVOPS_PAT,
    defaultProject: env.AZURE_DEVOPS_DEFAULT_PROJECT,
    apiVersion: env.AZURE_DEVOPS_API_VERSION,
  };
}

export async function main(
  args: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
) {
  const config = getConfig(env);
  const transportConfig = getTransportConfig(args, env);

  if (transportConfig.transport === 'http') {
    await runHttpTransport(
      () => createAzureDevOpsServer(config),
      transportConfig,
    );
    return;
  }

  const server = createAzureDevOpsServer(config);
  await runStdioTransport(server);
}

// Start the server when this script is run directly
if (require.main === module) {
  main().catch((error) => {
    const errorMessage = isAzureDevOpsError(error)
      ? formatAzureDevOpsError(error)
      : String(error);

    process.stderr.write(`Fatal error in main(): ${errorMessage}\n`);
    process.exit(1);
  });
}

// Export the server and related components
export * from './server';
