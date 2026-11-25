import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { getFreePort, repoPath } from './assertions.mjs';
import { JsonRpcError } from './mcp-stdio-client.mjs';

export { JsonRpcError };

const DEFAULT_PROTOCOL_VERSION = '2025-11-25';

/**
 * Error raised when an HTTP MCP endpoint returns a non-2xx HTTP status without a JSON-RPC error object.
 */
export class HttpResponseError extends Error {
  /**
   * @param {number} status
   * @param {Record<string, unknown>} headers
   * @param {Buffer} rawBody
   * @param {string} text
   * @param {unknown} json
   */
  constructor(status, headers, rawBody, text, json) {
    super(`HTTP ${status}: ${text ? text.slice(0, 300) : '(empty body)'}`);
    this.name = 'HttpResponseError';
    this.status = status;
    this.headers = headers;
    this.body = rawBody;
    this.rawBody = rawBody;
    this.text = text;
    this.json = json;
  }
}

/**
 * Build a clean minimal environment without inheriting stray AZURE_DEVOPS_* variables.
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
 * Merge header objects case-insensitively while preserving the exact header name
 * casing of the highest-precedence layer. Setting a header value to `undefined` or `null`
 * omits it completely.
 *
 * @param {...(Record<string, string | number | string[] | undefined | null> | undefined)} layers
 * @returns {Record<string, string | number | string[]>}
 */
function mergeHeaders(...layers) {
  /** @type {Map<string, { name: string, value: string | number | string[] }>} */
  const map = new Map();
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') {
      continue;
    }
    for (const [key, val] of Object.entries(layer)) {
      const lower = key.toLowerCase();
      if (val === undefined || val === null) {
        map.delete(lower);
      } else {
        map.set(lower, { name: key, value: val });
      }
    }
  }
  /** @type {Record<string, string | number | string[]>} */
  const out = {};
  for (const { name, value } of map.values()) {
    out[name] = value;
  }
  return out;
}

function hasHeader(headers, targetLower) {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === targetLower) {
      return true;
    }
  }
  return false;
}

function getHeader(headers, targetLower) {
  for (const [key, val] of Object.entries(headers)) {
    if (key.toLowerCase() === targetLower) {
      return Array.isArray(val) ? val.join(', ') : val;
    }
  }
  return undefined;
}

