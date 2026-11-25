#!/usr/bin/env node
/**
 * Entry point for the Azure DevOps MCP Server
 */

import type { IncomingMessage } from 'node:http';
import { realpathSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { getCallSites } from 'util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAzureDevOpsServer } from './server.ts';
import type { AzureDevOpsConfig } from './shared/types/index.ts';
import {
  AuthenticationMethod,
  normalizeAuthMethod,
} from './shared/auth/index.ts';
import { formatOrgUrlForLog } from './shared/azure-devops-url.ts';
import {
  VERSION,
  loadEnvFile,
  parseBooleanOption,
  parseCliRuntimeArgs,
  parseCsvList,
  resolveServerRuntimeOptions,
} from './shared/config/index.ts';
import type { ResolvedServerRuntimeOptions } from './shared/config/index.ts';
import { redactSecrets } from './shared/errors/index.ts';
import { EventEngine, verifyWebhookAuth } from './shared/events/index.ts';
import {
  logDebug,
  logError,
  logInfo,
  resolveLogLevel,
} from './shared/logging.ts';
import { startStreamableHttpServer } from './transport/index.ts';
import type {
  HttpServerFactoryOverrides,
  HttpServerFactoryResult,
  WebhookHandlerResult,
} from './transport/index.ts';

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

export function getRuntimeConfig(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): {
  config: AzureDevOpsConfig;
  runtime: ResolvedServerRuntimeOptions;
} {
  const organizationUrl = env.AZURE_DEVOPS_ORG_URL || '';
  const orgDisplay = formatOrgUrlForLog(organizationUrl);
  const authMethod = normalizeAuthMethod(env.AZURE_DEVOPS_AUTH_METHOD);
  const apiVersionEnv = env.AZURE_DEVOPS_API_VERSION;
  const patPresent = Boolean(env.AZURE_DEVOPS_PAT);

  const cli = parseCliRuntimeArgs(argv);
  const runtime = resolveServerRuntimeOptions(cli, env);
  const toolsets = cli.toolsets ?? parseCsvList(env.AZURE_DEVOPS_TOOLSETS);
  const enabledTools =
    cli.enabledTools ?? parseCsvList(env.AZURE_DEVOPS_ENABLED_TOOLS);
  const disabledTools =
    cli.disabledTools ?? parseCsvList(env.AZURE_DEVOPS_DISABLED_TOOLS);
  const readOnly =
    cli.readOnly ??
    parseBooleanOption(env.AZURE_DEVOPS_READ_ONLY, 'AZURE_DEVOPS_READ_ONLY');
  const spotlightingEnv = parseBooleanOption(
    env.AZURE_DEVOPS_SPOTLIGHTING,
    'AZURE_DEVOPS_SPOTLIGHTING',
  );
  const spotlighting = cli.spotlighting ?? spotlightingEnv ?? true;

  logInfo(`Azure DevOps MCP Server starting (org=${orgDisplay})`, env);

  logDebug(
    `DEBUG - Config:
  org: ${orgDisplay}
  authMethod: ${authMethod}
  pat: ${patPresent ? 'set' : 'not set'}
  defaultProject: ${describeDefaultProject(env.AZURE_DEVOPS_DEFAULT_PROJECT)}
  apiVersion: ${apiVersionEnv || '7.1 (default)'}
  transport: ${runtime.transport}
  toolsets: ${toolsets ? toolsets.join(',') : 'all'}
  enabledTools: ${enabledTools ? enabledTools.join(',') : 'all'}
  disabledTools: ${disabledTools ? disabledTools.join(',') : 'none'}
  readOnly: ${readOnly === true ? 'true' : 'false'}
  spotlighting: ${spotlighting ? 'true' : 'false'}
  eventPollIntervalMs: ${runtime.eventPollIntervalMs}
  eventBufferSize: ${runtime.eventBufferSize}`,
    resolveLogLevel(env) === 'debug',
  );

  return {
    config: {
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
      eventPollIntervalMs: runtime.eventPollIntervalMs,
      eventBufferSize: runtime.eventBufferSize,
    },
    runtime,
  };
}

export function getConfig(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): AzureDevOpsConfig {
  return getRuntimeConfig(argv, env).config;
}

export function shouldRequirePerRequestPat(
  config: AzureDevOpsConfig,
  allowPerRequestPat: boolean,
): boolean {
  return (
    allowPerRequestPat &&
    config.authMethod === AuthenticationMethod.PersonalAccessToken &&
    !(
      typeof config.personalAccessToken === 'string' &&
      config.personalAccessToken.trim().length > 0
    )
  );
}

export function buildStartupProbeConfig(
  config: AzureDevOpsConfig,
  allowPerRequestPat: boolean,
): AzureDevOpsConfig {
  if (shouldRequirePerRequestPat(config, allowPerRequestPat)) {
    return {
      ...config,
      personalAccessToken: 'per-request-pat-startup-probe-placeholder',
    };
  }
  return config;
}

export function buildEffectiveHttpSessionConfig(
  config: AzureDevOpsConfig,
  overrides: Pick<
    HttpServerFactoryOverrides,
    'personalAccessToken' | 'disabledTools'
  >,
): AzureDevOpsConfig {
  const mergedDisabled = Array.from(
    new Set([...(config.disabledTools ?? []), ...overrides.disabledTools]),
  );
  return {
    ...config,
    ...(overrides.personalAccessToken
      ? {
          authMethod: AuthenticationMethod.PersonalAccessToken,
          personalAccessToken: overrides.personalAccessToken,
        }
      : {}),
    disabledTools: mergedDisabled,
  };
}

export function createHttpServerFactory(
  config: AzureDevOpsConfig,
  runtime: Pick<
    ResolvedServerRuntimeOptions,
    'allowPerRequestPat' | 'eventBufferSize' | 'eventPollIntervalMs'
  >,
  sharedEventEngine: EventEngine,
): (overrides: HttpServerFactoryOverrides) => HttpServerFactoryResult {
  return ({ personalAccessToken, disabledTools, sessionId }) => {
    const effectiveConfig = buildEffectiveHttpSessionConfig(config, {
      personalAccessToken,
      disabledTools,
    });
    const isolatedEventEngine =
      runtime.allowPerRequestPat && personalAccessToken
        ? new EventEngine({
            bufferSize: runtime.eventBufferSize,
            pollIntervalMs: runtime.eventPollIntervalMs,
          })
        : undefined;
    const sessionEventEngine = isolatedEventEngine ?? sharedEventEngine;
    const server = createAzureDevOpsServer(effectiveConfig, {
      eventEngine: sessionEventEngine,
      sessionId,
    });
    return {
      server,
      cleanup: () => {
        if (isolatedEventEngine) {
          isolatedEventEngine.close();
        } else if (sessionId) {
          sharedEventEngine.cleanupSession(sessionId);
        }
      },
    };
  };
}

export function createHttpWebhookHandler(
  eventEngine: EventEngine,
  secret: string,
): (req: IncomingMessage, rawBody: Buffer) => Promise<WebhookHandlerResult> {
  return (req, rawBody) => {
    if (!verifyWebhookAuth(req.headers, rawBody, secret)) {
      return Promise.resolve({
        status: 401,
        body: { error: 'Unauthorized webhook request' },
      });
    }

    const rawText = rawBody.toString('utf8');
    if (rawText.trim().length === 0) {
      return Promise.resolve({
        status: 400,
        body: { error: 'Invalid JSON payload' },
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return Promise.resolve({
        status: 400,
        body: { error: 'Invalid JSON payload' },
      });
    }

    const result = eventEngine.ingestWebhook(parsed);
    if (result.kind === 'test') {
      return Promise.resolve({
        status: 200,
        body: { ok: true, kind: 'test' },
      });
    }
    if (result.kind === 'ignored') {
      return Promise.resolve({
        status: 200,
        body: {
          ok: true,
          kind: 'ignored',
          reason: result.reason,
        },
      });
    }
    return Promise.resolve({
      status: 200,
      body: {
        ok: true,
        kind: 'event',
        cursor: result.entry.cursor,
        event: result.entry.item.name,
      },
    });
  };
}

async function main() {
  try {
    // Load environment variables from .env if present (only on CLI startup, not on import)
    loadEnvFile();
    const { config, runtime } = getRuntimeConfig();

    const eventEngine = new EventEngine({
      bufferSize: runtime.eventBufferSize,
      pollIntervalMs: runtime.eventPollIntervalMs,
    });

    if (runtime.transport === 'http') {
      // Fail fast on invalid Azure DevOps config before binding HTTP port
      const probeConfig = buildStartupProbeConfig(
        config,
        runtime.allowPerRequestPat,
      );
      const probeServer = createAzureDevOpsServer(probeConfig, {
        eventEngine,
        sessionId: 'startup-validation-probe',
      });
      await probeServer.close();

      const requirePerRequestPat = shouldRequirePerRequestPat(
        config,
        runtime.allowPerRequestPat,
      );

      const started = await startStreamableHttpServer({
        host: runtime.host,
        port: runtime.port,
        path: runtime.httpPath,
        mode: runtime.httpMode,
        enableJsonResponse: runtime.enableJsonResponse,
        allowedHosts: runtime.allowedHosts
          ? [...runtime.allowedHosts]
          : undefined,
        allowedOrigins: runtime.allowedOrigins
          ? [...runtime.allowedOrigins]
          : undefined,
        trustedProxies: runtime.trustedProxies
          ? [...runtime.trustedProxies]
          : undefined,
        authToken: runtime.httpAuthToken,
        allowPerRequestPat: runtime.allowPerRequestPat,
        requirePerRequestPat,
        allowUnauthenticated: runtime.allowUnauthenticated,
        webhookSecret: runtime.webhookSecret,
        version: VERSION,
        createServer: createHttpServerFactory(config, runtime, eventEngine),
        onWebhookRequest: runtime.webhookSecret
          ? createHttpWebhookHandler(eventEngine, runtime.webhookSecret)
          : undefined,
      });

      let shuttingDown = false;
      const shutdown = async (signal: string) => {
        if (shuttingDown) {
          return;
        }
        shuttingDown = true;
        logInfo(`Received ${signal}; draining HTTP MCP server...`);
        try {
          await started.close();
          eventEngine.close();
          process.exit(0);
        } catch (err) {
          const safeMsg = redactSecrets(
            err instanceof Error ? err.message : String(err),
          );
          logError(`Error during graceful shutdown: ${safeMsg}`);
          process.exit(1);
        }
      };

      process.once('SIGTERM', () => {
        void shutdown('SIGTERM');
      });
      process.once('SIGINT', () => {
        void shutdown('SIGINT');
      });
      return;
    }

    const server = createAzureDevOpsServer(config, {
      eventEngine,
      sessionId: 'stdio-session',
    });
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logInfo('Azure DevOps MCP Server running on stdio');

    const shutdownStdio = async () => {
      eventEngine.close();
      await server.close();
      process.exit(0);
    };
    process.once('SIGTERM', () => {
      void shutdownStdio();
    });
    process.once('SIGINT', () => {
      void shutdownStdio();
    });
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
    typeof globalRequire === 'function' &&
    'main' in globalRequire &&
    globalModule !== undefined
  ) {
    return (globalRequire as { main?: unknown }).main === globalModule;
  }

  const entryArg = process.argv[1];
  if (!entryArg) {
    return false;
  }

  const currentScriptName = getCallSites(2)[0]?.scriptName;
  if (!currentScriptName) {
    return false;
  }

  const currentFile = currentScriptName.startsWith('file://')
    ? fileURLToPath(currentScriptName)
    : currentScriptName;

  try {
    return realpathSync(resolve(entryArg)) === realpathSync(currentFile);
  } catch {
    return resolve(entryArg) === resolve(currentFile);
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
