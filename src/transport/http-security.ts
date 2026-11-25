import { timingSafeEqual } from 'node:crypto';
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

/**
 * Constant-time UTF-8 string comparison using zero-padded buffers so
 * `timingSafeEqual` never receives mismatched lengths or leaks token bytes.
 */
export function timingSafeTokenEqual(
  provided: string,
  expected: string,
): boolean {
  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const maxLen = Math.max(providedBuf.length, expectedBuf.length, 1);
  const paddedProvided = Buffer.alloc(maxLen);
  const paddedExpected = Buffer.alloc(maxLen);
  providedBuf.copy(paddedProvided);
  expectedBuf.copy(paddedExpected);
  const bytesEqual = timingSafeEqual(paddedProvided, paddedExpected);
  return bytesEqual && providedBuf.length === expectedBuf.length;
}

/**
 * Verifies HTTP request credentials using constant-time comparison
 * against `Authorization: Bearer <token>` or `X-API-Key: <token>`.
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
    const trimmed = authorization.trim();
    if (trimmed.length <= 7 || trimmed.slice(0, 6).toLowerCase() !== 'bearer') {
      return false;
    }
    const sep = trimmed[6];
    if (sep !== ' ' && sep !== '\t') {
      return false;
    }
    const token = trimmed.slice(7).trim();
    if (token.length === 0) {
      return false;
    }
    return timingSafeTokenEqual(token, authToken);
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
      req.off('close', onClose);
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

    const onClose = () => {
      if (settled || req.complete) {
        return;
      }
      settled = true;
      chunks.length = 0;
      cleanup();
      reject(new Error('Request closed before body completed'));
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onAborted);
    req.on('close', onClose);
  });
}

export interface SlidingWindowRateLimiterOptions {
  /** Maximum events permitted per key within `windowMs` (integer >= 1). */
  readonly limit: number;
  /** Sliding window duration in milliseconds (finite number >= 1). */
  readonly windowMs: number;
  /** Maximum distinct keys retained in memory (integer >= 1). */
  readonly maxKeys: number;
  /** Optional clock provider (defaults to `Date.now`). */
  readonly now?: () => number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

/**
 * Zero-dependency, bounded-memory sliding-window rate limiter keyed by client
 * identifier (e.g., `req.socket.remoteAddress`). Evicts expired keys before
 * oldest keys whenever `maxKeys` is reached so attackers cannot exhaust memory.
 */
export class SlidingWindowRateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;
  private readonly now: () => number;
  private readonly buckets = new Map<string, number[]>();

  constructor(options: SlidingWindowRateLimiterOptions) {
    if (!Number.isInteger(options.limit) || options.limit < 1) {
      throw new RangeError(
        `limit must be an integer >= 1, got ${options.limit}`,
      );
    }
    if (!Number.isFinite(options.windowMs) || options.windowMs < 1) {
      throw new RangeError(
        `windowMs must be a finite number >= 1, got ${options.windowMs}`,
      );
    }
    if (!Number.isInteger(options.maxKeys) || options.maxKeys < 1) {
      throw new RangeError(
        `maxKeys must be an integer >= 1, got ${options.maxKeys}`,
      );
    }
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.maxKeys = options.maxKeys;
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.buckets.size;
  }

  clear(): void {
    this.buckets.clear();
  }

  /**
   * Inspects whether `key` is currently within its quota without consuming a slot.
   */
  check(key: string): RateLimitDecision {
    const now = this.now();
    const cutoff = now - this.windowMs;
    const existing = this.buckets.get(key);
    if (!existing) {
      return { allowed: true, remaining: this.limit, retryAfterSeconds: 0 };
    }

    const active = this.pruneTimestamps(existing, cutoff);
    if (active.length === 0) {
      this.buckets.delete(key);
      return { allowed: true, remaining: this.limit, retryAfterSeconds: 0 };
    }
    if (active !== existing) {
      this.buckets.set(key, active);
    }

    if (active.length >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: this.computeRetryAfterSeconds(active[0], now),
      };
    }

    return {
      allowed: true,
      remaining: this.limit - active.length,
      retryAfterSeconds: 0,
    };
  }

  /**
   * Checks quota for `key` and, if allowed, records a new event in the current window.
   */
  consume(key: string): RateLimitDecision {
    const now = this.now();
    const cutoff = now - this.windowMs;
    const existing = this.buckets.get(key);
    const active = existing ? this.pruneTimestamps(existing, cutoff) : [];

    if (active.length >= this.limit) {
      if (existing && active !== existing) {
        this.buckets.set(key, active);
      }
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: this.computeRetryAfterSeconds(active[0], now),
      };
    }

    if (!this.buckets.has(key)) {
      this.evictIfFull(cutoff);
    }

    const updated = [...active, now];
    this.buckets.delete(key);
    this.buckets.set(key, updated);

    return {
      allowed: true,
      remaining: this.limit - updated.length,
      retryAfterSeconds: 0,
    };
  }

  /**
   * Unconditionally records an event for `key` (for example, an authentication
   * failure) while capping stored timestamps per key to `limit`.
   */
  record(key: string): RateLimitDecision {
    const now = this.now();
    const cutoff = now - this.windowMs;
    const existing = this.buckets.get(key);
    const active = existing ? this.pruneTimestamps(existing, cutoff) : [];

    if (!this.buckets.has(key)) {
      this.evictIfFull(cutoff);
    }

    const appended = [...active, now];
    const bounded =
      appended.length > this.limit
        ? appended.slice(appended.length - this.limit)
        : appended;

    this.buckets.delete(key);
    this.buckets.set(key, bounded);

    if (bounded.length >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: this.computeRetryAfterSeconds(bounded[0], now),
      };
    }

    return {
      allowed: true,
      remaining: this.limit - bounded.length,
      retryAfterSeconds: 0,
    };
  }

  private pruneTimestamps(timestamps: number[], cutoff: number): number[] {
    let firstValid = 0;
    while (firstValid < timestamps.length && timestamps[firstValid] <= cutoff) {
      firstValid += 1;
    }
    return firstValid === 0 ? timestamps : timestamps.slice(firstValid);
  }

  private computeRetryAfterSeconds(
    oldestTimestamp: number,
    now: number,
  ): number {
    const remainingMs = oldestTimestamp + this.windowMs - now;
    return Math.max(1, Math.ceil(remainingMs / 1000));
  }

  private evictIfFull(cutoff: number): void {
    if (this.buckets.size < this.maxKeys) {
      return;
    }
    for (const [k, timestamps] of this.buckets) {
      const latest = timestamps[timestamps.length - 1];
      if (latest === undefined || latest <= cutoff) {
        this.buckets.delete(k);
      }
    }
    while (this.buckets.size >= this.maxKeys) {
      const oldestKey = this.buckets.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.buckets.delete(oldestKey);
    }
  }
}

