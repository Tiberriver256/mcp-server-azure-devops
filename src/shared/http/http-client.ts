import type { ApiErrorResponse } from '../errors';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsRateLimitError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../errors';

export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_HTTP_RESPONSE_BYTES = 25 * 1024 * 1024; // 25 MiB

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type HttpResponseType = 'json' | 'text' | 'arraybuffer';

export interface HttpRequestOptions {
  method?: HttpMethod;
  url: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
  responseType?: HttpResponseType;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  data: T;
}

/**
 * Sanitize a URL for safe inclusion in error messages (strips credentials and query strings).
 */
export function sanitizeUrlForError(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '(invalid url)';
  }
}

/**
 * Typed HTTP error produced by HttpClient.
 * Intentionally omits request headers and authorization credentials so
 * secrets can never leak into logs or serialized Error.cause chains.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly responseData: unknown;
  readonly headers: Record<string, string>;

  constructor(params: {
    message: string;
    status: number;
    statusText: string;
    url: string;
    responseData?: unknown;
    headers?: Record<string, string>;
  }) {
    super(params.message);
    this.name = 'HttpError';
    this.status = params.status;
    this.statusText = params.statusText;
    this.url = sanitizeUrlForError(params.url);
    this.responseData = params.responseData;
    this.headers = params.headers ?? {};
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

function isHeadersLike(
  value: unknown,
): value is { get: (name: string) => string | null } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'get' in value &&
    typeof value.get === 'function'
  );
}

/**
 * Case-insensitive header lookup over plain records or Fetch Headers.
 */
export function extractHeader(
  headers: unknown,
  name: string,
): string | undefined {
  if (typeof headers !== 'object' || headers === null) {
    return undefined;
  }

  if (isHeadersLike(headers)) {
    const val = headers.get(name);
    return val ?? undefined;
  }

  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      if (typeof value === 'string') {
        return value;
      }
      if (Array.isArray(value) && typeof value[0] === 'string') {
        return value[0];
      }
    }
  }
  return undefined;
}

/**
 * Case-insensitive extraction of Azure DevOps `x-ms-continuationtoken` response header.
 */
export function extractContinuationToken(
  headers?: unknown,
): string | undefined {
  const token = extractHeader(headers, 'x-ms-continuationtoken')?.trim();
  return token && token.length > 0 ? token : undefined;
}

/**
 * Case-insensitive extraction of HTTP ETag header with surrounding quotes stripped.
 */
export function extractETag(headers?: unknown): string | undefined {
  const raw = extractHeader(headers, 'etag');
  if (!raw) {
    return undefined;
  }
  const stripped = raw.replace(/^W\//, '').replace(/"/g, '').trim();
  return stripped.length > 0 ? stripped : undefined;
}

/**
 * Append query parameters to a URL while preserving existing path encoding
 * and existing query parameters.
 */
export function buildRequestUrl(
  baseUrl: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  if (!query) {
    return baseUrl;
  }

  const pairs: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      pairs.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
      );
    }
  }

  if (pairs.length === 0) {
    return baseUrl;
  }

  const hashIndex = baseUrl.indexOf('#');
  const withoutHash = hashIndex === -1 ? baseUrl : baseUrl.slice(0, hashIndex);
  const hashSuffix = hashIndex === -1 ? '' : baseUrl.slice(hashIndex);
  const separator = withoutHash.includes('?') ? '&' : '?';
  return `${withoutHash}${separator}${pairs.join('&')}${hashSuffix}`;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

