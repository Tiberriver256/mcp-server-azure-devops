import { AzureDevOpsValidationError } from '../errors/index.ts';
import {
  parseBooleanOption,
  parseCliToolFilterArgs,
  parseCsvList,
} from './tool-filter.ts';
import type { ToolFilterOptions } from './tool-filter.ts';

export type TransportKind = 'stdio' | 'http';
export type HttpMode = 'stateful' | 'stateless';

export const MIN_EVENT_POLL_INTERVAL_MS = 10_000;
export const DEFAULT_EVENT_POLL_INTERVAL_MS = 30_000;
export const MIN_EVENT_BUFFER_SIZE = 1;
export const DEFAULT_EVENT_BUFFER_SIZE = 1_000;
export const MAX_EVENT_BUFFER_SIZE = 10_000;

export interface ParsedRuntimeCliOptions extends ToolFilterOptions {
  transport?: TransportKind;
  host?: string;
  port?: number;
  httpPath?: string;
  httpMode?: HttpMode;
  enableJsonResponse?: boolean;
  allowedHosts?: string[];
  allowedOrigins?: string[];
  trustedProxies?: string[];
  httpAuthToken?: string;
  allowPerRequestPat?: boolean;
  allowUnauthenticated?: boolean;
  webhookSecret?: string;
  eventPollIntervalMs?: number;
  eventBufferSize?: number;
}

export interface ResolvedServerRuntimeOptions {
  readonly transport: TransportKind;
  readonly host: string;
  readonly port: number;
  readonly httpPath: string;
  readonly httpMode: HttpMode;
  readonly enableJsonResponse: boolean;
  readonly allowedHosts?: readonly string[];
  readonly allowedOrigins?: readonly string[];
  readonly trustedProxies?: readonly string[];
  readonly httpAuthToken?: string;
  readonly allowPerRequestPat: boolean;
  readonly allowUnauthenticated: boolean;
  readonly webhookSecret?: string;
  readonly eventPollIntervalMs: number;
  readonly eventBufferSize: number;
}

const TOOL_FILTER_FLAGS = new Set([
  '--toolsets',
  '--enabled-tools',
  '--disabled-tools',
  '--read-only',
  '--spotlighting',
  '--no-spotlighting',
]);

function readRequiredStringFlag(
  argv: readonly string[],
  flag: string,
  inlineValue: string | undefined,
  idx: number,
): { value: string; nextIdx: number } {
  if (inlineValue !== undefined) {
    if (inlineValue.trim() === '') {
      throw new AzureDevOpsValidationError(
        `Flag '${flag}' requires a non-empty value`,
      );
    }
    return { value: inlineValue.trim(), nextIdx: idx };
  }
  const next = argv[idx + 1];
  if (next === undefined || next.startsWith('-')) {
    throw new AzureDevOpsValidationError(`Flag '${flag}' requires a value`);
  }
  if (next.trim() === '') {
    throw new AzureDevOpsValidationError(
      `Flag '${flag}' requires a non-empty value`,
    );
  }
  return { value: next.trim(), nextIdx: idx + 1 };
}

function readOptionalBooleanFlag(
  argv: readonly string[],
  flag: string,
  inlineValue: string | undefined,
  idx: number,
): { value: boolean; nextIdx: number } {
  if (inlineValue !== undefined) {
    if (inlineValue.trim() === '') {
      throw new AzureDevOpsValidationError(
        `Flag '${flag}' requires a boolean value when '=' is used`,
      );
    }
    const parsed = parseBooleanOption(inlineValue, flag);
    return { value: parsed === true, nextIdx: idx };
  }
  const next = argv[idx + 1];
  if (next !== undefined && !next.startsWith('-')) {
    if (next.trim() === '') {
      throw new AzureDevOpsValidationError(
        `Flag '${flag}' requires a non-empty boolean value`,
      );
    }
    const parsed = parseBooleanOption(next, flag);
    return { value: parsed === true, nextIdx: idx + 1 };
  }
  return { value: true, nextIdx: idx };
}

function parseIntStrict(raw: string, optionName: string): number {
  if (!/^-?\d+$/.test(raw.trim())) {
    throw new AzureDevOpsValidationError(
      `Invalid integer value '${raw}' for ${optionName}`,
    );
  }
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isSafeInteger(n)) {
    throw new AzureDevOpsValidationError(
      `Integer value '${raw}' for ${optionName} is out of range`,
    );
  }
  return n;
}

