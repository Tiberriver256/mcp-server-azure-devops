import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import { AzureDevOpsValidationError } from '../shared/errors/index.ts';
import {
  isLoopbackHost,
  readBoundedBody,
  validateHostAndOrigin,
  validateHttpServerSecurityConfig,
  verifyHttpBearerAuth,
} from './http-security.ts';

function makeMockRequest(
  headers: Record<string, string | string[] | undefined>,
  chunks: Array<string | Buffer> = [],
): IncomingMessage {
  const stream = Readable.from(chunks) as unknown as IncomingMessage;
  stream.headers = headers;
  return stream;
}

void describe('http-security', () => {
  void describe('isLoopbackHost', () => {
    void it('recognizes loopback IPv4, localhost, and IPv6 addresses with or without ports', () => {
      for (const host of [
        '127.0.0.1',
        '127.0.0.1:3000',
        'localhost',
        'LOCALHOST:8080',
        '::1',
        '[::1]',
        '[::1]:3000',
      ]) {
        assert.equal(isLoopbackHost(host), true, `Expected loopback: ${host}`);
      }
    });

    void it('rejects wildcard, external, and malformed hosts', () => {
      for (const host of [
        '0.0.0.0',
        '0.0.0.0:3000',
        '::',
        '[::]',
        'evil.example',
        '127.0.0.1.evil.example',
        'localhost.evil.example',
        '127.0.0.1@evil.example',
        '',
        '   ',
      ]) {
        assert.equal(
          isLoopbackHost(host),
          false,
          `Expected non-loopback: ${host}`,
        );
      }
    });
  });

  void describe('validateHttpServerSecurityConfig', () => {
    void it('allows loopback hosts without authToken', () => {
      assert.doesNotThrow(() =>
        validateHttpServerSecurityConfig({ host: '127.0.0.1' }),
      );
      assert.doesNotThrow(() =>
        validateHttpServerSecurityConfig({ host: 'localhost' }),
      );
      assert.doesNotThrow(() =>
        validateHttpServerSecurityConfig({ host: '::1' }),
      );
    });

    void it('fails closed when binding non-loopback without authToken or allowUnauthenticated', () => {
      assert.throws(
        () => validateHttpServerSecurityConfig({ host: '0.0.0.0' }),
        (error: unknown) => {
          assert.ok(error instanceof AzureDevOpsValidationError);
          assert.match(error.message, /auth|token|unauthenticated|loopback/i);
          return true;
        },
      );
      assert.throws(
        () => validateHttpServerSecurityConfig({ host: '::' }),
        AzureDevOpsValidationError,
      );
    });

    void it('allows non-loopback when authToken or allowUnauthenticated is configured', () => {
      assert.doesNotThrow(() =>
        validateHttpServerSecurityConfig({
          host: '0.0.0.0',
          authToken: 'secret-token',
        }),
      );
      assert.doesNotThrow(() =>
        validateHttpServerSecurityConfig({
          host: '0.0.0.0',
          allowUnauthenticated: true,
        }),
      );
    });
  });

  void describe('validateHostAndOrigin', () => {
    void it('accepts loopback hosts port-agnostically with absent or loopback Origin', () => {
      assert.deepEqual(
        validateHostAndOrigin(makeMockRequest({ host: '127.0.0.1:54321' })),
        { ok: true },
      );
      assert.deepEqual(
        validateHostAndOrigin(
          makeMockRequest({
            host: 'localhost:3000',
            origin: 'http://localhost:5173',
          }),
        ),
        { ok: true },
      );
      assert.deepEqual(
        validateHostAndOrigin(
          makeMockRequest({
            host: '[::1]:3000',
            origin: 'https://[::1]:8443',
          }),
        ),
        { ok: true },
      );
    });

    void it('rejects malicious or missing Host headers with 403', () => {
      for (const host of [
        undefined,
        'evil.example:3000',
        '127.0.0.1.evil.example:3000',
        'localhost.evil.example:3000',
        '127.0.0.1@evil.example',
        'localhost/path',
      ]) {
        const res = validateHostAndOrigin(makeMockRequest({ host }));
        assert.equal(res.ok, false, `Expected 403 for Host=${String(host)}`);
        if (!res.ok) {
          assert.equal(res.status, 403);
        }
      }
    });

    void it('rejects malicious Origin headers with 403 even when Host is valid loopback', () => {
      for (const origin of [
        'https://evil.example',
        'http://localhost.evil.example',
        'null',
        'file:///etc/passwd',
        'http://localhost/extra-path',
        'http://user@localhost',
      ]) {
        const res = validateHostAndOrigin(
          makeMockRequest({ host: '127.0.0.1:3000', origin }),
        );
        assert.equal(res.ok, false, `Expected 403 for Origin=${origin}`);
        if (!res.ok) {
          assert.equal(res.status, 403);
        }
      }
    });

    void it('supports custom allowedHosts and allowedOrigins port-agnostically', () => {
      const res = validateHostAndOrigin(
        makeMockRequest({
          host: 'mcp.corp.internal:8443',
          origin: 'https://portal.corp.internal:9443',
        }),
        {
          allowedHosts: ['mcp.corp.internal'],
          allowedOrigins: ['https://portal.corp.internal'],
        },
      );
      assert.deepEqual(res, { ok: true });

      const wrongScheme = validateHostAndOrigin(
        makeMockRequest({
          host: 'mcp.corp.internal:8443',
          origin: 'http://portal.corp.internal:9443',
        }),
        {
          allowedHosts: ['mcp.corp.internal'],
          allowedOrigins: ['https://portal.corp.internal'],
        },
      );
      assert.equal(wrongScheme.ok, false);
    });
  });

  void describe('verifyHttpBearerAuth', () => {
    void it('accepts valid Bearer and X-API-Key tokens using constant-time comparison', () => {
      const secret = 'super-secret-token-12345';
      assert.equal(
        verifyHttpBearerAuth(
          makeMockRequest({ authorization: `Bearer ${secret}` }),
          secret,
        ),
        true,
      );
      assert.equal(
        verifyHttpBearerAuth(
          makeMockRequest({ authorization: `bearer ${secret}` }),
          secret,
        ),
        true,
      );
      assert.equal(
        verifyHttpBearerAuth(makeMockRequest({ 'x-api-key': secret }), secret),
        true,
      );
    });

    void it('rejects missing, wrong, mismatched-length, or malformed auth headers', () => {
      const secret = 'super-secret-token-12345';
      assert.equal(verifyHttpBearerAuth(makeMockRequest({}), secret), false);
      assert.equal(
        verifyHttpBearerAuth(
          makeMockRequest({ authorization: 'Bearer wrong' }),
          secret,
        ),
        false,
      );
      assert.equal(
        verifyHttpBearerAuth(
          makeMockRequest({ authorization: `Basic ${secret}` }),
          secret,
        ),
        false,
      );
      assert.equal(
        verifyHttpBearerAuth(
          makeMockRequest({ 'x-api-key': 'wrong-key' }),
          secret,
        ),
        false,
      );
      // Do not fall back to X-API-Key if Authorization is explicitly provided and wrong
      assert.equal(
        verifyHttpBearerAuth(
          makeMockRequest({
            authorization: 'Bearer wrong',
            'x-api-key': secret,
          }),
          secret,
        ),
        false,
      );
    });
  });

  void describe('readBoundedBody', () => {
    void it('reads bodies up to and including exact maxBytes', async () => {
      const req = makeMockRequest({ 'content-length': '5' }, ['he', 'llo']);
      const res = await readBoundedBody(req, 5);
      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.text, 'hello');
        assert.equal(res.rawBody.byteLength, 5);
      }
    });

    void it('rejects immediately with 413 when Content-Length exceeds maxBytes', async () => {
      const req = makeMockRequest({ 'content-length': '100' }, ['small']);
      const res = await readBoundedBody(req, 10);
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.status, 413);
      }
    });

    void it('rejects mid-stream with 413 when chunked body exceeds maxBytes', async () => {
      const req = makeMockRequest({}, ['12345', '67890', 'x']);
      const res = await readBoundedBody(req, 10);
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.status, 413);
      }
    });
  });
});