function normalizeClientIp(raw: string): string {
  let value = raw.trim().toLowerCase();
  if (value.startsWith('[') && value.endsWith(']')) {
    value = value.slice(1, -1);
  }
  if (value.startsWith('::ffff:')) {
    const v4 = value.slice('::ffff:'.length);
    if (v4.includes('.')) {
      return v4;
    }
  }
  return value;
}

/**
 * Normalizes a list of operator-declared trusted reverse-proxy IP addresses
 * into a lookup set (`::ffff:127.0.0.1` -> `127.0.0.1`, lowercase trimmed).
 */
export function normalizeTrustedProxies(
  proxies?: readonly string[],
): ReadonlySet<string> {
  const set = new Set<string>();
  if (!proxies) {
    return set;
  }
  for (const raw of proxies) {
    const normalized = normalizeClientIp(raw);
    if (normalized.length > 0) {
      set.add(normalized);
    }
  }
  return set;
}

/**
 * Resolves the per-client rate-limit key for an incoming HTTP request.
 *
 * - By default (`trustedProxies` empty or `remoteAddress` not in `trustedProxies`),
 *   strictly uses `req.socket.remoteAddress` and ignores spoofable `X-Forwarded-For`.
 * - When `remoteAddress` IS an operator-declared trusted proxy, walks `X-Forwarded-For`
 *   right-to-left and returns the rightmost IP not in `trustedProxies` so a client
 *   cannot spoof its rate-limit key by prepending fake addresses, while clients behind
 *   a reverse proxy get independent rate-limit and auth-lockout buckets.
 */
export function resolveClientRateLimitKey(
  req: IncomingMessage,
  trustedProxies?: ReadonlySet<string>,
): string {
  const rawRemote = req.socket?.remoteAddress;
  const remoteIp = rawRemote ? normalizeClientIp(rawRemote) : 'unknown';
  if (
    !trustedProxies ||
    trustedProxies.size === 0 ||
    !trustedProxies.has(remoteIp)
  ) {
    return remoteIp;
  }

  const xffHeader = req.headers['x-forwarded-for'];
  const xffRaw = Array.isArray(xffHeader) ? xffHeader.join(',') : xffHeader;
  if (typeof xffRaw !== 'string' || xffRaw.trim().length === 0) {
    return remoteIp;
  }

  const hops = xffRaw
    .split(',')
    .map((part) => normalizeClientIp(part))
    .filter((part) => part.length > 0);

  for (let i = hops.length - 1; i >= 0; i -= 1) {
    if (!trustedProxies.has(hops[i])) {
      return hops[i];
    }
  }

  return hops[0] ?? remoteIp;
}
