import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import type {
  IncomingMessage,
  Server as HttpServer,
  ServerResponse,
} from 'node:http';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  AzureDevOpsValidationError,
  redactSecrets,
} from '../shared/errors/index.ts';
import { logDebug, logError, logInfo, logWarn } from '../shared/logging.ts';
import { BoundedEventStore } from './bounded-event-store.ts';
import {
  HTTP_LOCKED_OUT_TOOLS,
  MAX_MCP_BODY_BYTES,
  MAX_WEBHOOK_BODY_BYTES,
  SlidingWindowRateLimiter,
  isLoopbackHost,
  normalizeTrustedProxies,
  readBoundedBody,
  resolveClientRateLimitKey,
  validateHostAndOrigin,
  validateHttpServerSecurityConfig,
  verifyHttpBearerAuth,
} from './http-security.ts';

export type StreamableHttpMode = 'stateful' | 'stateless';

export interface HttpServerFactoryOverrides {
  personalAccessToken?: string;
  disabledTools: string[];
  sessionId?: string;
}

export interface HttpServerFactoryResult {
  server: Server;
  cleanup?: () => void | Promise<void>;
}

export interface WebhookHandlerResult {
  status: number;
  body: Record<string, unknown>;
}

export interface StreamableHttpTransportOptions {
  /** Bind address (default: '127.0.0.1'). */
  host?: string;
  /** Bind port (default: 3000; 0 selects an ephemeral port). */
  port?: number;
  /** MCP endpoint path (default: '/mcp'). */
  path?: string;
  /** Session mode: 'stateful' (default) or 'stateless'. */
  mode?: StreamableHttpMode;
  /** Return application/json responses instead of SSE when possible (default: false). */
  enableJsonResponse?: boolean;
  /** Additional allowed Host header hostnames beyond loopback defaults. */
  allowedHosts?: string[];
  /** Additional allowed Origin header origins beyond loopback defaults. */
  allowedOrigins?: string[];
  /**
   * Operator-declared reverse-proxy IPs whose `X-Forwarded-For` header may be
   * parsed right-to-left (picking the rightmost untrusted hop) for per-client
   * rate limiting and auth-failure lockouts. Empty by default.
   */
  trustedProxies?: string[];
  /** Optional Bearer / X-API-Key authentication token for the MCP endpoint. */
  authToken?: string;
  /** Opt-in support for per-request/session `X-Azure-DevOps-PAT` header (default: false). */
  allowPerRequestPat?: boolean;
  /**
   * When true (with `allowPerRequestPat: true`), fail closed with HTTP 401 if a
   * request omits `X-Azure-DevOps-PAT` (e.g. PAT auth mode started without a global PAT).
   */
  requirePerRequestPat?: boolean;
  /** Explicit unsafe opt-in allowing non-loopback binds without authToken (default: false). */
  allowUnauthenticated?: boolean;
  /** Maximum concurrent stateful MCP sessions (default: 100). */
  maxSessions?: number;
  /** Maximum concurrent in-flight stateless MCP requests (default: maxSessions, i.e. 100). */
  maxConcurrentStatelessRequests?: number;
  /** Idle timeout in milliseconds before reaping stateful sessions (default: 30 min). */
  sessionIdleTimeoutMs?: number;
  /** Graceful shutdown drain timeout in milliseconds (default: 10s). */
  shutdownDrainMs?: number;
  /** Shared secret enabling POST /webhooks/ado (endpoint returns 404 when unset). */
  webhookSecret?: string;
  /** Maximum webhook requests per client IP per rate-limit window (default: 120). */
  webhookRateLimitPerMinute?: number;
  /** Maximum failed webhook auth attempts per client IP per rate-limit window (default: 20). */
  webhookAuthFailLimitPerMinute?: number;
  /** Sliding window duration in milliseconds for webhook rate limiting (default: 60000). */
  webhookRateLimitWindowMs?: number;
  /** Maximum MCP HTTP requests per client IP per rate-limit window (default: 600). */
  mcpRateLimitPerMinute?: number;
  /** Maximum failed MCP Bearer/API-key auth attempts per client IP per rate-limit window (default: 20). */
  mcpAuthFailLimitPerMinute?: number;
  /** Sliding window duration in milliseconds for MCP HTTP rate limiting (default: 60000). */
  mcpRateLimitWindowMs?: number;
  /** Maximum /healthz & /readyz probes per client IP per window (separate from /mcp budget; default: 600). */
  healthRateLimitPerMinute?: number;
  /** Maximum distinct client IP keys tracked by each rate limiter (default: 1024). */
  maxTrackedRateLimitKeys?: number;
  /** Server version reported by GET /healthz. */
  version: string;
  /** Factory creating an isolated MCP Server instance per session or stateless request. */
  createServer: (
    overrides: HttpServerFactoryOverrides,
  ) => HttpServerFactoryResult | Promise<HttpServerFactoryResult>;
  /** Optional Azure DevOps Service Hook handler for POST /webhooks/ado. */
  onWebhookRequest?: (
    req: IncomingMessage,
    rawBody: Buffer,
  ) => Promise<WebhookHandlerResult>;
}

