import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoPath } from './assertions.mjs';

const DEFAULT_PROTOCOL_VERSION = '2025-11-25';
const DEFAULT_MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MiB

/**
 * Error raised when an MCP server returns a JSON-RPC 2.0 error response.
 */
export class JsonRpcError extends Error {
  /**
   * @param {{ code: number, message: string, data?: unknown }} rpcError
   * @param {{ status?: number, headers?: Record<string, unknown> }} [meta]
   */
  constructor(rpcError, meta = {}) {
    const code =
      rpcError && typeof rpcError.code === 'number' ? rpcError.code : -32603;
    const message =
      rpcError && typeof rpcError.message === 'string'
        ? rpcError.message
        : `JSON-RPC error (${code})`;
    super(message);
    this.name = 'JsonRpcError';
    this.code = code;
    this.data = rpcError?.data;
    this.rpcError = rpcError;
    if (meta.status !== undefined) {
      this.status = meta.status;
    }
    if (meta.headers !== undefined) {
      this.headers = meta.headers;
    }
  }
}

/**
 * Build a clean, minimal child process environment that never inherits stray
 * `AZURE_DEVOPS_*` or `LOG_LEVEL` variables from the parent shell.
 *
 * @param {Record<string, string | undefined | null>} [overrides]
 * @returns {Record<string, string>}
 */
function buildCleanEnv(overrides = {}) {
  /** @type {Record<string, string>} */
  const env = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? os.homedir(),
    TMPDIR: process.env.TMPDIR ?? os.tmpdir(),
    NODE_ENV: 'test',
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === null) {
      delete env[key];
    } else {
      env[key] = String(value);
    }
  }
  return env;
}

/**
 * Wait for a child process 'close' event up to `ms`, with an `.unref()` timer.
 *
 * @param {Promise<{ code: number | null, signal: NodeJS.Signals | null }>} closePromise
 * @param {number} ms
 * @returns {Promise<boolean>} true if closed before timeout
 */
function waitForClose(closePromise, ms) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, ms);
    timer.unref();
    void closePromise.then(() => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(true);
      }
    });
  });
}

/**
 * Spawn an MCP server over stdio and return an opaque-box JSON-RPC 2.0 client.
 *
 * Defaults to spawning `node <repoRoot>/dist/index.js` inside a fresh isolated temp `cwd`
 * with a clean minimal `env`. Pass `spawnArgs` (or `command` / `serverEntry`) to run
 * custom scripts (e.g., self-test dummy stdio servers).
 *
 * @param {{
 *   command?: string,
 *   serverEntry?: string,
 *   args?: string[],
 *   spawnArgs?: string[],
 *   env?: Record<string, string | undefined | null>,
 *   cwd?: string,
 *   defaultTimeoutMs?: number,
 *   protocolVersion?: string,
 *   maxBufferBytes?: number,
 * }} [options]
 */