function safeJsonParse(text) {
  if (!text || text.trim().length === 0) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getMediaTypeEssence(contentType) {
  if (typeof contentType !== 'string') {
    return '';
  }
  return contentType.split(';', 1)[0].trim().toLowerCase();
}

function stripIpv6Brackets(hostname) {
  return typeof hostname === 'string'
    ? hostname.replace(/^\[|\]$/g, '')
    : hostname;
}

/**
 * Spec-compliant WHATWG EventSource / Server-Sent Events streaming parser.
 *
 * Handles:
 * - Streaming UTF-8 decoding (multi-byte sequences split across arbitrary TCP chunks)
 * - Leading UTF-8 BOM stripping on the first chunk
 * - `\r\n`, `\n`, and `\r` line endings including `\r\n` split across chunk boundaries
 * - Comment lines (`: keepalive`)
 * - `id:`, `event:`, multi-line `data:`, and numeric `retry:`
 * - Empty `data:` priming events (`hasData === true` even when `data === ''`)
 *
 * @param {{
 *   onEvent?: (event: { id: string | undefined, event: string | undefined, data: string, json: unknown, retry: number | undefined, lastEventId: string | undefined }) => void,
 *   onComment?: (comment: string) => void,
 *   onRetry?: (retryMs: number) => void,
 *   onLastEventId?: (lastEventId: string) => void,
 * }} [callbacks]
 */
export function createSseParser(callbacks = {}) {
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
  let isFirstChunk = true;
  let incompleteLine = '';
  let pendingCr = false;

  let dataLines = [];
  let hasData = false;
  let eventType = '';
  let currentId = undefined;
  let pendingEventId = undefined;
  let hasPendingEventId = false;
  let lastEventId = undefined;
  let retryMs = undefined;

  function dispatchEvent() {
    if (hasPendingEventId) {
      lastEventId = pendingEventId;
      hasPendingEventId = false;
      pendingEventId = undefined;
      if (callbacks.onLastEventId) {
        callbacks.onLastEventId(lastEventId);
      }
    }
    if (!hasData) {
      // Blank line after comments or non-data fields clears event type without dispatching
      eventType = '';
      currentId = undefined;
      return;
    }
    const data = dataLines.join('\n');
    const event = {
      id: currentId,
      event: eventType || undefined,
      data,
      json: safeJsonParse(data),
      retry: retryMs,
      lastEventId,
    };
    dataLines = [];
    hasData = false;
    eventType = '';
    currentId = undefined;
    if (callbacks.onEvent) {
      callbacks.onEvent(event);
    }
  }

  function processLine(line) {
    if (line === '') {
      dispatchEvent();
      return;
    }
    if (line.startsWith(':')) {
      const comment = line[1] === ' ' ? line.slice(2) : line.slice(1);
      if (callbacks.onComment) {
        callbacks.onComment(comment);
      }
      return;
    }

    const colonIdx = line.indexOf(':');
    let field;
    let value;
    if (colonIdx === -1) {
      field = line;
      value = '';
    } else {
      field = line.slice(0, colonIdx);
      value = line.slice(colonIdx + (line[colonIdx + 1] === ' ' ? 2 : 1));
    }

    switch (field) {
      case 'event':
        eventType = value;
        break;
      case 'data':
        dataLines.push(value);
        hasData = true;
        break;
      case 'id':
        if (!value.includes('\0')) {
          currentId = value;
          pendingEventId = value;
          hasPendingEventId = true;
        }
        break;
      case 'retry':
        if (/^\d+$/.test(value)) {
          retryMs = Number.parseInt(value, 10);
          if (callbacks.onRetry) {
            callbacks.onRetry(retryMs);
          }
        }
        break;
      default:
        // Unknown SSE fields are ignored per WHATWG spec
        break;
    }
  }

  function processText(text) {
    if (text.length === 0) {
      return;
    }
    let i = 0;
    if (isFirstChunk) {
      isFirstChunk = false;
      if (text.charCodeAt(0) === 0xfeff) {
        i = 1;
      }
    }

    if (pendingCr && i < text.length) {
      pendingCr = false;
      if (text.charCodeAt(i) === 0x0a) {
        i += 1;
      }
    }

    let segStart = i;
    while (i < text.length) {
      const ch = text.charCodeAt(i);
      if (ch === 0x0a || ch === 0x0d) {
        const line = incompleteLine + text.slice(segStart, i);
        incompleteLine = '';
        processLine(line);
        if (ch === 0x0d) {
          if (i + 1 < text.length) {
            if (text.charCodeAt(i + 1) === 0x0a) {
              i += 1;
            }
          } else {
            pendingCr = true;
          }
        }
        segStart = i + 1;
      }
      i += 1;
    }

    if (segStart < text.length) {
      incompleteLine += text.slice(segStart);
    }
  }

  return {
    /**
     * Feed a raw Buffer / Uint8Array / string chunk from the HTTP stream.
     * @param {Buffer | Uint8Array | string} chunk
     */
    feed(chunk) {
      if (typeof chunk === 'string') {
        processText(chunk);
      } else {
        processText(decoder.decode(chunk, { stream: true }));
      }
    },
    /**
     * Finalize UTF-8 decoder on stream EOF (incomplete event without trailing blank line
     * is discarded per WHATWG spec).
     */
    end() {
      const tail = decoder.decode();
      if (tail) {
        processText(tail);
      }
    },
    get lastEventId() {
      return lastEventId;
    },
    get retryMs() {
      return retryMs;
    },
  };
}

/**
 * Low-level HTTP/HTTPS request using `node:http` directly with `agent: false` so:
 * 1. Arbitrary `Host`, `Origin`, `Authorization`, and custom headers are transmitted verbatim
 *    (unlike global `fetch()` which strips/overrides forbidden `Host` headers).
 * 2. Zero keep-alive pooled sockets stay open to hang `node --test` or `SIGTERM` drains.
 * 3. Early server rejection (`403`/`413`) closing the socket while writing body resolves
 *    cleanly with the received HTTP response instead of throwing `EPIPE`/`ECONNRESET`.
 *
 * @param {string} targetUrl
 * @param {{
 *   method?: string,
 *   headers?: Record<string, string | number | string[] | undefined | null>,
 *   body?: string | Buffer | Uint8Array | Record<string, unknown> | null,
 *   timeoutMs?: number,
 * }} [opts]
 * @returns {Promise<{ status: number, headers: http.IncomingHttpHeaders, rawBody: Buffer, text: string, json: unknown }>}
 */
function performNodeHttpRequest(targetUrl, opts = {}) {
  const urlObj = new URL(targetUrl);
  const transport = urlObj.protocol === 'https:' ? https : http;
  const method = (opts.method ?? 'GET').toUpperCase();
  const timeoutMs = opts.timeoutMs ?? 15000;

  let bodyBuf = null;
  const headers = mergeHeaders(opts.headers);

  if (opts.body !== undefined && opts.body !== null) {
    if (Buffer.isBuffer(opts.body)) {
      bodyBuf = opts.body;
    } else if (ArrayBuffer.isView(opts.body)) {
      bodyBuf = Buffer.from(
        opts.body.buffer,
        opts.body.byteOffset,
        opts.body.byteLength,
      );
    } else if (typeof opts.body === 'string') {
      bodyBuf = Buffer.from(opts.body, 'utf8');
    } else {
      bodyBuf = Buffer.from(JSON.stringify(opts.body), 'utf8');
      if (!hasHeader(headers, 'content-type')) {
        headers['Content-Type'] = 'application/json';
      }
    }
    if (
      !hasHeader(headers, 'content-length') &&
      !hasHeader(headers, 'transfer-encoding')
    ) {
      headers['Content-Length'] = String(bodyBuf.length);
    }
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let responseReceived = false;

    const req = transport.request(
      {
        protocol: urlObj.protocol,
        hostname: stripIpv6Brackets(urlObj.hostname),
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: `${urlObj.pathname}${urlObj.search}`,
        method,
        headers,
        agent: false,
      },
      (res) => {
        responseReceived = true;
        const chunks = [];
        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          const rawBody = Buffer.concat(chunks);
          const text = rawBody.toString('utf8');
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            rawBody,
            text,
            json: safeJsonParse(text),
          });
        });
        res.on('error', (err) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          reject(err);
        });
      },
    );

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      req.destroy(
        new Error(
          `HTTP request timed out after ${timeoutMs}ms (${method} ${targetUrl})`,
        ),
      );
      const err = new Error(
        `HTTP request timed out after ${timeoutMs}ms (${method} ${targetUrl})`,
      );
      err.code = 'ETIMEDOUT';
      reject(err);
    }, timeoutMs);
    timer.unref();

    req.on('error', (err) => {
      // Tolerate EPIPE/ECONNRESET if server already sent an early 403/413 response and closed socket
      if (
        responseReceived &&
        err &&
        (err.code === 'EPIPE' ||
          err.code === 'ECONNRESET' ||
          err.code === 'ERR_STREAM_WRITE_AFTER_END')
      ) {
        return;
      }
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    if (bodyBuf && bodyBuf.length > 0) {
      req.end(bodyBuf);
    } else {
      req.end();
    }
  });
}

function argsContainFlag(args, flagName) {
  return args.some((arg) => arg === flagName || arg.startsWith(`${flagName}=`));
}

function extractFlagValue(args, flagName) {
  let value;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === flagName && i + 1 < args.length) {
      value = args[i + 1];
      i += 1;
    } else if (arg.startsWith(`${flagName}=`)) {
      value = arg.slice(flagName.length + 1);
    }
  }
  return value;
}

function parsePortNumber(raw) {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) {
    return undefined;
  }
  const num = Number.parseInt(s, 10);
  return num >= 0 && num <= 65535 ? num : undefined;
}

function waitForChildClose(closePromise, ms) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(false);
      }
    }, ms);
    timer.unref();
    closePromise.then(() => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(true);
      }
    });
  });
}

/**
 * Spawn an MCP Streamable HTTP server child process, poll `/healthz` until HTTP 200
 * (failing immediately if the child exits early), and return lifecycle controls.
 *
 * @param {{
 *   command?: string,
 *   serverEntry?: string,
 *   spawnArgs?: string[],
 *   args?: string[],
 *   env?: Record<string, string | undefined | null>,
 *   host?: string,
 *   port?: number,
 *   passPortZero?: boolean,
 *   httpPath?: string,
 *   webhookPath?: string,
 *   healthzPath?: string,
 *   readyzPath?: string,
 *   readyTimeoutMs?: number,
 *   cwd?: string,
 * }} [options]
 */