export interface StartedHttpTransport {
  server: HttpServer;
  port: number;
  url: string;
  close: () => Promise<void>;
}

interface StatefulSessionEntry {
  readonly sessionId: string;
  readonly server: Server;
  readonly transport: StreamableHTTPServerTransport;
  readonly eventStore: BoundedEventStore;
  readonly cleanup?: () => void | Promise<void>;
  readonly patDigest?: Buffer;
  openResponses: number;
  lastActive: number;
  cleanedUp: boolean;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3000;
const DEFAULT_PATH = '/mcp';
const DEFAULT_MAX_SESSIONS = 100;
const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_SHUTDOWN_DRAIN_MS = 10_000;
const DEFAULT_WEBHOOK_RATE_LIMIT_PER_MINUTE = 120;
const DEFAULT_WEBHOOK_AUTH_FAIL_LIMIT_PER_MINUTE = 20;
const DEFAULT_WEBHOOK_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_MCP_RATE_LIMIT_PER_MINUTE = 600;
const DEFAULT_MCP_AUTH_FAIL_LIMIT_PER_MINUTE = 20;
const DEFAULT_MCP_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_HEALTH_RATE_LIMIT_PER_MINUTE = 600;
const DEFAULT_MAX_TRACKED_RATE_LIMIT_KEYS = 1_024;
const WEBHOOK_PATH = '/webhooks/ado';
const HEALTHZ_PATH = '/healthz';
const READYZ_PATH = '/readyz';

function normalizeHttpPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return DEFAULT_PATH;
  }
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith('/')) {
    return withLeadingSlash.slice(0, -1);
  }
  return withLeadingSlash;
}

function formatHostForUrl(host: string): string {
  const trimmed = host.trim();
  if (trimmed.includes(':') && !trimmed.startsWith('[')) {
    return `[${trimmed}]`;
  }
  return trimmed;
}

function isJsonContentType(
  contentType: string | string[] | undefined,
): boolean {
  if (typeof contentType !== 'string') {
    return false;
  }
  const essence = contentType.split(';', 1)[0].trim().toLowerCase();
  return essence === 'application/json';
}

function getRequestPathname(req: IncomingMessage): string {
  try {
    return new URL(req.url ?? '/', 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

type ExtractedPatResult =
  | { readonly ok: true; readonly pat: string | undefined }
  | { readonly ok: false; readonly reason: string };

function extractPerRequestPat(
  req: IncomingMessage,
  allowPerRequestPat: boolean,
): ExtractedPatResult {
  if (!allowPerRequestPat) {
    return { ok: true, pat: undefined };
  }
  const header = req.headers['x-azure-devops-pat'];
  if (Array.isArray(header)) {
    return {
      ok: false,
      reason:
        'Unauthorized: Duplicate X-Azure-DevOps-PAT headers are not allowed',
    };
  }
  if (typeof header !== 'string') {
    return { ok: true, pat: undefined };
  }
  const trimmed = header.trim();
  return { ok: true, pat: trimmed.length > 0 ? trimmed : undefined };
}

function hashPat(pat: string): Buffer {
  return createHash('sha256').update(pat, 'utf8').digest();
}

function isMatchingSessionPat(
  boundDigest: Buffer | undefined,
  incomingPat: string | undefined,
): boolean {
  if (boundDigest === undefined) {
    return incomingPat === undefined;
  }
  if (incomingPat === undefined) {
    return false;
  }
  return timingSafeEqual(hashPat(incomingPat), boundDigest);
}

function isInitializePayload(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return false;
  }
  return 'method' in body && body.method === 'initialize';
}

function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
  extraHeaders?: Record<string, string>,
): void {
  if (res.headersSent || res.writableEnded) {
    return;
  }
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body, 'utf8'),
    ...extraHeaders,
  });
  res.end(body);
}

function sendJsonRpcError(
  res: ServerResponse,
  status: number,
  code: number,
  message: string,
  extraHeaders?: Record<string, string>,
): void {
  sendJson(
    res,
    status,
    {
      jsonrpc: '2.0',
      error: { code, message },
      id: null,
    },
    extraHeaders,
  );
}

interface NumericTransportOptions {
  port: number;
  maxSessions: number;
  maxConcurrentStatelessRequests: number;
  sessionIdleTimeoutMs: number;
  shutdownDrainMs: number;
  webhookRateLimitPerMinute: number;
  webhookAuthFailLimitPerMinute: number;
  webhookRateLimitWindowMs: number;
  mcpRateLimitPerMinute: number;
  mcpAuthFailLimitPerMinute: number;
  mcpRateLimitWindowMs: number;
  healthRateLimitPerMinute: number;
  maxTrackedRateLimitKeys: number;
}

