#!/usr/bin/env node
/**
 * Entry point for the Azure DevOps MCP Server
 */

import { realpathSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { getCallSites } from 'util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAzureDevOpsServer } from './server.ts';
import type { AzureDevOpsConfig } from './shared/types/index.ts';
import { normalizeAuthMethod } from './shared/auth/index.ts';
import { formatOrgUrlForLog } from './shared/azure-devops-url.ts';
import {
  loadEnvFile,
  parseBooleanOption,
  parseCliToolFilterArgs,
  parseCsvList,
} from './shared/config/index.ts';
import { redactSecrets } from './shared/errors/index.ts';
import {
  logDebug,
  logError,
  logInfo,
  resolveLogLevel,
} from './shared/logging.ts';

export { normalizeAuthMethod };

function describeDefaultProject(envValue: string | undefined): string {
  if (envValue === undefined) {
    return 'omitted';
  }
  if (envValue === '') {
    return 'empty string';
  }
  return `set (${envValue})`;
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
  const spotlightingEnv = parseBooleanOption(
    env.AZURE_DEVOPS_SPOTLIGHTING,
    'AZURE_DEVOPS_SPOTLIGHTING',
  );
  const spotlighting = cliFilters.spotlighting ?? spotlightingEnv ?? true;

  logInfo(`Azure DevOps MCP Server starting (org=${orgDisplay})`, env);

  logDebug(
    `DEBUG - Config:
  org: ${orgDisplay}
  authMethod: ${authMethod}
  pat: ${patPresent ? 'set' : 'not set'}
  defaultProject: ${describeDefaultProject(env.AZURE_DEVOPS_DEFAULT_PROJECT)}
  apiVersion: ${apiVersionEnv || '7.1 (default)'}
  toolsets: ${toolsets ? toolsets.join(',') : 'all'}
  enabledTools: ${enabledTools ? enabledTools.join(',') : 'all'}
  disabledTools: ${disabledTools ? disabledTools.join(',') : 'none'}
  readOnly: ${readOnly === true ? 'true' : 'false'}
  spotlighting: ${spotlighting ? 'true' : 'false'}`,
    resolveLogLevel(env) === 'debug',
  );

  return {
    organizationUrl,
    authMethod,
    personalAccessToken: env.AZURE_DEVOPS_PAT,
    defaultProject: env.AZURE_DEVOPS_DEFAULT_PROJECT,
    apiVersion: apiVersionEnv,
    toolsets,
    enabledTools,
    disabledTools,
    readOnly,
    spotlighting,
  };
}

async function main() {
  try {
    // Load environment variables from .env if present (only on CLI startup, not on import)
    loadEnvFile();
    const server = createAzureDevOpsServer(getConfig());
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logInfo('Azure DevOps MCP Server running on stdio');
  } catch (error) {
    const safeMessage = redactSecrets(
      error instanceof Error ? error.message : String(error),
    );
    logError(`Fatal error in main(): ${safeMessage}`);
    process.exit(1);
  }
}

function isMainEntrypoint(): boolean {
  const globalRequire: unknown = Object.getOwnPropertyDescriptor(
    globalThis,
    'require',
  )?.value;
  const globalModule: unknown = Object.getOwnPropertyDescriptor(
    globalThis,
    'module',
  )?.value;
  if (
    typeof require === 'function' &&
    typeof module === 'object' &&
    module !== null &&
    require !== globalRequire &&
    module !== globalModule
  ) {
    return require.main === module;
  }
  const entry = process.argv[1];
  const scriptName = getCallSites(1)[0]?.scriptName;
  if (!entry || !scriptName) {
    return false;
  }
  const currentPath = scriptName.startsWith('file://')
    ? fileURLToPath(scriptName)
    : scriptName;
  try {
    return realpathSync(entry) === realpathSync(currentPath);
  } catch {
    return resolve(entry) === resolve(currentPath);
  }
}

if (isMainEntrypoint()) {
  main().catch((error: unknown) => {
    const safeMessage = redactSecrets(
      error instanceof Error ? error.message : String(error),
    );
    logError(`Fatal error in main(): ${safeMessage}`);
    process.exit(1);
  });
}