export function validatePort(raw: string, optionName: string): number {
  const port = parseIntStrict(raw, optionName);
  if (port < 0 || port > 65535) {
    throw new AzureDevOpsValidationError(
      `Invalid port ${port} for ${optionName}. Expected integer between 0 and 65535.`,
    );
  }
  return port;
}

export function validateEventPollInterval(
  raw: string,
  optionName: string,
): number {
  const ms = parseIntStrict(raw, optionName);
  if (ms < MIN_EVENT_POLL_INTERVAL_MS) {
    throw new AzureDevOpsValidationError(
      `Invalid ${optionName} (${ms}ms): minimum allowed polling interval is ${MIN_EVENT_POLL_INTERVAL_MS}ms (>= ${MIN_EVENT_POLL_INTERVAL_MS}).`,
    );
  }
  return ms;
}

export function validateEventBufferSize(
  raw: string,
  optionName: string,
): number {
  const size = parseIntStrict(raw, optionName);
  if (size < MIN_EVENT_BUFFER_SIZE || size > MAX_EVENT_BUFFER_SIZE) {
    throw new AzureDevOpsValidationError(
      `Invalid ${optionName} (${size}): must be between ${MIN_EVENT_BUFFER_SIZE} and ${MAX_EVENT_BUFFER_SIZE} (maximum ${MAX_EVENT_BUFFER_SIZE}).`,
    );
  }
  return size;
}

function validateTransport(raw: string, optionName: string): TransportKind {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'stdio' || normalized === 'http') {
    return normalized;
  }
  throw new AzureDevOpsValidationError(
    `Invalid value '${raw}' for ${optionName}. Expected 'stdio' or 'http'.`,
  );
}

function validateHttpMode(raw: string, optionName: string): HttpMode {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'stateful' || normalized === 'stateless') {
    return normalized;
  }
  throw new AzureDevOpsValidationError(
    `Invalid value '${raw}' for ${optionName}. Expected 'stateful' or 'stateless'.`,
  );
}

function validateHttpPath(raw: string, optionName: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/')) {
    throw new AzureDevOpsValidationError(
      `Invalid value '${raw}' for ${optionName}. HTTP path must start with '/'.`,
    );
  }
  return trimmed;
}

/**
 * Parse all CLI arguments (tool-filter flags + Streamable HTTP & Events flags).
 * Delegates tool-filter flags to `parseCliToolFilterArgs` and fails fast on any
 * unknown or malformed flag.
 */