export function createStdioMcpClient(options = {}) {
  const command = options.command ?? process.execPath;
  const serverEntry = options.serverEntry ?? repoPath('dist/index.js');
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 15000;
  const protocolVersion = options.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;
  const maxBufferBytes = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;

  let spawnArgs;
  if (Array.isArray(options.spawnArgs)) {
    spawnArgs = [...options.spawnArgs];
  } else {
    if (!fs.existsSync(serverEntry)) {
      throw new Error(
        `MCP server entrypoint not found at ${serverEntry}. Build the server first (npm run build) or pass spawnArgs/serverEntry.`,
      );
    }
    spawnArgs = [serverEntry, ...(options.args ?? [])];
  }

  let ownedTempCwd = null;
  let cwd = options.cwd;
  if (!cwd) {
    ownedTempCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-mcp-stdio-'));
    cwd = ownedTempCwd;
  }

  const env = buildCleanEnv(options.env);
  let child;
  try {
    child = spawn(command, spawnArgs, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (ownedTempCwd) {
      try {
        fs.rmSync(ownedTempCwd, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
    throw err;
  }

  /** @type {Buffer} */
  let stdoutBuffer = Buffer.alloc(0);
  let droppingOversizedLine = false;
  /** @type {Buffer[]} */
  const stderrChunks = [];
  /** @type {string[]} */
  const stdoutNoise = [];
  /** @type {Array<Record<string, unknown>>} */
  const notifications = [];
  /** @type {Set<number>} */
  const consumedNotificationIndices = new Set();

  // Start request IDs at 1 (NEVER 0 — SDK 1.32.2 ignores notifications/cancelled when !requestId).
  let nextId = 1;

  /** @type {Map<number, { resolve: Function, reject: Function, timer: NodeJS.Timeout, method: string }>} */
  const pendingRequests = new Map();
  /** @type {Set<{ predicate: (n: any) => boolean, resolve: Function, reject: Function, timer: NodeJS.Timeout }>} */
  const notificationWaiters = new Set();

  let exited = false;
  let closed = false;
  let closing = false;
  /** @type {{ code: number | null, signal: NodeJS.Signals | null, error?: Error }} */
  let exitInfo = { code: null, signal: null };

  /** @type {(info: { code: number | null, signal: NodeJS.Signals | null }) => void} */
  let resolveClosePromise;
  const closePromise = new Promise((resolve) => {
    resolveClosePromise = resolve;
  });

  function getStderr() {
    return Buffer.concat(stderrChunks).toString('utf8');
  }

  function makeExitError(context) {
    const err = new Error(
      `${context}: MCP stdio child process exited early (code=${exitInfo.code}, signal=${exitInfo.signal})` +
        (getStderr() ? `\n--- stderr ---\n${getStderr().slice(-2000)}` : '') +
        (stdoutNoise.length > 0
          ? `\n--- stdoutNoise ---\n${stdoutNoise.join('\n')}`
          : ''),
    );
    err.code = exitInfo.code;
    err.signal = exitInfo.signal;
    err.stderr = getStderr();
    err.stdoutNoise = [...stdoutNoise];
    if (exitInfo.error) {
      err.cause = exitInfo.error;
    }
    return err;
  }

  function rejectAllPending(context) {
    for (const [id, entry] of pendingRequests.entries()) {
      clearTimeout(entry.timer);
      pendingRequests.delete(id);
      entry.reject(
        makeExitError(`${context} (while awaiting ${entry.method}, id=${id})`),
      );
    }
    for (const waiter of Array.from(notificationWaiters)) {
      clearTimeout(waiter.timer);
      notificationWaiters.delete(waiter);
      waiter.reject(makeExitError(`${context} (while awaiting notification)`));
    }
  }

  function handleLine(line) {
    if (line.length === 0) {
      return;
    }

    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      stdoutNoise.push(line);
      return;
    }

    if (
      !msg ||
      typeof msg !== 'object' ||
      Array.isArray(msg) ||
      msg.jsonrpc !== '2.0'
    ) {
      stdoutNoise.push(line);
      return;
    }

    const hasId =
      Object.hasOwn(msg, 'id') && msg.id !== null && msg.id !== undefined;
    const hasMethod = typeof msg.method === 'string';

    // JSON-RPC response (result or error) matching an outbound request
    if (hasId && !hasMethod) {
      const pending = pendingRequests.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        pendingRequests.delete(msg.id);
        if (Object.hasOwn(msg, 'error') && msg.error !== undefined) {
          pending.reject(new JsonRpcError(msg.error));
        } else {
          pending.resolve(msg.result);
        }
      }
      return;
    }

    // Server-initiated notification (or server->client request / id:null error frame)
    const idx = notifications.length;
    notifications.push(msg);

    for (const waiter of Array.from(notificationWaiters)) {
      let matched;
      try {
        matched = Boolean(waiter.predicate(msg));
      } catch {
        matched = false;
      }
      if (matched) {
        consumedNotificationIndices.add(idx);
        clearTimeout(waiter.timer);
        notificationWaiters.delete(waiter);
        waiter.resolve(msg);
        break;
      }
    }
  }

  function drainStdoutBuffer() {
    while (stdoutBuffer.length > 0) {
      const nlIndex = stdoutBuffer.indexOf(0x0a);
      if (nlIndex === -1) {
        break;
      }
      let lineBuf = stdoutBuffer.subarray(0, nlIndex);
      stdoutBuffer = stdoutBuffer.subarray(nlIndex + 1);

      if (droppingOversizedLine) {
        droppingOversizedLine = false;
        continue;
      }

      // Strip single trailing CR (\r) if CRLF framed
      if (lineBuf.length > 0 && lineBuf[lineBuf.length - 1] === 0x0d) {
        lineBuf = lineBuf.subarray(0, lineBuf.length - 1);
      }

      if (lineBuf.length > maxBufferBytes) {
        stdoutNoise.push(
          `<stdout frame exceeded maxBufferBytes=${maxBufferBytes}>`,
        );
        continue;
      }

      const line = lineBuf.toString('utf8');
      handleLine(line);
    }

    if (droppingOversizedLine) {
      // Discard remaining bytes of an already-flagged oversized line until the next '\n'
      stdoutBuffer = Buffer.alloc(0);
    } else if (stdoutBuffer.length > maxBufferBytes) {
      stdoutNoise.push(
        `<stdout frame exceeded maxBufferBytes=${maxBufferBytes}>`,
      );
      droppingOversizedLine = true;
      stdoutBuffer = Buffer.alloc(0);
    }
  }

  child.stdin.on('error', (err) => {
    // Ignore expected EPIPE / ERR_STREAM_DESTROYED when child exits while writing
    if (err && (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED')) {
      return;
    }
    exitInfo.error = err;
  });

  child.stderr.on('data', (chunk) => {
    stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  child.stdout.on('data', (chunk) => {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    stdoutBuffer =
      stdoutBuffer.length === 0 ? buf : Buffer.concat([stdoutBuffer, buf]);
    drainStdoutBuffer();
  });

  child.on('error', (err) => {
    exited = true;
    exitInfo = { code: exitInfo.code, signal: exitInfo.signal, error: err };
    rejectAllPending('Child process error');
  });

  child.on('exit', (code, signal) => {
    exited = true;
    exitInfo = { ...exitInfo, code, signal };
  });

  child.on('close', (code, signal) => {
    exited = true;
    closed = true;
    exitInfo = { ...exitInfo, code, signal };
    // Flush any remaining trailing bytes on stdout (non-empty non-JSON trailing bytes are noise!)
    if (!droppingOversizedLine && stdoutBuffer.length > 0) {
      if (stdoutBuffer.length > maxBufferBytes) {
        stdoutNoise.push(
          `<stdout frame exceeded maxBufferBytes=${maxBufferBytes}>`,
        );
      } else {
        const remainder = stdoutBuffer.toString('utf8').replace(/\r$/, '');
        if (remainder.length > 0) {
          handleLine(remainder);
        }
      }
      stdoutBuffer = Buffer.alloc(0);
    }
    rejectAllPending('Child process closed');
    resolveClosePromise({ code, signal });
  });

  function writeMessage(message) {
    if (
      exited ||
      closed ||
      child.stdin.destroyed ||
      child.stdin.writableEnded
    ) {
      throw makeExitError('Cannot write to closed stdio child');
    }
    child.stdin.write(`${JSON.stringify(message)}\n`, 'utf8');
  }

  /**
   * Send a JSON-RPC 2.0 request and resolve with `response.result` (or reject with `JsonRpcError`).
   *
   * @param {string} method
   * @param {unknown} [params]
   * @param {{ timeoutMs?: number }} [opts]
   */
  function request(method, params, opts = {}) {
    if (closing) {
      return Promise.reject(
        new Error(
          `MCP stdio client closed before response arrived (method=${method})`,
        ),
      );
    }
    if (exited || closed) {
      return Promise.reject(makeExitError(`Cannot send request "${method}"`));
    }
    const id = nextId++;
    const timeoutMs = opts.timeoutMs ?? defaultTimeoutMs;
    const payload =
      params !== undefined
        ? { jsonrpc: '2.0', id, method, params }
        : { jsonrpc: '2.0', id, method };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(id);
        const err = new Error(
          `Timed out after ${timeoutMs}ms waiting for JSON-RPC response to "${method}" (id=${id})` +
            (getStderr()
              ? `\n--- stderr ---\n${getStderr().slice(-1500)}`
              : ''),
        );
        err.code = 'ETIMEDOUT';
        err.stderr = getStderr();
        err.stdoutNoise = [...stdoutNoise];
        reject(err);
      }, timeoutMs);
      timer.unref();

      pendingRequests.set(id, { resolve, reject, timer, method });
      try {
        writeMessage(payload);
      } catch (err) {
        clearTimeout(timer);
        pendingRequests.delete(id);
        reject(err);
      }
    });
  }

  /**
   * Send a JSON-RPC 2.0 notification (no `id`, no response expected).
   *
   * @param {string} method
   * @param {unknown} [params]
   */
  function notify(method, params) {
    const payload =
      params !== undefined
        ? { jsonrpc: '2.0', method, params }
        : { jsonrpc: '2.0', method };
    writeMessage(payload);
  }

  /**
   * Perform the MCP `initialize` handshake followed by `notifications/initialized`.
   *
   * @param {{ name: string, version: string }} [clientInfo]
   * @param {{ protocolVersion?: string, capabilities?: Record<string, unknown>, timeoutMs?: number }} [opts]
   */
  async function initialize(
    clientInfo = { name: 'e2e-stdio-harness', version: '1.0.0' },
    opts = {},
  ) {
    const result = await request(
      'initialize',
      {
        protocolVersion: opts.protocolVersion ?? protocolVersion,
        capabilities: opts.capabilities ?? {},
        clientInfo,
      },
      { timeoutMs: opts.timeoutMs },
    );
    notify('notifications/initialized');
    return result;
  }

  function listTools(params) {
    return request('tools/list', params);
  }

  function callTool(name, args = {}, opts = {}) {
    return request('tools/call', { name, arguments: args }, opts);
  }

  function listResources(params) {
    return request('resources/list', params);
  }

  function listResourceTemplates(params) {
    return request('resources/templates/list', params);
  }

  function readResource(uri) {
    return request('resources/read', { uri });
  }

  function subscribeResource(uri) {
    return request('resources/subscribe', { uri });
  }

  function unsubscribeResource(uri) {
    return request('resources/unsubscribe', { uri });
  }

  /**
   * Wait for a server-initiated JSON-RPC notification matching `predicate`
   * (either a function `(msg) => boolean` or a string method name).
   *
   * Checks unconsumed buffered notifications first unless `opts.includeBuffered === false`.
   *
   * @param {string | ((msg: any) => boolean)} predicate
   * @param {number} [timeoutMs=5000]
   * @param {{ includeBuffered?: boolean }} [opts]
   */
  function waitForNotification(predicate, timeoutMs = 5000, opts = {}) {
    const predFn =
      typeof predicate === 'string'
        ? (msg) => msg && msg.method === predicate
        : typeof predicate === 'function'
          ? predicate
          : () => true;

    if (opts.includeBuffered !== false) {
      for (let i = 0; i < notifications.length; i += 1) {
        if (consumedNotificationIndices.has(i)) {
          continue;
        }
        let matched;
        try {
          matched = Boolean(predFn(notifications[i]));
        } catch {
          matched = false;
        }
        if (matched) {
          consumedNotificationIndices.add(i);
          return Promise.resolve(notifications[i]);
        }
      }
    }

    if (closing) {
      return Promise.reject(
        new Error('MCP stdio client closed before notification arrived'),
      );
    }

    if (closed) {
      return Promise.reject(
        makeExitError('Cannot wait for notification on closed stdio child'),
      );
    }

    return new Promise((resolve, reject) => {
      const waiter = {
        predicate: predFn,
        resolve,
        reject,
        timer: null,
      };
      waiter.timer = setTimeout(() => {
        notificationWaiters.delete(waiter);
        const err = new Error(
          `Timed out after ${timeoutMs}ms waiting for MCP stdio notification` +
            (getStderr()
              ? `\n--- stderr ---\n${getStderr().slice(-1000)}`
              : ''),
        );
        err.code = 'ETIMEDOUT';
        reject(err);
      }, timeoutMs);
      waiter.timer.unref();
      notificationWaiters.add(waiter);
    });
  }

  function getNotifications() {
    return [...notifications];
  }

  function getStdoutNoise() {
    return [...stdoutNoise];
  }

  function assertCleanStdout() {
    assert.equal(
      stdoutNoise.length,
      0,
      `Expected clean JSON-RPC stdout, but captured ${stdoutNoise.length} non-JSON-RPC line(s):\n${stdoutNoise.join('\n')}`,
    );
  }

  function getExitInfo() {
    return { ...exitInfo, exited, closed };
  }

  let closeTask = null;

  /**
   * Gracefully shut down the stdio child process (`stdin.end()` -> `SIGTERM` -> `SIGKILL`),
   * clear timers, and remove the harness-created temp `cwd`.
   */
  async function close() {
    if (closeTask) {
      return closeTask;
    }
    closing = true;
    closeTask = (async () => {
      for (const [id, entry] of pendingRequests.entries()) {
        clearTimeout(entry.timer);
        pendingRequests.delete(id);
        entry.reject(
          new Error(
            `MCP stdio client closed before response arrived (method=${entry.method}, id=${id})`,
          ),
        );
      }
      for (const waiter of Array.from(notificationWaiters)) {
        clearTimeout(waiter.timer);
        notificationWaiters.delete(waiter);
        waiter.reject(
          new Error('MCP stdio client closed before notification arrived'),
        );
      }

      if (!closed) {
        try {
          if (!child.stdin.destroyed && !child.stdin.writableEnded) {
            child.stdin.end();
          }
        } catch {
          // ignore
        }

        const closedAfterEnd = await waitForClose(closePromise, 1500);
        if (!closedAfterEnd && !closed) {
          try {
            child.kill('SIGTERM');
          } catch {
            // ignore
          }
          const closedAfterTerm = await waitForClose(closePromise, 1500);
          if (!closedAfterTerm && !closed) {
            try {
              child.kill('SIGKILL');
            } catch {
              // ignore
            }
            await waitForClose(closePromise, 1500);
          }
        }
      }

      if (ownedTempCwd) {
        try {
          fs.rmSync(ownedTempCwd, { recursive: true, force: true });
        } catch {
          // ignore best-effort cleanup errors
        }
        ownedTempCwd = null;
      }
    })();
    return closeTask;
  }

  return {
    child,
    pid: child.pid,
    request,
    notify,
    initialize,
    listTools,
    callTool,
    listResources,
    listResourceTemplates,
    readResource,
    subscribeResource,
    unsubscribeResource,
    waitForNotification,
    getNotifications,
    getStderr,
    getStdoutNoise,
    assertCleanStdout,
    getExitInfo,
    close,
  };
}

/**
 * Spawn the MCP server (or custom script) and wait for it to exit on its own.
 * Useful for testing CLI validation errors, fail-closed startup refusals, and exit codes.
 *
 * Accepts either `(args, env, timeoutMs)` or a single options object:
 * `{ args?, env?, timeoutMs?, command?, spawnArgs?, serverEntry?, cwd?, closeStdin? }`.
 *
 * @param {string[] | {
 *   args?: string[],
 *   env?: Record<string, string | undefined | null>,
 *   timeoutMs?: number,
 *   command?: string,
 *   spawnArgs?: string[],
 *   serverEntry?: string,
 *   cwd?: string,
 *   closeStdin?: boolean,
 * }} [argsOrOpts]
 * @param {Record<string, string | undefined | null>} [envArg]
 * @param {number} [timeoutMsArg]
 * @returns {Promise<{ code: number | null, signal: NodeJS.Signals | null, stdout: string, stderr: string, timedOut: boolean }>}
 */
export async function spawnServerExpectExit(
  argsOrOpts = [],
  envArg = {},
  timeoutMsArg = 10000,
) {
  let opts;
  if (Array.isArray(argsOrOpts)) {
    opts = { args: argsOrOpts, env: envArg, timeoutMs: timeoutMsArg };
  } else if (argsOrOpts && typeof argsOrOpts === 'object') {
    opts = argsOrOpts;
  } else {
    opts = { args: [], env: envArg, timeoutMs: timeoutMsArg };
  }

  const command = opts.command ?? process.execPath;
  const serverEntry = opts.serverEntry ?? repoPath('dist/index.js');
  const timeoutMs = opts.timeoutMs ?? 10000;

  let spawnArgs;
  if (Array.isArray(opts.spawnArgs)) {
    spawnArgs = [...opts.spawnArgs];
  } else {
    if (!fs.existsSync(serverEntry)) {
      throw new Error(
        `MCP server entrypoint not found at ${serverEntry}. Build the server first (npm run build) or pass spawnArgs/serverEntry.`,
      );
    }
    spawnArgs = [serverEntry, ...(opts.args ?? [])];
  }

  let ownedTempCwd = null;
  let cwd = opts.cwd;
  if (!cwd) {
    ownedTempCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-mcp-exit-'));
    cwd = ownedTempCwd;
  }

  const env = buildCleanEnv(opts.env);

  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(command, spawnArgs, {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const stdoutChunks = [];
      const stderrChunks = [];
      let timedOut = false;
      let settled = false;

      child.stdin.on('error', () => {
        // ignore EPIPE on early exit
      });
      if (opts.closeStdin === true) {
        child.stdin.end();
      }

      child.stdout.on('data', (chunk) => {
        stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      child.stderr.on('data', (chunk) => {
        stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, timeoutMs);
      timer.unref();

      child.on('error', (err) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(err);
      });

      child.on('close', (code, signal) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve({
          code,
          signal,
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
          timedOut,
        });
      });
    });
  } finally {
    if (ownedTempCwd) {
      try {
        fs.rmSync(ownedTempCwd, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}
