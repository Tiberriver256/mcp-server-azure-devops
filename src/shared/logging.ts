/**
 * Stdio-safe logging utilities.
 *
 * MCP stdio servers communicate over stdout using JSON-RPC; writing anything
 * non-JSON-RPC (such as console.log) to stdout corrupts the protocol stream.
 * All diagnostics therefore write exclusively to process.stderr.
 */

export function logInfo(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function logWarn(message: string): void {
  process.stderr.write(`WARNING: ${message}\n`);
}

export function logError(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function logDebug(message: string, enabled: boolean): void {
  if (enabled) {
    process.stderr.write(`${message}\n`);
  }
}
