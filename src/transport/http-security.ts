import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { AzureDevOpsValidationError } from '../shared/errors/index.ts';

export const MAX_MCP_BODY_BYTES = 4 * 1024 * 1024;
export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

/**
 * Local filesystem tools that MUST remain disabled by default under Streamable HTTP
 * transport to prevent arbitrary container/host file reads or writes over the network.
 */
export const HTTP_LOCKED_OUT_TOOLS = [
  'create_work_item_attachment',
  'get_work_item_attachment',
] as const;

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1']);
const DEFAULT_ALLOWED_ORIGINS = new Set([
  'http://localhost',
  'http://127.0.0.1',
  'http://::1',
  'https://localhost',
  'https://127.0.0.1',
  'https://::1',
]);

export interface HostAndOriginValidationOptions {
  allowedHosts?: readonly string[];
  allowedOrigins?: readonly string[];
}

export type HostAndOriginValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: 403; readonly reason: string };

export interface HttpServerSecurityConfig {
  host: string;
  authToken?: string;
  allowUnauthenticated?: boolean;
}

export type ReadBoundedBodyResult =
  | { readonly ok: true; readonly rawBody: Buffer; readonly text: string }
  | { readonly ok: false; readonly status: 413; readonly reason: string };

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

/**
 * Parses a Host header or hostname token (optionally with `:port`) into a
 * lowercase, bracket-stripped hostname. Rejects whitespace, credentials, paths,
 * queries, fragments, and malformed hosts.
 */
function parseHostnamePortAgnostic(rawHost: string): string | undefined {
  const trimmed = rawHost.trim();
  if (!trimmed || /[\s/@?#\\]/.test(trimmed)) {
    return undefined;
  }

  // Handle bare unbracketed IPv6 literals such as `::1` or `::`
  const colonCount = (trimmed.match(/:/g) ?? []).length;
  const candidateForUrl =
    !trimmed.startsWith('[') && colonCount > 1 ? `[${trimmed}]` : trimmed;

  try {
    const parsed = new URL(`http://${candidateForUrl}`);
    if (
      parsed.username !== '' ||
      parsed.password !== '' ||
      parsed.pathname !== '/' ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      return undefined;
    }
    return stripIpv6Brackets(parsed.hostname.toLowerCase());
  } catch {
    return undefined;
  }
}

/**
 * Parses an Origin header into a port-agnostic `scheme://hostname` key.
 * Only `http:` and `https:` origins without credentials/path/query/fragment are accepted.
 */
function parseOriginPortAgnostic(rawOrigin: string): string | undefined {
  const trimmed = rawOrigin.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return undefined;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    if (
      parsed.username !== '' ||
      parsed.password !== '' ||
      parsed.pathname !== '/' ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      return undefined;
    }
    const hostname = stripIpv6Brackets(parsed.hostname.toLowerCase());
    if (!hostname) {
      return undefined;
    }
    return `${parsed.protocol}//${hostname}`;
  } catch {
    return undefined;
  }
}

/**
 * Returns true if the provided host string resolves to a loopback address
 * (`127.0.0.1`, `localhost`, `::1`, or `[::1]`).
 */
export function isLoopbackHost(host: string): boolean {
  const parsed = parseHostnamePortAgnostic(host);
  return parsed !== undefined && LOOPBACK_HOSTNAMES.has(parsed);
}

/**
 * Fail-closed startup guard: refuses non-loopback binds (e.g., `0.0.0.0` or `::`)
 * unless an authentication token is configured or `allowUnauthenticated: true`
 * is explicitly opted in.
 */
export function validateHttpServerSecurityConfig(
  options: HttpServerSecurityConfig,
): void {
  const hasAuthToken =
    typeof options.authToken === 'string' &&
    options.authToken.trim().length > 0;

  if (
    !isLoopbackHost(options.host) &&
    !hasAuthToken &&
    options.allowUnauthenticated !== true
  ) {
    throw new AzureDevOpsValidationError(
      `Refusing to bind Streamable HTTP server to non-loopback host "${options.host}" without authentication. Configure --http-auth-token (AZURE_DEVOPS_HTTP_AUTH_TOKEN) or explicitly opt in with --allow-unauthenticated.`,
    );
  }
}

/**
 * Validates HTTP `Host` (port-agnostic against loopback + custom allowlist)
 * and `Origin` (when present, port-agnostic scheme+hostname check against
 * loopback + custom allowlist) to prevent DNS rebinding and cross-site attacks.
 *
 * Call this BEFORE reading the request body.
 */