async function readBoundedResponseBuffer(
  response: Response,
  maxBytes: number,
  safeUrl: string,
): Promise<Buffer> {
  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader) {
    const declared = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declared) && declared > maxBytes) {
      if (response.body) {
        await response.body.cancel().catch(() => undefined);
      }
      throw new AzureDevOpsError(
        `Response from ${safeUrl} (${declared} bytes) exceeds maximum allowed size of ${maxBytes} bytes`,
      );
    }
  }

  if (!response.body) {
    const ab = await response.arrayBuffer();
    if (ab.byteLength > maxBytes) {
      throw new AzureDevOpsError(
        `Response from ${safeUrl} (${ab.byteLength} bytes) exceeds maximum allowed size of ${maxBytes} bytes`,
      );
    }
    return Buffer.from(ab);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new AzureDevOpsError(
            `Response from ${safeUrl} exceeded maximum allowed size of ${maxBytes} bytes`,
          );
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

function tryParseJson(text: string): unknown {
  if (text.trim().length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'message' in data &&
    typeof data.message === 'string' &&
    data.message.trim().length > 0
  ) {
    return data.message;
  }
  return fallback;
}

function parseRetryAfterDate(headers: Record<string, string>): Date {
  const raw = extractHeader(headers, 'retry-after')?.trim();
  if (raw && raw.length > 0) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return new Date(Date.now() + seconds * 1000);
    }
    const parsedDate = Date.parse(raw);
    if (!Number.isNaN(parsedDate)) {
      return new Date(parsedDate);
    }
  }
  return new Date(Date.now() + 60_000);
}

function toApiErrorResponse(data: unknown): ApiErrorResponse | undefined {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return undefined;
  }
  const record: ApiErrorResponse = {};
  for (const [key, value] of Object.entries(data)) {
    record[key] = value;
  }
  return record;
}

/**
 * Convert an HttpError (or unknown HTTP/network failure) into the canonical
 * AzureDevOpsError subtype without leaking credentials.
 */
export function mapHttpErrorToAzureDevOpsError(
  error: unknown,
  context: string,
): AzureDevOpsError {
  if (error instanceof AzureDevOpsError) {
    return error;
  }

  if (isHttpError(error)) {
    const message = extractErrorMessage(error.responseData, error.message);
    const apiData = toApiErrorResponse(error.responseData);

    switch (error.status) {
      case 400:
      case 412:
        return new AzureDevOpsValidationError(
          `Invalid request while ${context}: ${message}`,
          apiData,
        );
      case 203:
      case 401:
        return new AzureDevOpsAuthenticationError(
          `Authentication failed while ${context}: ${message}`,
        );
      case 403:
        return new AzureDevOpsPermissionError(
          `Permission denied while ${context}: ${message}`,
        );
      case 404:
        return new AzureDevOpsResourceNotFoundError(
          `Resource not found while ${context}: ${message}`,
        );
      case 429:
        return new AzureDevOpsRateLimitError(
          `Rate limit exceeded while ${context}: ${message}`,
          parseRetryAfterDate(error.headers),
        );
      default:
        return new AzureDevOpsError(`Failed while ${context}: ${message}`);
    }
  }

  return new AzureDevOpsError(
    `Unexpected error while ${context}: ${error instanceof Error ? error.message : String(error)}`,
  );
}

export interface HttpClient {
  request<T = unknown>(options: HttpRequestOptions): Promise<HttpResponse<T>>;
  get<T = unknown>(
    url: string,
    options?: Omit<HttpRequestOptions, 'method' | 'url' | 'body'>,
  ): Promise<HttpResponse<T>>;
  post<T = unknown>(
    url: string,
    body?: unknown,
    options?: Omit<HttpRequestOptions, 'method' | 'url' | 'body'>,
  ): Promise<HttpResponse<T>>;
  put<T = unknown>(
    url: string,
    body?: unknown,
    options?: Omit<HttpRequestOptions, 'method' | 'url' | 'body'>,
  ): Promise<HttpResponse<T>>;
}

export interface HttpClientConfig {
  fetchFn?: typeof fetch;
  defaultTimeoutMs?: number;
  maxResponseBytes?: number;
}

function decodeResponsePayload<T>(
  buffer: Buffer,
  responseType: HttpResponseType,
): T {
  let payload: unknown;
  if (responseType === 'arraybuffer') {
    payload = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
  } else {
    const text = buffer.toString('utf8');
    payload = responseType === 'text' ? text : tryParseJson(text);
  }
  // Single HTTP deserialization boundary for generic HttpClient.request<T> callers.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return payload as T;
}