function validateNumericOptions(opts: NumericTransportOptions): void {
  if (!Number.isInteger(opts.port) || opts.port < 0 || opts.port > 65535) {
    throw new AzureDevOpsValidationError(
      `Invalid HTTP port "${opts.port}". Port must be an integer between 0 and 65535.`,
    );
  }
  if (!Number.isInteger(opts.maxSessions) || opts.maxSessions < 1) {
    throw new AzureDevOpsValidationError(
      `Invalid maxSessions "${opts.maxSessions}". Must be an integer >= 1.`,
    );
  }
  if (
    !Number.isInteger(opts.maxConcurrentStatelessRequests) ||
    opts.maxConcurrentStatelessRequests < 1
  ) {
    throw new AzureDevOpsValidationError(
      `Invalid maxConcurrentStatelessRequests "${opts.maxConcurrentStatelessRequests}". Must be an integer >= 1.`,
    );
  }
  if (
    !Number.isFinite(opts.sessionIdleTimeoutMs) ||
    opts.sessionIdleTimeoutMs < 1
  ) {
    throw new AzureDevOpsValidationError(
      `Invalid sessionIdleTimeoutMs "${opts.sessionIdleTimeoutMs}". Must be > 0.`,
    );
  }
  if (!Number.isFinite(opts.shutdownDrainMs) || opts.shutdownDrainMs < 0) {
    throw new AzureDevOpsValidationError(
      `Invalid shutdownDrainMs "${opts.shutdownDrainMs}". Must be >= 0.`,
    );
  }
  if (
    !Number.isInteger(opts.webhookRateLimitPerMinute) ||
    opts.webhookRateLimitPerMinute < 1
  ) {
    throw new AzureDevOpsValidationError(
      `Invalid webhookRateLimitPerMinute "${opts.webhookRateLimitPerMinute}". Must be an integer >= 1.`,
    );
  }
  if (
    !Number.isInteger(opts.webhookAuthFailLimitPerMinute) ||
    opts.webhookAuthFailLimitPerMinute < 1
  ) {
    throw new AzureDevOpsValidationError(
      `Invalid webhookAuthFailLimitPerMinute "${opts.webhookAuthFailLimitPerMinute}". Must be an integer >= 1.`,
    );
  }
  if (
    !Number.isFinite(opts.webhookRateLimitWindowMs) ||
    opts.webhookRateLimitWindowMs < 1
  ) {
    throw new AzureDevOpsValidationError(
      `Invalid webhookRateLimitWindowMs "${opts.webhookRateLimitWindowMs}". Must be > 0.`,
    );
  }
  if (
    !Number.isInteger(opts.mcpRateLimitPerMinute) ||
    opts.mcpRateLimitPerMinute < 1
  ) {
    throw new AzureDevOpsValidationError(
      `Invalid mcpRateLimitPerMinute "${opts.mcpRateLimitPerMinute}". Must be an integer >= 1.`,
    );
  }
  if (
    !Number.isInteger(opts.mcpAuthFailLimitPerMinute) ||
    opts.mcpAuthFailLimitPerMinute < 1
  ) {
    throw new AzureDevOpsValidationError(
      `Invalid mcpAuthFailLimitPerMinute "${opts.mcpAuthFailLimitPerMinute}". Must be an integer >= 1.`,
    );
  }
  if (
    !Number.isFinite(opts.mcpRateLimitWindowMs) ||
    opts.mcpRateLimitWindowMs < 1
  ) {
    throw new AzureDevOpsValidationError(
      `Invalid mcpRateLimitWindowMs "${opts.mcpRateLimitWindowMs}". Must be > 0.`,
    );
  }
  if (
    !Number.isInteger(opts.healthRateLimitPerMinute) ||
    opts.healthRateLimitPerMinute < 1
  ) {
    throw new AzureDevOpsValidationError(
      `Invalid healthRateLimitPerMinute "${opts.healthRateLimitPerMinute}". Must be an integer >= 1.`,
    );
  }
  if (
    !Number.isInteger(opts.maxTrackedRateLimitKeys) ||
    opts.maxTrackedRateLimitKeys < 1
  ) {
    throw new AzureDevOpsValidationError(
      `Invalid maxTrackedRateLimitKeys "${opts.maxTrackedRateLimitKeys}". Must be an integer >= 1.`,
    );
  }
}

/**
 * Starts the zero-Express Streamable HTTP MCP transport over Node's built-in
 * `node:http` server + `@modelcontextprotocol/sdk`'s `StreamableHTTPServerTransport`.
 */