export function validateHostAndOrigin(
  req: IncomingMessage,
  options: HostAndOriginValidationOptions = {},
): HostAndOriginValidationResult {
  const rawHost = req.headers.host;
  if (typeof rawHost !== 'string') {
    return {
      ok: false,
      status: 403,
      reason: 'Forbidden: Missing or invalid Host header',
    };
  }

  const parsedHost = parseHostnamePortAgnostic(rawHost);
  if (!parsedHost) {
    return {
      ok: false,
      status: 403,
      reason: 'Forbidden: Invalid Host header',
    };
  }

  const allowedHosts = new Set<string>(LOOPBACK_HOSTNAMES);
  if (options.allowedHosts) {
    for (const entry of options.allowedHosts) {
      const normalized = parseHostnamePortAgnostic(entry);
      if (normalized) {
        allowedHosts.add(normalized);
      }
    }
  }

  if (!allowedHosts.has(parsedHost)) {
    return {
      ok: false,
      status: 403,
      reason: `Forbidden: Host "${parsedHost}" is not in the allowed hosts list`,
    };
  }

  const rawOrigin = req.headers.origin;
  if (rawOrigin !== undefined) {
    if (typeof rawOrigin !== 'string') {
      return {
        ok: false,
        status: 403,
        reason: 'Forbidden: Invalid Origin header',
      };
    }

    const parsedOrigin = parseOriginPortAgnostic(rawOrigin);
    if (!parsedOrigin) {
      return {
        ok: false,
        status: 403,
        reason: 'Forbidden: Invalid Origin header',
      };
    }

    const allowedOrigins = new Set<string>(DEFAULT_ALLOWED_ORIGINS);
    if (options.allowedOrigins) {
      for (const entry of options.allowedOrigins) {
        const normalized = parseOriginPortAgnostic(entry);
        if (normalized) {
          allowedOrigins.add(normalized);
        }
      }
    }

    if (!allowedOrigins.has(parsedOrigin)) {
      return {
        ok: false,
        status: 403,
        reason: `Forbidden: Origin "${rawOrigin}" is not in the allowed origins list`,
      };
    }
  }

  return { ok: true };
}

function timingSafeTokenEqual(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided, 'utf8').digest();
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

/**
 * Verifies HTTP request credentials using constant-time SHA-256 digest
 * comparison against `Authorization: Bearer <token>` or `X-API-Key: <token>`.
 */
export function verifyHttpBearerAuth(
  req: IncomingMessage,
  authToken: string,
): boolean {
  if (!authToken) {
    return false;
  }

  const authorization = req.headers.authorization;
  if (authorization !== undefined) {
    if (typeof authorization !== 'string') {
      return false;
    }
    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    if (!match) {
      return false;
    }
    return timingSafeTokenEqual(match[1], authToken);
  }

  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.length > 0) {
    return timingSafeTokenEqual(apiKey.trim(), authToken);
  }

  return false;
}

/**
 * Streams an HTTP request body up to `maxBytes` without buffering unbounded memory.
 * Returns `{ ok: false, status: 413, reason }` if the declared `Content-Length`
 * or streamed byte count exceeds `maxBytes`.
 */
export function readBoundedBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<ReadBoundedBodyResult> {
  if (!Number.isInteger(maxBytes) || maxBytes < 0) {
    return Promise.reject(
      new RangeError(
        `maxBytes must be a non-negative integer, got ${maxBytes}`,
      ),
    );
  }

  const contentLengthHeader = req.headers['content-length'];
  if (typeof contentLengthHeader === 'string') {
    const declaredLength = Number(contentLengthHeader.trim());
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      req.pause();
      return Promise.resolve({
        ok: false,
        status: 413,
        reason: `Payload Too Large: request body exceeds limit of ${maxBytes} bytes`,
      });
    }
  }

  return new Promise<ReadBoundedBodyResult>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const cleanup = () => {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
      req.off('aborted', onAborted);
    };

    const onData = (chunk: Buffer | string) => {
      if (settled) {
        return;
      }
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
      totalBytes += buf.byteLength;
      if (totalBytes > maxBytes) {
        settled = true;
        chunks.length = 0;
        cleanup();
        req.pause();
        resolve({
          ok: false,
          status: 413,
          reason: `Payload Too Large: request body exceeds limit of ${maxBytes} bytes`,
        });
        return;
      }
      chunks.push(buf);
    };

    const onEnd = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      const rawBody = Buffer.concat(chunks, totalBytes);
      resolve({
        ok: true,
        rawBody,
        text: rawBody.toString('utf8'),
      });
    };

    const onError = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      chunks.length = 0;
      cleanup();
      reject(error);
    };

    const onAborted = () => {
      if (settled) {
        return;
      }
      settled = true;
      chunks.length = 0;
      cleanup();
      reject(new Error('Request aborted before body completed'));
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onAborted);
  });
}