/**
 * Create a zero-dependency HTTP client backed by Node.js 22 native fetch.
 */
export function createHttpClient(config: HttpClientConfig = {}): HttpClient {
  const fetchFn = config.fetchFn ?? globalThis.fetch;
  const defaultTimeoutMs = config.defaultTimeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
  const defaultMaxBytes =
    config.maxResponseBytes ?? DEFAULT_MAX_HTTP_RESPONSE_BYTES;

  const request = async <T = unknown>(
    options: HttpRequestOptions,
  ): Promise<HttpResponse<T>> => {
    const method = options.method ?? 'GET';
    const fullUrl = buildRequestUrl(options.url, options.query);
    const safeUrl = sanitizeUrlForError(fullUrl);
    const responseType = options.responseType ?? 'json';
    const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
    const maxBytes = options.maxResponseBytes ?? defaultMaxBytes;

    const headers: Record<string, string> = { ...options.headers };
    let serializedBody: string | undefined;

    if (options.body !== undefined) {
      if (typeof options.body === 'string') {
        serializedBody = options.body;
      } else {
        serializedBody = JSON.stringify(options.body);
        if (!extractHeader(headers, 'content-type')) {
          headers['Content-Type'] = 'application/json';
        }
      }
    }

    const signal =
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? AbortSignal.timeout(timeoutMs)
        : undefined;

    const response = await fetchFn(fullUrl, {
      method,
      headers,
      body: serializedBody,
      signal,
    });

    const responseHeaders = headersToRecord(response.headers);
    const contentType = (responseHeaders['content-type'] ?? '').toLowerCase();

    // Azure DevOps REST APIs return HTTP 203 Non-Authoritative Information with an
    // HTML sign-in page when a PAT is invalid or expired. Treat this as auth failure
    // rather than silently returning HTML cast as JSON/text.
    const isAuthRedirect203 =
      response.status === 203 &&
      (contentType.includes('text/html') || responseType === 'json');

    if (!response.ok || isAuthRedirect203) {
      const errorBuf = await readBoundedResponseBuffer(
        response,
        Math.min(maxBytes, 1024 * 1024),
        safeUrl,
      ).catch(() => Buffer.alloc(0));
      const errorText = errorBuf.toString('utf8');
      const errorData = tryParseJson(errorText);
      const fallbackMessage = isAuthRedirect203
        ? 'HTTP 203 Non-Authoritative Information (sign-in required; check PAT or credentials)'
        : `HTTP ${response.status} ${response.statusText || 'Error'}`.trim();
      const message = extractErrorMessage(errorData, fallbackMessage);

      throw new HttpError({
        message,
        status: response.status,
        statusText: response.statusText,
        url: fullUrl,
        responseData: errorData,
        headers: responseHeaders,
      });
    }

    if (response.status === 204) {
      if (response.body) {
        await response.body.cancel().catch(() => undefined);
      }
      return {
        status: response.status,
        headers: responseHeaders,
        data: decodeResponsePayload<T>(Buffer.alloc(0), responseType),
      };
    }

    const buffer = await readBoundedResponseBuffer(response, maxBytes, safeUrl);
    return {
      status: response.status,
      headers: responseHeaders,
      data: decodeResponsePayload<T>(buffer, responseType),
    };
  };

  return {
    request,
    get: <T = unknown>(
      url: string,
      options?: Omit<HttpRequestOptions, 'method' | 'url' | 'body'>,
    ) => request<T>({ ...options, method: 'GET', url }),
    post: <T = unknown>(
      url: string,
      body?: unknown,
      options?: Omit<HttpRequestOptions, 'method' | 'url' | 'body'>,
    ) => request<T>({ ...options, method: 'POST', url, body }),
    put: <T = unknown>(
      url: string,
      body?: unknown,
      options?: Omit<HttpRequestOptions, 'method' | 'url' | 'body'>,
    ) => request<T>({ ...options, method: 'PUT', url, body }),
  };
}
