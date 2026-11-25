/**
 * Stdio-safe logging utilities.
 *
 * MCP stdio servers communicate over stdout using JSON-RPC; writing anything
 * non-JSON-RPC (such as console.log) to stdout corrupts the protocol stream.
 * All diagnostics therefore write exclusively to process.stderr and respect
 * `AZURE_DEVOPS_LOG_LEVEL` (falling back to `LOG_LEVEL`):
 * `debug` | `info` (default) | `warn` | `error`.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function resolveLogLevel(
  env: NodeJS.ProcessEnv = process.env,
): LogLevel {
  const raw = (env.AZURE_DEVOPS_LOG_LEVEL || env.LOG_LEVEL || '')
    .trim()
    .toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

function shouldLog(
  level: LogLevel,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[resolveLogLevel(env)];
}

export function logInfo(
  message: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (shouldLog('info', env)) {
    process.stderr.write(`${message}\n`);
  }
}

export function logWarn(
  message: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (shouldLog('warn', env)) {
    process.stderr.write(`WARNING: ${message}\n`);
  }
}

export function logError(
  message: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (shouldLog('error', env)) {
    process.stderr.write(`${message}\n`);
  }
}

export function logDebug(
  message: string,
  enabled?: boolean,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const active = enabled ?? shouldLog('debug', env);
  if (active) {
    process.stderr.write(`${message}\n`);
  }
}