export function parseCliRuntimeArgs(argv: string[]): ParsedRuntimeCliOptions {
  const toolFilterArgv: string[] = [];
  const runtime: ParsedRuntimeCliOptions = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('-')) {
      throw new AzureDevOpsValidationError(
        `Unexpected argument '${arg}'. All options must start with '--'.`,
      );
    }

    const eqIdx = arg.indexOf('=');
    const flag = eqIdx === -1 ? arg : arg.slice(0, eqIdx);
    const inlineValue = eqIdx === -1 ? undefined : arg.slice(eqIdx + 1);

    if (TOOL_FILTER_FLAGS.has(flag)) {
      toolFilterArgv.push(arg);
      if (inlineValue === undefined && flag !== '--no-spotlighting') {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('-')) {
          toolFilterArgv.push(next);
          i += 1;
        }
      }
      continue;
    }

    switch (flag) {
      case '--transport': {
        const { value, nextIdx } = readRequiredStringFlag(
          argv,
          flag,
          inlineValue,
          i,
        );
        runtime.transport = validateTransport(value, flag);
        i = nextIdx;
        break;
      }
      case '--host': {
        const { value, nextIdx } = readRequiredStringFlag(
          argv,
          flag,
          inlineValue,
          i,
        );
        runtime.host = value;
        i = nextIdx;
        break;
      }
      case '--port': {
        const { value, nextIdx } = readRequiredStringFlag(
          argv,
          flag,
          inlineValue,
          i,
        );
        runtime.port = validatePort(value, flag);
        i = nextIdx;
        break;
      }
      case '--http-path': {
        const { value, nextIdx } = readRequiredStringFlag(
          argv,
          flag,
          inlineValue,
          i,
        );
        runtime.httpPath = validateHttpPath(value, flag);
        i = nextIdx;
        break;
      }
      case '--http-mode': {
        const { value, nextIdx } = readRequiredStringFlag(
          argv,
          flag,
          inlineValue,
          i,
        );
        runtime.httpMode = validateHttpMode(value, flag);
        i = nextIdx;
        break;
      }
      case '--enable-json-response': {
        const { value, nextIdx } = readOptionalBooleanFlag(
          argv,
          flag,
          inlineValue,
          i,
        );
        runtime.enableJsonResponse = value;
        i = nextIdx;
        break;
      }
      case '--allowed-hosts': {
        const { value, nextIdx } = readRequiredStringFlag(
          argv,
          flag,
          inlineValue,
          i,
        );
        const parsed = parseCsvList(value);
        if (!parsed) {
          throw new AzureDevOpsValidationError(
            `Flag '${flag}' requires at least one non-empty value`,
          );
        }
        runtime.allowedHosts = parsed;
        i = nextIdx;
        break;
      }
      case '--allowed-origins': {
        const { value, nextIdx } = readRequiredStringFlag(
          argv,
          flag,
          inlineValue,
          i,
        );
        const parsed = parseCsvList(value);
        if (!parsed) {
          throw new AzureDevOpsValidationError(
            `Flag '${flag}' requires at least one non-empty value`,
          );
        }
        runtime.allowedOrigins = parsed;
        i = nextIdx;
        break;
      }
      case '--trusted-proxies': {
        const { value, nextIdx } = readRequiredStringFlag(
          argv,
          flag,
          inlineValue,
          i,
        );
        const parsed = parseCsvList(value);
        if (!parsed) {
          throw new AzureDevOpsValidationError(
            `Flag '${flag}' requires at least one non-empty value`,
          );
        }
        runtime.trustedProxies = parsed;
        i = nextIdx;
        break;
      }
      case '--http-auth-token': {
        const { value, nextIdx } = readRequiredStringFlag(
          argv,
          flag,
          inlineValue,
          i,
        );
        runtime.httpAuthToken = value;
        i = nextIdx;
        break;
      }
      case '--allow-per-request-pat': {
        const { value, nextIdx } = readOptionalBooleanFlag(
          argv,
          flag,
          inlineValue,
          i,
        );
        runtime.allowPerRequestPat = value;
        i = nextIdx;
        break;
      }
      case '--allow-unauthenticated': {
        const { value, nextIdx } = readOptionalBooleanFlag(
          argv,
          flag,
          inlineValue,
          i,
        );
        runtime.allowUnauthenticated = value;
        i = nextIdx;
        break;
      }
      case '--webhook-secret': {
        const { value, nextIdx } = readRequiredStringFlag(
          argv,
          flag,
          inlineValue,
          i,
        );
        runtime.webhookSecret = value;
        i = nextIdx;
        break;
      }
      case '--event-poll-interval': {
        const { value, nextIdx } = readRequiredStringFlag(
          argv,
          flag,
          inlineValue,
          i,
        );
        runtime.eventPollIntervalMs = validateEventPollInterval(value, flag);
        i = nextIdx;
        break;
      }
      case '--event-buffer-size': {
        const { value, nextIdx } = readRequiredStringFlag(
          argv,
          flag,
          inlineValue,
          i,
        );
        runtime.eventBufferSize = validateEventBufferSize(value, flag);
        i = nextIdx;
        break;
      }
      default:
        throw new AzureDevOpsValidationError(
          `Unknown flag '${flag}'. Supported flags: --toolsets, --enabled-tools, --disabled-tools, --read-only, --spotlighting, --no-spotlighting, --transport, --host, --port, --http-path, --http-mode, --enable-json-response, --allowed-hosts, --allowed-origins, --http-auth-token, --allow-per-request-pat, --allow-unauthenticated, --webhook-secret, --event-poll-interval, --event-buffer-size`,
        );
    }
  }

  const toolFilters = parseCliToolFilterArgs(toolFilterArgv);
  return {
    ...toolFilters,
    ...runtime,
  };
}

/**
 * Resolve runtime transport and event options from parsed CLI args and env vars.
 */