export async function startHttpMcpServer(options = {}) {
  const command = options.command ?? process.execPath;
  const serverEntry = options.serverEntry ?? repoPath('dist/index.js');
  const extraArgs = [...(options.args ?? [])];
  const envInput = options.env ?? {};

  const flagHost = extractFlagValue(extraArgs, '--host');
  const envHost =
    typeof envInput.AZURE_DEVOPS_HTTP_HOST === 'string' &&
    envInput.AZURE_DEVOPS_HTTP_HOST.trim()
      ? envInput.AZURE_DEVOPS_HTTP_HOST.trim()
      : undefined;
  const rawHost = options.host ?? flagHost ?? envHost ?? '127.0.0.1';
  const host = stripIpv6Brackets(rawHost);
  const rawConnectHost =
    host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '::1' : host;
  const connectHost = stripIpv6Brackets(rawConnectHost);

  const flagHttpPath = extractFlagValue(extraArgs, '--http-path');
  const envHttpPath =
    typeof envInput.AZURE_DEVOPS_HTTP_PATH === 'string' &&
    envInput.AZURE_DEVOPS_HTTP_PATH.trim()
      ? envInput.AZURE_DEVOPS_HTTP_PATH.trim()
      : undefined;
  const httpPath = options.httpPath ?? flagHttpPath ?? envHttpPath ?? '/mcp';
  const webhookPath = options.webhookPath ?? '/webhooks/ado';
  const healthzPath = options.healthzPath ?? '/healthz';
  const readyzPath = options.readyzPath ?? '/readyz';
  const readyTimeoutMs = options.readyTimeoutMs ?? 10000;

  const flagPortRaw = extractFlagValue(extraArgs, '--port');
  const envPortRaw =
    envInput.AZURE_DEVOPS_HTTP_PORT !== undefined &&
    envInput.AZURE_DEVOPS_HTTP_PORT !== null &&
    String(envInput.AZURE_DEVOPS_HTTP_PORT).trim() !== ''
      ? String(envInput.AZURE_DEVOPS_HTTP_PORT).trim()
      : undefined;

  let usePortDiscovery = options.passPortZero === true;
  /** @type {number | null} */
  let portArg = null;
  let shouldAppendPortFlag;

  if (usePortDiscovery) {
    portArg = 0;
    shouldAppendPortFlag = !argsContainFlag(extraArgs, '--port');
  } else if (options.port !== undefined) {
    const parsedOptPort = parsePortNumber(options.port);
    if (parsedOptPort === 0) {
      usePortDiscovery = true;
      portArg = 0;
    } else if (parsedOptPort !== undefined) {
      portArg = parsedOptPort;
    }
    shouldAppendPortFlag = !argsContainFlag(extraArgs, '--port');
  } else if (flagPortRaw !== undefined) {
    const parsedFlagPort = parsePortNumber(flagPortRaw);
    if (parsedFlagPort === 0) {
      usePortDiscovery = true;
      portArg = 0;
    } else if (parsedFlagPort !== undefined) {
      portArg = parsedFlagPort;
    }
    shouldAppendPortFlag = false;
  } else if (envPortRaw !== undefined) {
    const parsedEnvPort = parsePortNumber(envPortRaw);
    if (parsedEnvPort === 0) {
      usePortDiscovery = true;
      portArg = 0;
    } else if (parsedEnvPort !== undefined) {
      portArg = parsedEnvPort;
    }
    shouldAppendPortFlag = false;
  } else {
    portArg = await getFreePort(connectHost);
    shouldAppendPortFlag = !argsContainFlag(extraArgs, '--port');
  }

  let spawnArgs;
  if (Array.isArray(options.spawnArgs)) {
    spawnArgs = [...options.spawnArgs];
  } else {
    if (!fs.existsSync(serverEntry)) {
      throw new Error(
        `MCP server entrypoint not found at ${serverEntry}. Build the server first (npm run build) or pass spawnArgs/serverEntry.`,
      );
    }
    spawnArgs = [serverEntry];
    if (!argsContainFlag(extraArgs, '--transport')) {
      spawnArgs.push('--transport', 'http');
    }
    if (
      !argsContainFlag(extraArgs, '--host') &&
      (options.host !== undefined || envHost === undefined)
    ) {
      spawnArgs.push('--host', host);
    }
    if (shouldAppendPortFlag && portArg !== null && portArg !== undefined) {
      spawnArgs.push('--port', String(portArg));
    }
    if (options.httpPath && !argsContainFlag(extraArgs, '--http-path')) {
      spawnArgs.push('--http-path', httpPath);
    }
    spawnArgs.push(...extraArgs);
  }

  let ownedTempCwd = null;
  let cwd = options.cwd;
  if (!cwd) {
    ownedTempCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-mcp-http-'));
    cwd = ownedTempCwd;
  }

  const env = buildCleanEnv({
    ...(options.spawnArgs && portArg !== null && portArg !== undefined
      ? { PORT: String(portArg), HOST: host }
      : {}),
    ...envInput,
  });

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

  const stdoutChunks = [];
  const stderrChunks = [];
  let exited = false;
  let closed = false;
  /** @type {{ code: number | null, signal: NodeJS.Signals | null, error?: Error | null }} */
  let exitInfo = { code: null, signal: null, error: null };

  /** @type {number[]} */
  const highPriorityPorts = [];
  /** @type {number[]} */
  const fallbackPorts = [];

  const stdoutDecoder = new TextDecoder('utf-8');
  const stderrDecoder = new TextDecoder('utf-8');
  let stdoutLineBuf = '';
  let stderrLineBuf = '';
  let stdoutPendingCr = false;
  let stderrPendingCr = false;

  let resolveClose;
  const closePromise = new Promise((resolve) => {
    resolveClose = resolve;
  });

  function recordCandidatePort(list, rawPort) {
    const parsed = Number.parseInt(rawPort, 10);
    if (parsed > 0 && parsed <= 65535 && !list.includes(parsed)) {
      list.push(parsed);
    }
  }

  function scanLineForPorts(line, highOut, fallbackOut) {
    if (!line) {
      return;
    }
    // High priority: URLs, loopback host:port, or port declarations in an explicit listening/started/bound context
    const listeningRe =
      /\b(?:listening|started|running|bound|serving)\b[^\r\n]*?(?:https?:\/\/(?:\[[^\]]+\]|[^:\s/]+):(\d{1,5})(?![0-9])|(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]|\[::\]):(\d{1,5})(?![0-9])|\bport\s*[:=]?\s*(\d{1,5})(?![0-9]))/gi;
    let m;
    while ((m = listeningRe.exec(line)) !== null) {
      recordCandidatePort(highOut, m[1] || m[2] || m[3]);
    }

    // Fallback: any URL with explicit port or port=N declaration on the line
    const urlRe = /https?:\/\/(?:\[[^\]]+\]|[^:\s/]+):(\d{1,5})(?![0-9])/gi;
    while ((m = urlRe.exec(line)) !== null) {
      recordCandidatePort(fallbackOut, m[1]);
    }
    const portRe = /\bport\s*[=:]\s*(\d{1,5})(?![0-9])/gi;
    while ((m = portRe.exec(line)) !== null) {
      recordCandidatePort(fallbackOut, m[1]);
    }
  }

  function feedLineScanner(chunk, isStdout) {
    const decoded = isStdout
      ? stdoutDecoder.decode(chunk, { stream: true })
      : stderrDecoder.decode(chunk, { stream: true });
    if (!decoded) {
      return;
    }
    let buf = isStdout ? stdoutLineBuf : stderrLineBuf;
    let pendingCr = isStdout ? stdoutPendingCr : stderrPendingCr;
    let i = 0;

    if (pendingCr) {
      pendingCr = false;
      if (decoded.charCodeAt(0) === 0x0a) {
        i = 1;
      }
    }

    let segStart = i;
    while (i < decoded.length) {
      const ch = decoded.charCodeAt(i);
      if (ch === 0x0a || ch === 0x0d) {
        const completeLine = buf + decoded.slice(segStart, i);
        buf = '';
        scanLineForPorts(completeLine, highPriorityPorts, fallbackPorts);
        if (ch === 0x0d) {
          if (i + 1 < decoded.length) {
            if (decoded.charCodeAt(i + 1) === 0x0a) {
              i += 1;
            }
          } else {
            pendingCr = true;
          }
        }
        segStart = i + 1;
      }
      i += 1;
    }

    if (segStart < decoded.length) {
      buf += decoded.slice(segStart);
    }

    if (isStdout) {
      stdoutLineBuf = buf;
      stdoutPendingCr = pendingCr;
    } else {
      stderrLineBuf = buf;
      stderrPendingCr = pendingCr;
    }
  }

  function getCandidatePorts() {
    if (!usePortDiscovery) {
      return portArg && portArg > 0 ? [portArg] : [];
    }
    const ordered = [];
    const pushUnique = (list) => {
      for (const p of list) {
        if (!ordered.includes(p)) {
          ordered.push(p);
        }
      }
    };
    pushUnique(highPriorityPorts);
    pushUnique(fallbackPorts);

    if (stderrLineBuf || stdoutLineBuf) {
      const partialHigh = [];
      const partialFallback = [];
      if (stderrLineBuf) {
        scanLineForPorts(stderrLineBuf, partialHigh, partialFallback);
      }
      if (stdoutLineBuf) {
        scanLineForPorts(stdoutLineBuf, partialHigh, partialFallback);
      }
      pushUnique(partialHigh);
      pushUnique(partialFallback);
    }
    return ordered;
  }

  child.stdin.on('error', () => {
    // ignore
  });
  child.stdout.on('data', (chunk) => {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    stdoutChunks.push(buf);
    if (usePortDiscovery) {
      feedLineScanner(buf, true);
    }
  });
  child.stderr.on('data', (chunk) => {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    stderrChunks.push(buf);
    if (usePortDiscovery) {
      feedLineScanner(buf, false);
    }
  });
  child.on('error', (err) => {
    exited = true;
    closed = true;
    exitInfo = { ...exitInfo, error: err };
    resolveClose({ code: exitInfo.code, signal: exitInfo.signal });
  });
  child.on('exit', (code, signal) => {
    exited = true;
    exitInfo = { ...exitInfo, code, signal };
  });
  child.on('close', (code, signal) => {
    exited = true;
    closed = true;
    exitInfo = { ...exitInfo, code, signal };
    resolveClose({ code, signal });
  });

  function getStdout() {
    return Buffer.concat(stdoutChunks).toString('utf8');
  }
  function getStderr() {
    return Buffer.concat(stderrChunks).toString('utf8');
  }

  async function cleanupOnError() {
    if (!closed) {
      if (exited) {
        await waitForChildClose(closePromise, 500);
      } else {
        try {
          child.kill('SIGTERM');
        } catch {
          // ignore
        }
        const ok = await waitForChildClose(closePromise, 1500);
        if (!ok && !closed) {
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
          await waitForChildClose(closePromise, 1500);
        }
      }
    }
    if (ownedTempCwd) {
      try {
        fs.rmSync(ownedTempCwd, { recursive: true, force: true });
      } catch {
        // ignore
      }
      ownedTempCwd = null;
    }
  }

  const deadline = Date.now() + readyTimeoutMs;
  const formattedConnectHost = connectHost.includes(':')
    ? `[${connectHost}]`
    : connectHost;
  let ready = false;
  let boundPort = null;

  while (Date.now() < deadline) {
    if (exited) {
      await cleanupOnError();
      const errDetail = exitInfo.error
        ? `, error=${exitInfo.error.message}`
        : '';
      const err = new Error(
        `HTTP MCP server exited before becoming ready (code=${exitInfo.code}, signal=${exitInfo.signal}${errDetail})\n` +
          `--- stderr ---\n${getStderr()}\n--- stdout ---\n${getStdout()}`,
      );
      err.code = exitInfo.error?.code ?? exitInfo.code;
      err.signal = exitInfo.signal;
      err.stderr = getStderr();
      err.stdout = getStdout();
      if (exitInfo.error) {
        err.cause = exitInfo.error;
      }
      throw err;
    }

    const candidates = getCandidatePorts();
    for (const candidatePort of candidates) {
      if (exited || Date.now() >= deadline) {
        break;
      }
      try {
        const probeUrl = `http://${formattedConnectHost}:${candidatePort}${healthzPath}`;
        const remainingMs = Math.max(100, deadline - Date.now());
        const res = await performNodeHttpRequest(probeUrl, {
          method: 'GET',
          timeoutMs: Math.min(1000, remainingMs),
        });
        if (res.status === 200) {
          ready = true;
          boundPort = candidatePort;
          break;
        }
      } catch {
        // Not listening yet (or non-server candidate port); try next candidate / retry shortly
      }
    }

    if (ready) {
      break;
    }

    await delay(50);
  }

  if (!ready || boundPort === null) {
    await cleanupOnError();
    const err = new Error(
      `HTTP MCP server did not respond 200 on ${healthzPath} within ${readyTimeoutMs}ms\n` +
        `--- stderr ---\n${getStderr()}\n--- stdout ---\n${getStdout()}`,
    );
    err.code = 'ETIMEDOUT';
    err.stderr = getStderr();
    err.stdout = getStdout();
    throw err;
  }

  const baseUrl = `http://${formattedConnectHost}:${boundPort}`;

  let closeTask = null;

  function sendSignal(sig = 'SIGTERM') {
    if (!exited) {
      child.kill(sig);
    }
  }

  async function waitForExit(timeoutMs = 5000) {
    const closedInTime = await waitForChildClose(closePromise, timeoutMs);
    return {
      code: exitInfo.code,
      signal: exitInfo.signal,
      timedOut: !closedInTime,
    };
  }

  async function close() {
    if (closeTask) {
      return closeTask;
    }
    closeTask = (async () => {
      if (!closed) {
        if (exited) {
          await waitForChildClose(closePromise, 500);
        } else {
          try {
            child.kill('SIGTERM');
          } catch {
            // ignore
          }
          const ok = await waitForChildClose(closePromise, 3000);
          if (!ok && !closed) {
            try {
              child.kill('SIGKILL');
            } catch {
              // ignore
            }
            await waitForChildClose(closePromise, 2000);
          }
        }
      }
      if (ownedTempCwd) {
        try {
          fs.rmSync(ownedTempCwd, { recursive: true, force: true });
        } catch {
          // ignore
        }
        ownedTempCwd = null;
      }
    })();
    return closeTask;
  }

  return {
    baseUrl,
    port: boundPort,
    mcpUrl: `${baseUrl}${httpPath}`,
    healthzUrl: `${baseUrl}${healthzPath}`,
    readyzUrl: `${baseUrl}${readyzPath}`,
    webhookUrl: `${baseUrl}${webhookPath}`,
    child,
    pid: child.pid,
    getStderr,
    getStdout,
    sendSignal,
    waitForExit,
    close,
  };
}