export async function startStreamableHttpServer(
  options: StreamableHttpTransportOptions,
): Promise<StartedHttpTransport> {
  const host = options.host?.trim() || DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const httpPath = normalizeHttpPath(options.path ?? DEFAULT_PATH);
  const mode: StreamableHttpMode = options.mode ?? 'stateful';
  const enableJsonResponse = options.enableJsonResponse ?? false;
  const authToken = options.authToken?.trim() || undefined;
  const allowPerRequestPat = options.allowPerRequestPat ?? false;
  const requirePerRequestPat =
    allowPerRequestPat && (options.requirePerRequestPat ?? false);
  const allowUnauthenticated = options.allowUnauthenticated ?? false;
  const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
  const maxConcurrentStatelessRequests =
    options.maxConcurrentStatelessRequests ?? maxSessions;
  const sessionIdleTimeoutMs =
    options.sessionIdleTimeoutMs ?? DEFAULT_SESSION_IDLE_TIMEOUT_MS;
  const shutdownDrainMs = options.shutdownDrainMs ?? DEFAULT_SHUTDOWN_DRAIN_MS;
  const webhookSecret = options.webhookSecret?.trim() || undefined;
  const webhookRateLimitPerMinute =
    options.webhookRateLimitPerMinute ?? DEFAULT_WEBHOOK_RATE_LIMIT_PER_MINUTE;
  const webhookAuthFailLimitPerMinute =
    options.webhookAuthFailLimitPerMinute ??
    DEFAULT_WEBHOOK_AUTH_FAIL_LIMIT_PER_MINUTE;
  const webhookRateLimitWindowMs =
    options.webhookRateLimitWindowMs ?? DEFAULT_WEBHOOK_RATE_LIMIT_WINDOW_MS;
  const mcpRateLimitPerMinute =
    options.mcpRateLimitPerMinute ?? DEFAULT_MCP_RATE_LIMIT_PER_MINUTE;
  const mcpAuthFailLimitPerMinute =
    options.mcpAuthFailLimitPerMinute ?? DEFAULT_MCP_AUTH_FAIL_LIMIT_PER_MINUTE;
  const mcpRateLimitWindowMs =
    options.mcpRateLimitWindowMs ?? DEFAULT_MCP_RATE_LIMIT_WINDOW_MS;
  const healthRateLimitPerMinute =
    options.healthRateLimitPerMinute ?? DEFAULT_HEALTH_RATE_LIMIT_PER_MINUTE;
  const maxTrackedRateLimitKeys =
    options.maxTrackedRateLimitKeys ?? DEFAULT_MAX_TRACKED_RATE_LIMIT_KEYS;
  const version = options.version;

  validateNumericOptions({
    port,
    maxSessions,
    maxConcurrentStatelessRequests,
    sessionIdleTimeoutMs,
    shutdownDrainMs,
    webhookRateLimitPerMinute,
    webhookAuthFailLimitPerMinute,
    webhookRateLimitWindowMs,
    mcpRateLimitPerMinute,
    mcpAuthFailLimitPerMinute,
    mcpRateLimitWindowMs,
    healthRateLimitPerMinute,
    maxTrackedRateLimitKeys,
  });
  validateHttpServerSecurityConfig({
    host,
    authToken,
    allowUnauthenticated,
  });

  if (!isLoopbackHost(host)) {
    logWarn(
      `SECURITY WARNING: Streamable HTTP server is binding to non-loopback host "${host}" over plaintext HTTP without TLS. ` +
        'Authorization, X-API-Key, and X-Azure-DevOps-PAT credentials will travel unencrypted unless terminated behind a TLS-enforcing reverse proxy.',
    );
  }

  const sessions = new Map<string, StatefulSessionEntry>();
  const activeStatelessCleanups = new Set<() => Promise<void>>();
  const trustedProxySet = normalizeTrustedProxies(options.trustedProxies);
  const webhookRequestLimiter = new SlidingWindowRateLimiter({
    limit: webhookRateLimitPerMinute,
    windowMs: webhookRateLimitWindowMs,
    maxKeys: maxTrackedRateLimitKeys,
  });
  const webhookAuthFailLimiter = new SlidingWindowRateLimiter({
    limit: webhookAuthFailLimitPerMinute,
    windowMs: webhookRateLimitWindowMs,
    maxKeys: maxTrackedRateLimitKeys,
  });
  const mcpRequestLimiter = new SlidingWindowRateLimiter({
    limit: mcpRateLimitPerMinute,
    windowMs: mcpRateLimitWindowMs,
    maxKeys: maxTrackedRateLimitKeys,
  });
  const mcpAuthFailLimiter = new SlidingWindowRateLimiter({
    limit: mcpAuthFailLimitPerMinute,
    windowMs: mcpRateLimitWindowMs,
    maxKeys: maxTrackedRateLimitKeys,
  });
  const healthRequestLimiter = new SlidingWindowRateLimiter({
    limit: healthRateLimitPerMinute,
    windowMs: mcpRateLimitWindowMs,
    maxKeys: maxTrackedRateLimitKeys,
  });
  let pendingSessions = 0;
  let activeStatelessRequests = 0;
  let draining = false;
  let closePromise: Promise<void> | undefined;

  async function finalizeSession(
    entry: StatefulSessionEntry,
    opts: { skipTransportClose?: boolean } = {},
  ): Promise<void> {
    if (entry.cleanedUp) {
      return;
    }
    entry.cleanedUp = true;
    sessions.delete(entry.sessionId);

    if (!opts.skipTransportClose) {
      try {
        await entry.transport.close();
      } catch {
        // Ignore cleanup errors on already-closed transports.
      }
    }
    try {
      await entry.server.close();
    } catch {
      // Ignore cleanup errors on already-closed servers.
    }
    try {
      await entry.cleanup?.();
    } catch (error) {
      logError(
        `Session cleanup error (${entry.sessionId}): ${redactSecrets(error instanceof Error ? error.message : String(error))}`,
      );
    }
    entry.eventStore.clear();
  }

  function trackSessionResponse(
    entry: StatefulSessionEntry,
    res: ServerResponse,
  ): void {
    entry.openResponses += 1;
    entry.lastActive = Date.now();
    let released = false;
    const release = () => {
      if (released) {
        return;
      }
      released = true;
      entry.openResponses = Math.max(0, entry.openResponses - 1);
      entry.lastActive = Date.now();
    };
    res.once('close', release);
    res.once('finish', release);
  }

  async function reapIdleSessions(): Promise<void> {
    const cutoff = Date.now() - sessionIdleTimeoutMs;
    const stale: StatefulSessionEntry[] = [];
    for (const entry of sessions.values()) {
      if (entry.openResponses === 0 && entry.lastActive <= cutoff) {
        stale.push(entry);
      }
    }
    for (const entry of stale) {
      logDebug(`Reaping idle MCP session ${entry.sessionId}`);
      await finalizeSession(entry);
    }
  }

  const reaperIntervalMs = Math.min(
    Math.max(Math.floor(sessionIdleTimeoutMs / 4), 1000),
    60_000,
  );
  let reaperTimer: ReturnType<typeof setInterval> | undefined;

  async function handleWebhookRoute(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (!webhookSecret || !options.onWebhookRequest) {
      sendJson(res, 404, { error: 'Not Found' });
      return;
    }

    // 1. DNS rebinding / Host & Origin protection BEFORE reading body
    const securityResult = validateHostAndOrigin(req, {
      allowedHosts: options.allowedHosts,
      allowedOrigins: options.allowedOrigins,
    });
    if (!securityResult.ok) {
      sendJson(
        res,
        securityResult.status,
        { error: securityResult.reason },
        { Connection: 'close' },
      );
      return;
    }

    if (draining) {
      sendJson(res, 503, { error: 'Server is shutting down' });
      return;
    }
    const method = (req.method ?? 'GET').toUpperCase();
    if (method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed' }, { Allow: 'POST' });
      return;
    }

    // 2. Per-IP sliding-window rate limits BEFORE reading body or running HMAC
    // Uses socket remoteAddress by default; only consults X-Forwarded-For when
    // the immediate peer is an operator-declared trusted proxy.
    const clientKey = resolveClientRateLimitKey(req, trustedProxySet);
    const authLockout = webhookAuthFailLimiter.check(clientKey);
    if (!authLockout.allowed) {
      sendJson(
        res,
        429,
        {
          error:
            'Too Many Requests: webhook authentication failure limit reached',
        },
        { 'Retry-After': String(authLockout.retryAfterSeconds) },
      );
      return;
    }

    const rateLimit = webhookRequestLimiter.consume(clientKey);
    if (!rateLimit.allowed) {
      sendJson(
        res,
        429,
        { error: 'Too Many Requests: webhook rate limit exceeded' },
        { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      );
      return;
    }

    if (!isJsonContentType(req.headers['content-type'])) {
      sendJson(res, 415, {
        error: 'Unsupported Media Type: Content-Type must be application/json',
      });
      return;
    }

    const bodyResult = await readBoundedBody(req, MAX_WEBHOOK_BODY_BYTES);
    if (!bodyResult.ok) {
      sendJson(
        res,
        bodyResult.status,
        { error: bodyResult.reason },
        { Connection: 'close' },
      );
      return;
    }

    if (draining) {
      sendJson(res, 503, { error: 'Server is shutting down' });
      return;
    }

    const result = await options.onWebhookRequest(req, bodyResult.rawBody);
    if (result.status === 401) {
      webhookAuthFailLimiter.record(clientKey);
    }
    sendJson(res, result.status, result.body);
  }

  async function handleStatelessMcp(
    req: IncomingMessage,
    res: ServerResponse,
    personalAccessToken: string | undefined,
  ): Promise<void> {
    const method = (req.method ?? 'GET').toUpperCase();
    if (method !== 'POST') {
      sendJsonRpcError(
        res,
        405,
        -32000,
        'Method not allowed in stateless mode',
        { Allow: 'POST' },
      );
      return;
    }

    if (activeStatelessRequests >= maxConcurrentStatelessRequests) {
      sendJsonRpcError(
        res,
        503,
        -32000,
        'Service Unavailable: concurrent stateless request limit reached',
      );
      return;
    }
    activeStatelessRequests += 1;

    try {
      const bodyResult = await readBoundedBody(req, MAX_MCP_BODY_BYTES);
      if (!bodyResult.ok) {
        sendJsonRpcError(res, bodyResult.status, -32000, bodyResult.reason, {
          Connection: 'close',
        });
        return;
      }

      if (draining) {
        sendJsonRpcError(
          res,
          503,
          -32000,
          'Service Unavailable: server is shutting down',
        );
        return;
      }

      if (!isJsonContentType(req.headers['content-type'])) {
        sendJsonRpcError(
          res,
          415,
          -32000,
          'Unsupported Media Type: Content-Type must be application/json',
        );
        return;
      }

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(bodyResult.text);
      } catch {
        sendJsonRpcError(res, 400, -32700, 'Parse error: Invalid JSON');
        return;
      }

      const created = await options.createServer({
        personalAccessToken,
        disabledTools: [...HTTP_LOCKED_OUT_TOOLS],
      });

      if (draining) {
        await Promise.allSettled([
          Promise.resolve().then(() => created.server.close()),
          Promise.resolve().then(() => created.cleanup?.()),
        ]);
        sendJsonRpcError(
          res,
          503,
          -32000,
          'Service Unavailable: server is shutting down',
        );
        return;
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse,
      });

      let cleaned = false;
      const cleanupRequest = async (): Promise<void> => {
        if (cleaned) {
          return;
        }
        cleaned = true;
        activeStatelessCleanups.delete(cleanupRequest);
        try {
          await transport.close();
        } catch {
          // Ignore close errors.
        }
        try {
          await created.server.close();
        } catch {
          // Ignore close errors.
        }
        try {
          await created.cleanup?.();
        } catch (error) {
          logError(
            `Stateless request cleanup error: ${redactSecrets(error instanceof Error ? error.message : String(error))}`,
          );
        }
      };

      activeStatelessCleanups.add(cleanupRequest);
      res.once('close', () => {
        void cleanupRequest();
      });

      try {
        await created.server.connect(transport);
        if (draining) {
          await cleanupRequest();
          sendJsonRpcError(
            res,
            503,
            -32000,
            'Service Unavailable: server is shutting down',
          );
          return;
        }
        await transport.handleRequest(req, res, parsedBody);
      } catch (error) {
        await cleanupRequest();
        throw error;
      }
    } finally {
      activeStatelessRequests = Math.max(0, activeStatelessRequests - 1);
    }
  }

  async function handleStatefulMcp(
    req: IncomingMessage,
    res: ServerResponse,
    incomingPat: string | undefined,
  ): Promise<void> {
    const method = (req.method ?? 'GET').toUpperCase();
    if (method !== 'POST' && method !== 'GET' && method !== 'DELETE') {
      sendJsonRpcError(res, 405, -32000, 'Method not allowed.', {
        Allow: 'GET, POST, DELETE',
      });
      return;
    }

    const rawSessionHeader = req.headers['mcp-session-id'];
    if (Array.isArray(rawSessionHeader)) {
      sendJsonRpcError(
        res,
        400,
        -32000,
        'Bad Request: Duplicate Mcp-Session-Id headers are not allowed',
      );
      return;
    }
    const incomingSessionId =
      typeof rawSessionHeader === 'string' && rawSessionHeader.trim().length > 0
        ? rawSessionHeader.trim()
        : undefined;

    if (!incomingSessionId) {
      if (method !== 'POST') {
        sendJsonRpcError(
          res,
          400,
          -32000,
          'Bad Request: Mcp-Session-Id header is required',
        );
        return;
      }

      const bodyResult = await readBoundedBody(req, MAX_MCP_BODY_BYTES);
      if (!bodyResult.ok) {
        sendJsonRpcError(res, bodyResult.status, -32000, bodyResult.reason, {
          Connection: 'close',
        });
        return;
      }

      if (draining) {
        sendJsonRpcError(
          res,
          503,
          -32000,
          'Service Unavailable: server is shutting down',
        );
        return;
      }

      if (!isJsonContentType(req.headers['content-type'])) {
        sendJsonRpcError(
          res,
          415,
          -32000,
          'Unsupported Media Type: Content-Type must be application/json',
        );
        return;
      }

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(bodyResult.text);
      } catch {
        sendJsonRpcError(res, 400, -32700, 'Parse error: Invalid JSON');
        return;
      }

      if (!isInitializePayload(parsedBody)) {
        sendJsonRpcError(
          res,
          400,
          -32000,
          'Bad Request: Mcp-Session-Id header is required',
        );
        return;
      }

      if (sessions.size + pendingSessions >= maxSessions) {
        await reapIdleSessions();
      }
      if (draining) {
        sendJsonRpcError(
          res,
          503,
          -32000,
          'Service Unavailable: server is shutting down',
        );
        return;
      }
      if (sessions.size + pendingSessions >= maxSessions) {
        sendJsonRpcError(
          res,
          503,
          -32000,
          'Service Unavailable: Maximum active MCP sessions reached',
        );
        return;
      }

      pendingSessions += 1;
      const sessionId = randomUUID();
      const eventStore = new BoundedEventStore();
      let entry: StatefulSessionEntry | undefined;

      try {
        const created = await options.createServer({
          personalAccessToken: incomingPat,
          disabledTools: [...HTTP_LOCKED_OUT_TOOLS],
          sessionId,
        });

        if (draining) {
          await Promise.allSettled([
            Promise.resolve().then(() => created.server.close()),
            Promise.resolve().then(() => created.cleanup?.()),
          ]);
          eventStore.clear();
          sendJsonRpcError(
            res,
            503,
            -32000,
            'Service Unavailable: server is shutting down',
          );
          return;
        }

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => sessionId,
          eventStore,
          enableJsonResponse,
          onsessioninitialized: (initializedId) => {
            if (entry && !draining) {
              sessions.set(initializedId, entry);
            }
          },
          onsessionclosed: (closedId) => {
            sessions.delete(closedId);
          },
        });

        entry = {
          sessionId,
          server: created.server,
          transport,
          eventStore,
          cleanup: created.cleanup,
          patDigest: incomingPat ? hashPat(incomingPat) : undefined,
          openResponses: 0,
          lastActive: Date.now(),
          cleanedUp: false,
        };

        await created.server.connect(transport);
        if (draining) {
          await finalizeSession(entry);
          sendJsonRpcError(
            res,
            503,
            -32000,
            'Service Unavailable: server is shutting down',
          );
          return;
        }
        trackSessionResponse(entry, res);
        await transport.handleRequest(req, res, parsedBody);

        if (!transport.sessionId || draining) {
          await finalizeSession(entry);
        }
      } catch (error) {
        if (entry) {
          await finalizeSession(entry);
        } else {
          eventStore.clear();
        }
        throw error;
      } finally {
        pendingSessions = Math.max(0, pendingSessions - 1);
      }
      return;
    }

    const entry = sessions.get(incomingSessionId);
    if (!entry) {
      sendJsonRpcError(res, 404, -32001, 'Session not found');
      return;
    }

    if (
      allowPerRequestPat &&
      !isMatchingSessionPat(entry.patDigest, incomingPat)
    ) {
      sendJsonRpcError(
        res,
        401,
        -32000,
        'Unauthorized: X-Azure-DevOps-PAT does not match session credential',
      );
      return;
    }

    if (method === 'DELETE') {
      try {
        await entry.transport.handleRequest(req, res);
      } finally {
        if (!sessions.has(incomingSessionId)) {
          await finalizeSession(entry, { skipTransportClose: true });
        }
      }
      return;
    }

    if (method === 'GET') {
      trackSessionResponse(entry, res);
      await entry.transport.handleRequest(req, res);
      return;
    }

    // Stateful POST with existing Mcp-Session-Id:
    // Mark the session active BEFORE awaiting body upload so the idle reaper
    // cannot reap this session mid-upload.
    trackSessionResponse(entry, res);

    const bodyResult = await readBoundedBody(req, MAX_MCP_BODY_BYTES);
    if (!bodyResult.ok) {
      sendJsonRpcError(res, bodyResult.status, -32000, bodyResult.reason, {
        Connection: 'close',
      });
      return;
    }

    if (entry.cleanedUp || draining) {
      sendJsonRpcError(res, 503, -32000, 'Server is shutting down');
      return;
    }

    if (!isJsonContentType(req.headers['content-type'])) {
      sendJsonRpcError(
        res,
        415,
        -32000,
        'Unsupported Media Type: Content-Type must be application/json',
      );
      return;
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(bodyResult.text);
    } catch {
      sendJsonRpcError(res, 400, -32700, 'Parse error: Invalid JSON');
      return;
    }

    await entry.transport.handleRequest(req, res, parsedBody);
  }

  async function handleMcpRoute(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    // 1. DNS rebinding / Host & Origin protection BEFORE reading body
    const securityResult = validateHostAndOrigin(req, {
      allowedHosts: options.allowedHosts,
      allowedOrigins: options.allowedOrigins,
    });
    if (!securityResult.ok) {
      sendJsonRpcError(
        res,
        securityResult.status,
        -32000,
        securityResult.reason,
        { Connection: 'close' },
      );
      return;
    }

    // 2. Per-IP sliding-window rate limits & auth-failure lockout BEFORE auth/body read
    // Uses socket remoteAddress by default; only consults X-Forwarded-For when
    // the immediate peer is an operator-declared trusted proxy.
    const clientKey = resolveClientRateLimitKey(req, trustedProxySet);
    const authLockout = mcpAuthFailLimiter.check(clientKey);
    if (!authLockout.allowed) {
      sendJsonRpcError(
        res,
        429,
        -32000,
        'Too Many Requests: authentication failure limit reached',
        { 'Retry-After': String(authLockout.retryAfterSeconds) },
      );
      return;
    }

    const rateLimit = mcpRequestLimiter.consume(clientKey);
    if (!rateLimit.allowed) {
      sendJsonRpcError(
        res,
        429,
        -32000,
        'Too Many Requests: MCP request rate limit exceeded',
        { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      );
      return;
    }

    // 3. Bearer / X-API-Key authentication BEFORE reading body
    if (authToken && !verifyHttpBearerAuth(req, authToken)) {
      mcpAuthFailLimiter.record(clientKey);
      sendJsonRpcError(res, 401, -32000, 'Unauthorized', {
        'WWW-Authenticate': 'Bearer',
      });
      return;
    }

    // 4. Per-request PAT extraction & fail-closed requirement BEFORE reading body
    const patResult = extractPerRequestPat(req, allowPerRequestPat);
    if (!patResult.ok) {
      sendJsonRpcError(res, 401, -32000, patResult.reason);
      return;
    }
    if (requirePerRequestPat && !patResult.pat) {
      sendJsonRpcError(
        res,
        401,
        -32000,
        'Unauthorized: X-Azure-DevOps-PAT header is required',
      );
      return;
    }

    // 5. Reject new work while draining
    if (draining) {
      sendJsonRpcError(res, 503, -32000, 'Server is shutting down');
      return;
    }

    if (mode === 'stateless') {
      await handleStatelessMcp(req, res, patResult.pat);
    } else {
      await handleStatefulMcp(req, res, patResult.pat);
    }
  }

  function guardHealthEndpoint(
    req: IncomingMessage,
    res: ServerResponse,
  ): boolean {
    const securityResult = validateHostAndOrigin(req, {
      allowedHosts: options.allowedHosts,
      allowedOrigins: options.allowedOrigins,
    });
    if (!securityResult.ok) {
      sendJson(
        res,
        securityResult.status,
        { error: securityResult.reason },
        { Connection: 'close' },
      );
      return false;
    }

    const clientKey = resolveClientRateLimitKey(req, trustedProxySet);
    const rateLimit = healthRequestLimiter.consume(clientKey);
    if (!rateLimit.allowed) {
      sendJson(
        res,
        429,
        { error: 'Too Many Requests: health endpoint rate limit exceeded' },
        { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      );
      return false;
    }

    return true;
  }

  async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const pathname = getRequestPathname(req);
    const method = (req.method ?? 'GET').toUpperCase();

    if (pathname === HEALTHZ_PATH) {
      if (!guardHealthEndpoint(req, res)) {
        return;
      }
      if (method !== 'GET') {
        sendJson(res, 405, { error: 'Method Not Allowed' }, { Allow: 'GET' });
        return;
      }
      sendJson(res, 200, { status: 'ok', version });
      return;
    }

    if (pathname === READYZ_PATH) {
      if (!guardHealthEndpoint(req, res)) {
        return;
      }
      if (method !== 'GET') {
        sendJson(res, 405, { error: 'Method Not Allowed' }, { Allow: 'GET' });
        return;
      }
      if (draining) {
        sendJson(res, 503, {
          status: 'draining',
          mode,
          activeSessions: sessions.size,
        });
        return;
      }
      sendJson(res, 200, {
        status: 'ready',
        mode,
        activeSessions: sessions.size,
      });
      return;
    }

    if (pathname === WEBHOOK_PATH) {
      await handleWebhookRoute(req, res);
      return;
    }

    if (pathname === httpPath) {
      await handleMcpRoute(req, res);
      return;
    }

    sendJson(res, 404, { error: 'Not Found' });
  }

  const httpServer = createHttpServer((req, res) => {
    void handleRequest(req, res).catch((error: unknown) => {
      const safeMessage = redactSecrets(
        error instanceof Error ? error.message : String(error),
      );
      logError(`HTTP request error: ${safeMessage}`);
      if (!res.headersSent && !res.writableEnded) {
        sendJsonRpcError(res, 500, -32603, 'Internal server error');
      } else if (!res.writableEnded) {
        res.end();
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      httpServer.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      httpServer.off('error', onError);
      resolve();
    };
    httpServer.once('error', onError);
    httpServer.once('listening', onListening);
    httpServer.listen(port, host);
  });

  const address = httpServer.address();
  const boundPort =
    address && typeof address === 'object' ? address.port : port;
  const url = `http://${formatHostForUrl(host)}:${boundPort}${httpPath}`;

  if (mode === 'stateful') {
    reaperTimer = setInterval(() => {
      void reapIdleSessions();
    }, reaperIntervalMs);
    reaperTimer.unref();
  }

  logInfo(
    `Azure DevOps MCP Server listening on ${url} (mode=${mode}, jsonResponse=${enableJsonResponse})`,
  );

  const close = (): Promise<void> => {
    if (closePromise) {
      return closePromise;
    }

    closePromise = (async () => {
      draining = true;
      if (reaperTimer) {
        clearInterval(reaperTimer);
      }

      const sessionEntries = Array.from(sessions.values());
      const statelessCleanups = Array.from(activeStatelessCleanups);
      await Promise.allSettled([
        ...sessionEntries.map((entry) => finalizeSession(entry)),
        ...statelessCleanups.map((cleanupFn) => cleanupFn()),
      ]);

      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(drainTimer);
          resolve();
        };

        const drainTimer = setTimeout(() => {
          httpServer.closeAllConnections();
          finish();
        }, shutdownDrainMs);
        drainTimer.unref();

        httpServer.close(() => {
          finish();
        });
        httpServer.closeIdleConnections();
      });

      webhookRequestLimiter.clear();
      webhookAuthFailLimiter.clear();
      mcpRequestLimiter.clear();
      mcpAuthFailLimiter.clear();
      healthRequestLimiter.clear();
    })();

    return closePromise;
  };

  return {
    server: httpServer,
    port: boundPort,
    url,
    close,
  };
}