export function resolveServerRuntimeOptions(
  cli: ParsedRuntimeCliOptions,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedServerRuntimeOptions {
  const transport =
    cli.transport ??
    (env.AZURE_DEVOPS_TRANSPORT?.trim()
      ? validateTransport(env.AZURE_DEVOPS_TRANSPORT, 'AZURE_DEVOPS_TRANSPORT')
      : 'stdio');

  const host = cli.host ?? (env.AZURE_DEVOPS_HTTP_HOST?.trim() || '127.0.0.1');

  const port =
    cli.port ??
    (env.AZURE_DEVOPS_HTTP_PORT?.trim()
      ? validatePort(env.AZURE_DEVOPS_HTTP_PORT, 'AZURE_DEVOPS_HTTP_PORT')
      : 3000);

  const httpPath =
    cli.httpPath ??
    (env.AZURE_DEVOPS_HTTP_PATH?.trim()
      ? validateHttpPath(env.AZURE_DEVOPS_HTTP_PATH, 'AZURE_DEVOPS_HTTP_PATH')
      : '/mcp');

  const httpMode =
    cli.httpMode ??
    (env.AZURE_DEVOPS_HTTP_MODE?.trim()
      ? validateHttpMode(env.AZURE_DEVOPS_HTTP_MODE, 'AZURE_DEVOPS_HTTP_MODE')
      : 'stateful');

  const enableJsonResponse =
    cli.enableJsonResponse ??
    parseBooleanOption(
      env.AZURE_DEVOPS_HTTP_JSON_RESPONSE,
      'AZURE_DEVOPS_HTTP_JSON_RESPONSE',
    ) ??
    false;

  const allowedHosts =
    cli.allowedHosts ?? parseCsvList(env.AZURE_DEVOPS_ALLOWED_HOSTS);

  const allowedOrigins =
    cli.allowedOrigins ?? parseCsvList(env.AZURE_DEVOPS_ALLOWED_ORIGINS);

  const trustedProxies =
    cli.trustedProxies ?? parseCsvList(env.AZURE_DEVOPS_TRUSTED_PROXIES);

  const httpAuthToken =
    cli.httpAuthToken ??
    (env.AZURE_DEVOPS_HTTP_AUTH_TOKEN?.trim() || undefined);

  const allowPerRequestPat =
    cli.allowPerRequestPat ??
    parseBooleanOption(
      env.AZURE_DEVOPS_ALLOW_PER_REQUEST_PAT,
      'AZURE_DEVOPS_ALLOW_PER_REQUEST_PAT',
    ) ??
    false;

  const allowUnauthenticated =
    cli.allowUnauthenticated ??
    parseBooleanOption(
      env.AZURE_DEVOPS_ALLOW_UNAUTHENTICATED,
      'AZURE_DEVOPS_ALLOW_UNAUTHENTICATED',
    ) ??
    false;

  const webhookSecret =
    cli.webhookSecret ?? (env.AZURE_DEVOPS_WEBHOOK_SECRET?.trim() || undefined);

  const eventPollIntervalMs =
    cli.eventPollIntervalMs ??
    (env.AZURE_DEVOPS_EVENT_POLL_INTERVAL_MS?.trim()
      ? validateEventPollInterval(
          env.AZURE_DEVOPS_EVENT_POLL_INTERVAL_MS,
          'AZURE_DEVOPS_EVENT_POLL_INTERVAL_MS',
        )
      : DEFAULT_EVENT_POLL_INTERVAL_MS);

  const eventBufferSize =
    cli.eventBufferSize ??
    (env.AZURE_DEVOPS_EVENT_BUFFER_SIZE?.trim()
      ? validateEventBufferSize(
          env.AZURE_DEVOPS_EVENT_BUFFER_SIZE,
          'AZURE_DEVOPS_EVENT_BUFFER_SIZE',
        )
      : DEFAULT_EVENT_BUFFER_SIZE);

  return {
    transport,
    host,
    port,
    httpPath,
    httpMode,
    enableJsonResponse,
    allowedHosts,
    allowedOrigins,
    trustedProxies,
    httpAuthToken,
    allowPerRequestPat,
    allowUnauthenticated,
    webhookSecret,
    eventPollIntervalMs,
    eventBufferSize,
  };
}
