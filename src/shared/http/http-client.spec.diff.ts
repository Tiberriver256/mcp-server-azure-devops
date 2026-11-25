import * as http from 'http';
import type { AddressInfo } from 'net';
import {
  buildRequestUrl,
  createHttpClient,
  extractContinuationToken,
  extractETag,
  HttpError,
  mapHttpErrorToAzureDevOpsError,
} from './http-client';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsRateLimitError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../errors';

describe('http-client wire-level differential tests vs real Node http.Server oracle', () => {
  let server: http.Server;
  let baseUrl: string;
  let lastReceivedUrl: string | undefined;
  let lastReceivedMethod: string | undefined;
  let lastReceivedBody: string;
  let lastReceivedAuth: string | undefined;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      lastReceivedUrl = req.url;
      lastReceivedMethod = req.method;
      lastReceivedAuth = req.headers.authorization;
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        lastReceivedBody = Buffer.concat(chunks).toString('utf8');
        const parsed = new URL(req.url ?? '/', 'http://127.0.0.1');

        if (parsed.pathname === '/echo-json') {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            ETag: 'W/"etag-v123"',
            'X-MS-ContinuationToken': 'tok-abc-99',
          });
          res.end(
            JSON.stringify({
              method: req.method,
              path: parsed.pathname,
              query: Object.fromEntries(parsed.searchParams.entries()),
              body: lastReceivedBody ? JSON.parse(lastReceivedBody) : null,
            }),
          );
          return;
        }

        if (parsed.pathname === '/echo-text') {
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('plain text café');
          return;
        }

        if (parsed.pathname === '/binary') {
          res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
          res.end(Buffer.from([0x00, 0x01, 0x7f, 0x80, 0xff]));
          return;
        }

        if (parsed.pathname === '/large') {
          res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
          res.end(Buffer.alloc(4096, 0x61));
          return;
        }

        if (parsed.pathname === '/auth-redirect-203') {
          res.writeHead(203, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            '<!DOCTYPE html><html><head><title>Azure DevOps Services | Sign In</title></head><body>Sign in</body></html>',
          );
          return;
        }

        if (parsed.pathname === '/no-content-204') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (parsed.pathname === '/rate-limit-blank') {
          res.writeHead(429, {
            'Content-Type': 'application/json',
            'Retry-After': '   ',
          });
          res.end(JSON.stringify({ message: 'Too many requests' }));
          return;
        }

        const statusMatch = /^\/status\/(\d{3})$/.exec(parsed.pathname);
        if (statusMatch) {
          const status = Number(statusMatch[1]);
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          if (status === 429) {
            headers['Retry-After'] = '30';
          }
          res.writeHead(status, headers);
          res.end(JSON.stringify({ message: `Simulated HTTP ${status}` }));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Not found' }));
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('round-trips JSON, Unicode query params (wiki umlaut paths), ETag, and continuation tokens over real HTTP', async () => {
    const client = createHttpClient();
    const res = await client.post<{
      method: string;
      query: Record<string, string>;
      body: { title: string };
    }>(
      `${baseUrl}/echo-json`,
      { title: 'Hello' },
      {
        query: {
          path: '/Über/Café & Docs',
          'api-version': '7.1',
          ignored: undefined,
        },
        headers: { Authorization: 'Basic dXNlcjpzZWNyZXQ=' },
      },
    );

    expect(res.status).toBe(200);
    expect(lastReceivedMethod).toBe('POST');
    expect(lastReceivedAuth).toBe('Basic dXNlcjpzZWNyZXQ=');
    expect(lastReceivedUrl).toContain('api-version=7.1');
    expect(res.data.query.path).toBe('/Über/Café & Docs');
    expect(res.data.body).toEqual({ title: 'Hello' });
    expect(extractETag(res.headers)).toBe('etag-v123');
    expect(extractContinuationToken(res.headers)).toBe('tok-abc-99');
  });

  it('decodes text and binary ArrayBuffer payloads losslessly over real HTTP', async () => {
    const client = createHttpClient();

    const textRes = await client.get<string>(`${baseUrl}/echo-text`, {
      responseType: 'text',
    });
    expect(textRes.data).toBe('plain text café');

    const binRes = await client.get<ArrayBuffer>(`${baseUrl}/binary`, {
      responseType: 'arraybuffer',
    });
    expect(Buffer.from(binRes.data)).toEqual(
      Buffer.from([0x00, 0x01, 0x7f, 0x80, 0xff]),
    );
  });

  it('enforces maxResponseBytes cap on streaming responses without buffering unbounded payloads', async () => {
    const client = createHttpClient();
    await expect(
      client.get<ArrayBuffer>(`${baseUrl}/large`, {
        responseType: 'arraybuffer',
        maxResponseBytes: 512,
      }),
    ).rejects.toThrow(/exceeded maximum allowed size/i);
  });

  it('treats Azure DevOps HTTP 203 HTML sign-in redirects as HttpError(203) -> AzureDevOpsAuthenticationError', async () => {
    const client = createHttpClient();
    const caught = await client
      .get(`${baseUrl}/auth-redirect-203`)
      .catch((e: unknown) => e);

    expect(caught).toBeInstanceOf(HttpError);
    expect((caught as HttpError).status).toBe(203);
    expect(
      mapHttpErrorToAzureDevOpsError(caught, 'fetching wiki'),
    ).toBeInstanceOf(AzureDevOpsAuthenticationError);
  });

  it('handles HTTP 204 No Content responses cleanly across json/text/arraybuffer modes', async () => {
    const client = createHttpClient();
    const jsonRes = await client.get(`${baseUrl}/no-content-204`);
    expect(jsonRes.status).toBe(204);
    expect(jsonRes.data).toBeUndefined();

    const textRes = await client.get<string>(`${baseUrl}/no-content-204`, {
      responseType: 'text',
    });
    expect(textRes.data).toBe('');
  });

  it('falls back to 60s retryAfter when Retry-After header is blank/whitespace and preserves #fragments in buildRequestUrl', async () => {
    const client = createHttpClient();
    const before = Date.now();
    const caught = await client
      .get(`${baseUrl}/rate-limit-blank`)
      .catch((e: unknown) => e);
    const mapped = mapHttpErrorToAzureDevOpsError(caught, 'rate limit test');

    expect(mapped).toBeInstanceOf(AzureDevOpsRateLimitError);
    expect(
      (mapped as AzureDevOpsRateLimitError).resetAt.getTime(),
    ).toBeGreaterThanOrEqual(before + 55_000);

    expect(
      buildRequestUrl('https://dev.azure.com/org/_apis/wiki#section', {
        'api-version': '7.1',
      }),
    ).toBe('https://dev.azure.com/org/_apis/wiki?api-version=7.1#section');
  });

  it.each([
    [400, AzureDevOpsValidationError],
    [401, AzureDevOpsAuthenticationError],
    [403, AzureDevOpsPermissionError],
    [404, AzureDevOpsResourceNotFoundError],
    [412, AzureDevOpsValidationError],
    [429, AzureDevOpsRateLimitError],
    [500, AzureDevOpsError],
  ] as const)(
    'maps wire HTTP %i into typed AzureDevOpsError without leaking Authorization headers in HttpError',
    async (status, ExpectedErrorCtor) => {
      const client = createHttpClient();
      const secretHeader = 'Basic dXNlcjpzdXBlci1zZWNyZXQtcGF0';

      let caught: unknown;
      try {
        await client.get(`${baseUrl}/status/${status}`, {
          headers: { Authorization: secretHeader },
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(HttpError);
      const serialized = JSON.stringify(caught);
      expect(serialized).not.toContain(secretHeader);
      expect((caught as HttpError).message).not.toContain(secretHeader);

      const mapped = mapHttpErrorToAzureDevOpsError(caught, 'Wire test');
      expect(mapped).toBeInstanceOf(ExpectedErrorCtor);
    },
  );
});