/**
 * Create a zero-dependency Streamable HTTP & SSE MCP client backed directly by `node:http`.
 *
 * @param {string} baseUrl e.g. 'http://127.0.0.1:3000'
 * @param {{
 *   mcpPath?: string,
 *   webhookPath?: string,
 *   healthzPath?: string,
 *   readyzPath?: string,
 *   protocolVersion?: string,
 *   defaultHeaders?: Record<string, string | undefined | null>,
 *   defaultTimeoutMs?: number,
 * }} [options]
 */
export function createHttpMcpClient(baseUrl, options = {}) {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const mcpPath = options.mcpPath ?? '/mcp';
  const webhookPath = options.webhookPath ?? '/webhooks/ado';
  const healthzPath = options.healthzPath ?? '/healthz';
  const readyzPath = options.readyzPath ?? '/readyz';
  let activeProtocolVersion =
    options.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;
  const defaultHeaders = options.defaultHeaders ?? {};
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 15000;

  let sessionId = null;
  let nextId = 1; // NEVER 0 (SDK 1.32.2 cancel quirk)
  let lastResponseHeaders = {};
  let lastEvents = [];
  let lastEventId = undefined;

  /** @type {Set<{ close: () => void }>} */
  const activeStreams = new Set();

  function resolveUrl(reqPath) {
    if (/^https?:\/\//i.test(reqPath)) {
      return reqPath;
    }
    const cleanPath = reqPath.startsWith('/') ? reqPath : `/${reqPath}`;
    return `${normalizedBase}${cleanPath}`;
  }

  /**
   * Perform a raw HTTP request with full control over method, path, headers (including
   * forged `Host`, `Origin`, `Authorization`, `X-Azure-DevOps-PAT`), and body.
   *
   * @param {string} reqPath
   * @param {{
   *   method?: string,
   *   headers?: Record<string, string | number | string[] | undefined | null>,
   *   body?: string | Buffer | Uint8Array | Record<string, unknown> | null,
   *   timeoutMs?: number,
   * }} [opts]
   */
  function rawRequest(reqPath, opts = {}) {
    const mergedHeaders = mergeHeaders(defaultHeaders, opts.headers);
    return performNodeHttpRequest(resolveUrl(reqPath), {
      method: opts.method ?? 'GET',
      headers: mergedHeaders,
      body: opts.body,
      timeoutMs: opts.timeoutMs ?? defaultTimeoutMs,
    });
  }

  /**
   * Send a raw JSON-RPC payload to `POST {mcpPath}` and decode either `202 Accepted`,
   * `application/json`, or `text/event-stream` without throwing on non-2xx or JSON-RPC errors.
   *
   * @param {Record<string, unknown> | Array<Record<string, unknown>>} payload
   * @param {Record<string, string | undefined | null>} [headers]
   * @param {{ timeoutMs?: number, path?: string }} [opts]
   */
  async function callRpcRaw(payload, headers = {}, opts = {}) {
    const reqHeaders = mergeHeaders(
      defaultHeaders,
      {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': activeProtocolVersion,
        ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
      },
      headers,
    );

    const res = await performNodeHttpRequest(resolveUrl(opts.path ?? mcpPath), {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify(payload),
      timeoutMs: opts.timeoutMs ?? defaultTimeoutMs,
    });

    lastResponseHeaders = res.headers;
    const returnedSessionId = getHeader(res.headers, 'mcp-session-id');
    if (typeof returnedSessionId === 'string' && returnedSessionId.length > 0) {
      sessionId = returnedSessionId;
    }

    if (res.status === 202) {
      lastEvents = [];
      return {
        status: 202,
        headers: res.headers,
        rawBody: res.rawBody,
        text: res.text,
        message: null,
        notifications: [],
        events: [],
        lastEventId,
      };
    }

    const mediaType = getMediaTypeEssence(
      getHeader(res.headers, 'content-type'),
    );
    if (mediaType === 'text/event-stream') {
      const events = [];
      const notifications = [];
      const comments = [];
      let matchedMessage = null;
      const expectedId =
        payload && !Array.isArray(payload) && Object.hasOwn(payload, 'id')
          ? payload.id
          : undefined;

      const parser = createSseParser({
        onComment(comment) {
          comments.push(comment);
        },
        onLastEventId(id) {
          lastEventId = id;
        },
        onEvent(evt) {
          events.push(evt);
          // Skip empty priming event data (lastEventId already updated via onLastEventId)
          if (!evt.data || evt.json === null || typeof evt.json !== 'object') {
            return;
          }
          const msg = evt.json;
          if (
            expectedId !== undefined &&
            Object.hasOwn(msg, 'id') &&
            msg.id === expectedId &&
            !Object.hasOwn(msg, 'method')
          ) {
            matchedMessage = msg;
          } else if (typeof msg.method === 'string') {
            notifications.push(msg);
          } else if (matchedMessage === null) {
            matchedMessage = msg;
          }
        },
      });

      parser.feed(res.rawBody);
      parser.end();

      lastEvents = events;
      return {
        status: res.status,
        headers: res.headers,
        rawBody: res.rawBody,
        text: res.text,
        message: matchedMessage,
        notifications,
        events,
        comments,
        lastEventId: parser.lastEventId ?? lastEventId,
      };
    }

    lastEvents = [];
    return {
      status: res.status,
      headers: res.headers,
      rawBody: res.rawBody,
      text: res.text,
      message: res.json,
      notifications: [],
      events: [],
      lastEventId,
    };
  }

  /**
   * Send a JSON-RPC request over Streamable HTTP and resolve with `result`.
   * Rejects with `JsonRpcError` on JSON-RPC errors or `HttpResponseError` on non-2xx HTTP statuses.
   *
   * @param {string} method
   * @param {unknown} [params]
   * @param {Record<string, string | undefined | null>} [headers]
   * @param {{ timeoutMs?: number, path?: string }} [opts]
   */
  async function request(method, params, headers = {}, opts = {}) {
    const id = nextId++;
    const payload =
      params !== undefined
        ? { jsonrpc: '2.0', id, method, params }
        : { jsonrpc: '2.0', id, method };

    const raw = await callRpcRaw(payload, headers, opts);
    const hasJsonRpcError =
      raw.message &&
      typeof raw.message === 'object' &&
      raw.message.error &&
      typeof raw.message.error === 'object' &&
      typeof raw.message.error.code === 'number';

    if (raw.status < 200 || raw.status >= 300) {
      if (hasJsonRpcError) {
        throw new JsonRpcError(raw.message.error, {
          status: raw.status,
          headers: raw.headers,
        });
      }
      throw new HttpResponseError(
        raw.status,
        raw.headers,
        raw.rawBody,
        raw.text,
        raw.message,
      );
    }

    if (hasJsonRpcError) {
      throw new JsonRpcError(raw.message.error, {
        status: raw.status,
        headers: raw.headers,
      });
    }

    return raw.message ? raw.message.result : undefined;
  }

  /**
   * Send a JSON-RPC notification via `POST {mcpPath}` (expects 202/200/204).
   *
   * @param {string} method
   * @param {unknown} [params]
   * @param {Record<string, string | undefined | null>} [headers]
   * @param {{ timeoutMs?: number, path?: string }} [opts]
   */
  async function notify(method, params, headers = {}, opts = {}) {
    const payload =
      params !== undefined
        ? { jsonrpc: '2.0', method, params }
        : { jsonrpc: '2.0', method };
    const raw = await callRpcRaw(payload, headers, opts);
    if (raw.status < 200 || raw.status >= 300) {
      throw new HttpResponseError(
        raw.status,
        raw.headers,
        raw.rawBody,
        raw.text,
        raw.message,
      );
    }
    return { status: raw.status, headers: raw.headers };
  }

  /**
   * Initialize an MCP Streamable HTTP session (`initialize` + `notifications/initialized`).
   * Automatically captures `mcp-session-id` header if returned by the server.
   *
   * @param {{ name: string, version: string }} [clientInfo]
   * @param {Record<string, string | undefined | null>} [headers]
   * @param {{ protocolVersion?: string, capabilities?: Record<string, unknown>, sendInitialized?: boolean, timeoutMs?: number }} [opts]
   */
  async function initialize(
    clientInfo = { name: 'e2e-http-harness', version: '1.0.0' },
    headers = {},
    opts = {},
  ) {
    const requestedVersion = opts.protocolVersion ?? activeProtocolVersion;
    const initHeaders = hasHeader(headers, 'mcp-protocol-version')
      ? headers
      : { 'MCP-Protocol-Version': requestedVersion, ...headers };
    const result = await request(
      'initialize',
      {
        protocolVersion: requestedVersion,
        capabilities: opts.capabilities ?? {},
        clientInfo,
      },
      initHeaders,
      { timeoutMs: opts.timeoutMs },
    );
    const negotiatedVersion =
      result &&
      typeof result === 'object' &&
      typeof result.protocolVersion === 'string' &&
      result.protocolVersion.length > 0
        ? result.protocolVersion
        : requestedVersion;
    activeProtocolVersion = negotiatedVersion;
    if (opts.sendInitialized !== false) {
      const initializedHeaders = hasHeader(headers, 'mcp-protocol-version')
        ? headers
        : { 'MCP-Protocol-Version': negotiatedVersion, ...headers };
      await notify('notifications/initialized', undefined, initializedHeaders, {
        timeoutMs: opts.timeoutMs,
      });
    }
    return result;
  }

  function listTools(headers = {}) {
    return request('tools/list', undefined, headers);
  }

  function callTool(name, args = {}, headers = {}, opts = {}) {
    return request('tools/call', { name, arguments: args }, headers, opts);
  }

  function listResources(headers = {}) {
    return request('resources/list', undefined, headers);
  }

  function listResourceTemplates(headers = {}) {
    return request('resources/templates/list', undefined, headers);
  }

  function readResource(uri, headers = {}) {
    return request('resources/read', { uri }, headers);
  }

  function subscribeResource(uri, headers = {}) {
    return request('resources/subscribe', { uri }, headers);
  }

  function unsubscribeResource(uri, headers = {}) {
    return request('resources/unsubscribe', { uri }, headers);
  }

  const SSE_OPTION_KEYS = new Set([
    'path',
    'method',
    'body',
    'headers',
    'lastEventId',
    'timeoutMs',
  ]);

  /**
   * Open a live SSE stream (`GET /mcp` standalone stream or `POST /mcp` streaming call like `events/stream`).
   *
   * Accepts either an options object `{ path?, method?, body?, headers?, lastEventId?, timeoutMs? }`
   * OR a plain headers object directly (e.g. `{ 'Last-Event-ID': '...' }`).
   *
   * @param {Record<string, any>} [optsOrHeaders]
   */
  function openSseStream(optsOrHeaders = {}) {
    let opts = optsOrHeaders ?? {};
    const keys = Object.keys(opts);
    if (keys.length > 0 && keys.every((k) => !SSE_OPTION_KEYS.has(k))) {
      opts = { headers: opts };
    }

    const method = (opts.method ?? 'GET').toUpperCase();
    const targetUrl = resolveUrl(opts.path ?? mcpPath);
    const urlObj = new URL(targetUrl);
    const transport = urlObj.protocol === 'https:' ? https : http;
    const connectTimeoutMs = opts.timeoutMs ?? defaultTimeoutMs;

    let bodyBuf = null;
    if (opts.body !== undefined && opts.body !== null) {
      if (Buffer.isBuffer(opts.body)) {
        bodyBuf = opts.body;
      } else if (ArrayBuffer.isView(opts.body)) {
        bodyBuf = Buffer.from(
          opts.body.buffer,
          opts.body.byteOffset,
          opts.body.byteLength,
        );
      } else if (typeof opts.body === 'string') {
        bodyBuf = Buffer.from(opts.body, 'utf8');
      } else {
        bodyBuf = Buffer.from(JSON.stringify(opts.body), 'utf8');
      }
    }

    const baseHeaders = {
      Accept:
        method === 'POST'
          ? 'application/json, text/event-stream'
          : 'text/event-stream',
      'MCP-Protocol-Version': activeProtocolVersion,
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
      ...(opts.lastEventId
        ? { 'Last-Event-ID': String(opts.lastEventId) }
        : {}),
      ...(bodyBuf ? { 'Content-Type': 'application/json' } : {}),
    };
    const reqHeaders = mergeHeaders(defaultHeaders, baseHeaders, opts.headers);
    if (
      bodyBuf &&
      !hasHeader(reqHeaders, 'content-length') &&
      !hasHeader(reqHeaders, 'transfer-encoding')
    ) {
      reqHeaders['Content-Length'] = String(bodyBuf.length);
    }

    return new Promise((resolve, reject) => {
      let headersSettled = false;
      let streamClosed = false;
      let streamError = null;
      const events = [];
      const comments = [];
      const consumedEventIndices = new Set();
      /** @type {Set<{ predicate: (e: any) => boolean, resolve: Function, reject: Function, timer: NodeJS.Timeout | null }>} */
      const waiters = new Set();
      /** @type {Set<() => void>} */
      const iteratorWakeups = new Set();

      const parser = createSseParser({
        onComment(comment) {
          comments.push(comment);
        },
        onLastEventId(id) {
          lastEventId = id;
        },
        onEvent(evt) {
          const idx = events.length;
          events.push(evt);
          for (const waiter of Array.from(waiters)) {
            let matched;
            try {
              matched = Boolean(waiter.predicate(evt));
            } catch {
              matched = false;
            }
            if (matched) {
              consumedEventIndices.add(idx);
              if (waiter.timer) {
                clearTimeout(waiter.timer);
              }
              waiters.delete(waiter);
              waiter.resolve(evt);
              break;
            }
          }
          for (const wake of Array.from(iteratorWakeups)) {
            wake();
          }
        },
      });

      function finishStream(err) {
        if (streamClosed) {
          return;
        }
        streamClosed = true;
        if (err) {
          streamError = err;
        }
        parser.end();
        for (const waiter of Array.from(waiters)) {
          if (waiter.timer) {
            clearTimeout(waiter.timer);
          }
          waiters.delete(waiter);
          waiter.reject(
            err || new Error('SSE stream closed before matching event arrived'),
          );
        }
        for (const wake of Array.from(iteratorWakeups)) {
          wake();
        }
        activeStreams.delete(handle);
      }

      let currentRes = null;

      function closeStream() {
        if (!streamClosed) {
          streamClosed = true;
          for (const waiter of Array.from(waiters)) {
            if (waiter.timer) {
              clearTimeout(waiter.timer);
            }
            waiters.delete(waiter);
            waiter.reject(new Error('SSE stream was closed by client'));
          }
          for (const wake of Array.from(iteratorWakeups)) {
            wake();
          }
        }
        try {
          currentRes?.destroy();
        } catch {
          // ignore
        }
        try {
          req.destroy();
        } catch {
          // ignore
        }
        activeStreams.delete(handle);
      }

      function waitForEvent(predicate, timeoutMs = 5000, waitOpts = {}) {
        const predFn = typeof predicate === 'function' ? predicate : () => true;

        if (waitOpts.includeBuffered !== false) {
          for (let i = 0; i < events.length; i += 1) {
            if (consumedEventIndices.has(i)) {
              continue;
            }
            let matched;
            try {
              matched = Boolean(predFn(events[i]));
            } catch {
              matched = false;
            }
            if (matched) {
              consumedEventIndices.add(i);
              return Promise.resolve(events[i]);
            }
          }
        }

        if (streamClosed) {
          return Promise.reject(
            streamError || new Error('SSE stream is already closed'),
          );
        }

        return new Promise((resWait, rejWait) => {
          const waiter = {
            predicate: predFn,
            resolve: resWait,
            reject: rejWait,
            timer: null,
          };
          waiter.timer = setTimeout(() => {
            waiters.delete(waiter);
            const err = new Error(
              `Timed out after ${timeoutMs}ms waiting for SSE event`,
            );
            err.code = 'ETIMEDOUT';
            rejWait(err);
          }, timeoutMs);
          waiter.timer.unref();
          waiters.add(waiter);
        });
      }

      function nextEvent(timeoutMs = 5000) {
        return waitForEvent(() => true, timeoutMs);
      }

      const handle = {
        status: 0,
        headers: {},
        text: '',
        json: null,
        events,
        comments,
        get lastEventId() {
          return parser.lastEventId;
        },
        get retryMs() {
          return parser.retryMs;
        },
        get closed() {
          return streamClosed;
        },
        waitForEvent,
        nextEvent,
        close: closeStream,
        async *[Symbol.asyncIterator]() {
          let cursor = 0;
          while (true) {
            while (cursor < events.length) {
              yield events[cursor++];
            }
            if (streamClosed) {
              return;
            }
            await new Promise((resWake) => {
              const wake = () => {
                iteratorWakeups.delete(wake);
                resWake();
              };
              iteratorWakeups.add(wake);
            });
          }
        },
      };

      const req = transport.request(
        {
          protocol: urlObj.protocol,
          hostname: stripIpv6Brackets(urlObj.hostname),
          port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
          path: `${urlObj.pathname}${urlObj.search}`,
          method,
          headers: reqHeaders,
          agent: false,
        },
        (res) => {
          currentRes = res;
          handle.status = res.statusCode ?? 0;
          handle.headers = res.headers;

          const returnedSid = getHeader(res.headers, 'mcp-session-id');
          if (typeof returnedSid === 'string' && returnedSid.length > 0) {
            sessionId = returnedSid;
          }

          const mediaType = getMediaTypeEssence(
            getHeader(res.headers, 'content-type'),
          );

          // Non-2xx or non-SSE responses: buffer full body cleanly and resolve handle
          if (
            handle.status < 200 ||
            handle.status >= 300 ||
            mediaType !== 'text/event-stream'
          ) {
            const bodyChunks = [];
            res.on('data', (c) => {
              bodyChunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
            });
            res.on('end', () => {
              clearTimeout(connectTimer);
              handle.text = Buffer.concat(bodyChunks).toString('utf8');
              handle.json = safeJsonParse(handle.text);
              streamClosed = true;
              if (!headersSettled) {
                headersSettled = true;
                resolve(handle);
              }
            });
            res.on('error', (err) => {
              clearTimeout(connectTimer);
              if (!headersSettled) {
                headersSettled = true;
                reject(err);
              }
            });
            return;
          }

          clearTimeout(connectTimer);
          activeStreams.add(handle);

          res.on('data', (chunk) => {
            parser.feed(chunk);
          });
          res.on('end', () => {
            finishStream(null);
          });
          res.on('close', () => {
            finishStream(null);
          });
          res.on('error', (err) => {
            finishStream(err);
          });

          if (!headersSettled) {
            headersSettled = true;
            resolve(handle);
          }
        },
      );

      const connectTimer = setTimeout(() => {
        if (headersSettled) {
          return;
        }
        headersSettled = true;
        req.destroy();
        const err = new Error(
          `Timed out after ${connectTimeoutMs}ms opening SSE stream (${method} ${targetUrl})`,
        );
        err.code = 'ETIMEDOUT';
        reject(err);
      }, connectTimeoutMs);
      connectTimer.unref();

      req.on('error', (err) => {
        // Tolerate EPIPE/ECONNRESET if server already sent an early 403/413 response and closed socket
        if (
          currentRes &&
          err &&
          (err.code === 'EPIPE' ||
            err.code === 'ECONNRESET' ||
            err.code === 'ERR_STREAM_WRITE_AFTER_END')
        ) {
          return;
        }
        if (!headersSettled) {
          headersSettled = true;
          clearTimeout(connectTimer);
          reject(err);
        } else {
          finishStream(err);
        }
      });

      if (bodyBuf && bodyBuf.length > 0) {
        req.end(bodyBuf);
      } else {
        req.end();
      }
    });
  }

  /**
   * Convenience wrapper to open a long-lived JSON-RPC POST SSE stream (e.g., `events/stream`).
   *
   * @param {string} method
   * @param {unknown} [params]
   * @param {Record<string, string | undefined | null>} [headers]
   * @param {{ timeoutMs?: number, path?: string }} [opts]
   */
  function openPostStream(method, params, headers = {}, opts = {}) {
    const id = nextId++;
    const payload =
      params !== undefined
        ? { jsonrpc: '2.0', id, method, params }
        : { jsonrpc: '2.0', id, method };
    return openSseStream({
      method: 'POST',
      path: opts.path ?? mcpPath,
      body: payload,
      headers,
      timeoutMs: opts.timeoutMs,
    }).then((stream) => {
      stream.requestId = id;
      return stream;
    });
  }

  /**
   * Terminate the active stateful MCP session via `DELETE {mcpPath}`.
   *
   * @param {Record<string, string | undefined | null>} [headers]
   */
  async function deleteSession(headers = {}) {
    const reqHeaders = mergeHeaders(
      defaultHeaders,
      {
        'MCP-Protocol-Version': activeProtocolVersion,
        ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
      },
      headers,
    );
    const res = await performNodeHttpRequest(resolveUrl(mcpPath), {
      method: 'DELETE',
      headers: reqHeaders,
      timeoutMs: defaultTimeoutMs,
    });
    if (res.status >= 200 && res.status < 300) {
      sessionId = null;
    }
    return res;
  }

  /**
   * Post an Azure DevOps Service Hook payload to `POST {webhookPath}`.
   *
   * @param {string | Buffer | Record<string, unknown>} payload
   * @param {Record<string, string | undefined | null>} [headers]
   */
  function postWebhook(payload, headers = {}) {
    const reqHeaders = mergeHeaders(
      { 'Content-Type': 'application/json' },
      defaultHeaders,
      headers,
    );
    return performNodeHttpRequest(resolveUrl(webhookPath), {
      method: 'POST',
      headers: reqHeaders,
      body: payload,
      timeoutMs: defaultTimeoutMs,
    });
  }

  function getHealthz(headers = {}) {
    return rawRequest(healthzPath, { method: 'GET', headers });
  }

  function getReadyz(headers = {}) {
    return rawRequest(readyzPath, { method: 'GET', headers });
  }

  function close() {
    for (const stream of Array.from(activeStreams)) {
      stream.close();
    }
    activeStreams.clear();
  }

  return {
    get sessionId() {
      return sessionId;
    },
    set sessionId(val) {
      sessionId = val;
    },
    get lastResponseHeaders() {
      return lastResponseHeaders;
    },
    get lastEvents() {
      return lastEvents;
    },
    get lastEventId() {
      return lastEventId;
    },
    rawRequest,
    callRpcRaw,
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
    openSseStream,
    openPostStream,
    deleteSession,
    postWebhook,
    getHealthz,
    getReadyz,
    close,
  };
}
