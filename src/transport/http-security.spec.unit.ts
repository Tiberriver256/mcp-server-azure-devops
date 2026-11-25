import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import { AzureDevOpsValidationError } from '../shared/errors/index.ts';
import {
  SlidingWindowRateLimiter,
  isLoopbackHost,
  readBoundedBody,
  timingSafeTokenEqual,
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

    void it('handles Bearer whitespace, tab separators, single-char tokens, and pathological inputs linearly', () => {
      const secret = 'tok-secret-value';
      assert.equal(
        verifyHttpBearerAuth(
          makeMockRequest({ authorization: `Bearer\t\t${secret}` }),
          secret,
        ),
        true,
      );
      assert.equal(
        verifyHttpBearerAuth(
          makeMockRequest({ authorization: `  BeArEr \t  ${secret}  ` }),
          secret,
        ),
        true,
      );
      assert.equal(
        verifyHttpBearerAuth(
          makeMockRequest({ authorization: 'Bearer a' }),
          'a',
        ),
        true,
      );

      for (const badHeader of [
        'Bearer',
        'Bearer ',
        'Bearer   ',
        'Bearer\t\t\t',
        `Bearerx ${secret}`,
        `Bearer\n${secret}`,
        `Bearer${'\t'.repeat(50_000)}`,
        `Bearer${' '.repeat(50_000)}wrong`,
      ]) {
        assert.equal(
          verifyHttpBearerAuth(
            makeMockRequest({ authorization: badHeader }),
            secret,
          ),
          false,
          `Expected false for Authorization length=${badHeader.length}`,
        );
      }

      // Valid token after large tab run still succeeds in linear time
      assert.equal(
        verifyHttpBearerAuth(
          makeMockRequest({
            authorization: `Bearer${'\t'.repeat(50_000)}${secret}`,
          }),
          secret,
        ),
        true,
      );
    });
  });

  void describe('timingSafeTokenEqual', () => {
    void it('compares ASCII and multi-byte UTF-8 tokens accurately while rejecting length or NUL-padding mismatches', () => {
      assert.equal(timingSafeTokenEqual('secret-123', 'secret-123'), true);
      assert.equal(timingSafeTokenEqual('a', 'a'), true);
      assert.equal(timingSafeTokenEqual('', ''), true);
      assert.equal(timingSafeTokenEqual('tök€n-🔑', 'tök€n-🔑'), true);

      // Different lengths and NUL-byte padding edge cases
      assert.equal(timingSafeTokenEqual('abc', 'abc\0'), false);
      assert.equal(timingSafeTokenEqual('abc\0', 'abc'), false);
      assert.equal(timingSafeTokenEqual('', '\0'), false);
      assert.equal(timingSafeTokenEqual('short', 'short-extended'), false);
      assert.equal(timingSafeTokenEqual('short-extended', 'short'), false);
      assert.equal(timingSafeTokenEqual('secret-123', 'secret-124'), false);
      assert.equal(timingSafeTokenEqual('tök€n-🔑', 'tök€n-🔒'), false);
    });
  });

  void describe('SlidingWindowRateLimiter', () => {
    void it('enforces sliding-window limits and computes positive Retry-After seconds', () => {
      let nowMs = 10_000;
      const limiter = new SlidingWindowRateLimiter({
        limit: 3,
        windowMs: 10_000,
        maxKeys: 16,
        now: () => nowMs,
      });

      assert.deepEqual(limiter.consume('127.0.0.1'), {
        allowed: true,
        remaining: 2,
        retryAfterSeconds: 0,
      });
      nowMs += 2_000;
      assert.deepEqual(limiter.consume('127.0.0.1'), {
        allowed: true,
        remaining: 1,
        retryAfterSeconds: 0,
      });
      nowMs += 2_000;
      assert.deepEqual(limiter.consume('127.0.0.1'), {
        allowed: true,
        remaining: 0,
        retryAfterSeconds: 0,
      });

      // 4th attempt within window is blocked; oldest entry at 10_000 expires at 20_000 (6s away)
      assert.deepEqual(limiter.consume('127.0.0.1'), {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 6,
      });

      // Advancing past oldest entry's expiry frees a slot
      nowMs = 20_001;
      assert.deepEqual(limiter.consume('127.0.0.1'), {
        allowed: true,
        remaining: 0,
        retryAfterSeconds: 0,
      });
    });

    void it('supports non-consuming check() and failure record() lockouts', () => {
      let nowMs = 1_000;
      const limiter = new SlidingWindowRateLimiter({
        limit: 2,
        windowMs: 5_000,
        maxKeys: 16,
        now: () => nowMs,
      });

      assert.equal(limiter.check('10.0.0.1').allowed, true);
      assert.equal(limiter.size, 0);

      assert.equal(limiter.record('10.0.0.1').allowed, true);
      assert.equal(limiter.check('10.0.0.1').allowed, true);

      const secondFail = limiter.record('10.0.0.1');
      assert.equal(secondFail.allowed, false);
      assert.equal(secondFail.retryAfterSeconds, 5);

      const blockedCheck = limiter.check('10.0.0.1');
      assert.equal(blockedCheck.allowed, false);
      assert.equal(blockedCheck.retryAfterSeconds, 5);

      // Once the window elapses, check() clears the expired bucket and allows again
      nowMs += 5_001;
      assert.equal(limiter.check('10.0.0.1').allowed, true);
      assert.equal(limiter.size, 0);
    });

    void it('bounds tracked keys to maxKeys by evicting expired entries first, then oldest entries', () => {
      let nowMs = 1_000;
      const limiter = new SlidingWindowRateLimiter({
        limit: 2,
        windowMs: 5_000,
        maxKeys: 2,
        now: () => nowMs,
      });

      limiter.consume('expired-ip');
      nowMs += 3_000;
      limiter.consume('active-ip-1');

      // Advance so 'expired-ip' is expired (1000 <= 6001-5000) while 'active-ip-1' (4000) is still active
      nowMs = 6_001;
      limiter.consume('active-ip-2');
      assert.equal(limiter.size, 2);
      // active-ip-1 must still be retained (1 remaining of 2)
      assert.equal(limiter.check('active-ip-1').remaining, 1);

      // All 2 keys are now active; adding a 3rd evicts the oldest ('active-ip-1')
      nowMs += 100;
      limiter.consume('active-ip-3');
      assert.equal(limiter.size, 2);
      assert.equal(limiter.check('active-ip-1').remaining, 2);
      assert.equal(limiter.check('active-ip-2').remaining, 1);
      assert.equal(limiter.check('active-ip-3').remaining, 1);
    });

    void it('validates constructor parameters', () => {
      assert.throws(
        () =>
          new SlidingWindowRateLimiter({
            limit: 0,
            windowMs: 1000,
            maxKeys: 10,
          }),
        RangeError,
      );
      assert.throws(
        () =>
          new SlidingWindowRateLimiter({ limit: 10, windowMs: 0, maxKeys: 10 }),
        RangeError,
      );
      assert.throws(
        () =>
          new SlidingWindowRateLimiter({
            limit: 10,
            windowMs: 1000,
            maxKeys: 0,
          }),
        RangeError,
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

    void it('rejects cleanly if the request closes before body completes', async () => {
      const stream = new Readable({
        read() {
          // Intentionally keep open until closed prematurely
        },
      });
      const req = Object.assign(stream, {
        headers: {},
        complete: false,
      }) as unknown as IncomingMessage;

      const bodyPromise = readBoundedBody(req, 100);
      stream.push('partial');
      stream.emit('close');

      await assert.rejects(bodyPromise, /closed before body completed/i);
    });
  });
});
