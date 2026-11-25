import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import fc from 'fast-check';
import { handleResponseError, redactSecrets } from './handle-request-error.ts';
import { HttpError, sanitizeUrlForError } from '../http/http-client.ts';
import { formatOrgUrlForLog } from '../azure-devops-url.ts';

const tokenArb = fc.stringMatching(/^[A-Za-z0-9+/=._-]{16,48}$/);
const patArb = fc.stringMatching(/^[a-z0-9]{20,52}$/);

void describe('error & log secret-redaction security properties', () => {
  let stderrChunks: string[];

  beforeEach(() => {
    stderrChunks = [];
    mock.method(process.stderr, 'write', (chunk: unknown) => {
      stderrChunks.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    mock.restoreAll();
  });

  void it('SECURITY INVARIANT: arbitrary Basic/Bearer tokens (any casing) and URL userinfo never survive redactSecrets or handleResponseError (neither response nor stderr)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('Basic', 'Bearer', 'basic', 'bearer', 'BEARER'),
        fc.constantFrom('user:', ':', ''),
        tokenArb,
        patArb,
        (scheme, userPrefix, token, pat) => {
          stderrChunks.length = 0;
          const leakyMessage =
            `Request failed: Authorization: ${scheme} ${token} ` +
            `to https://${userPrefix}${pat}@dev.azure.com/org/_apis/git`;

          const redacted = redactSecrets(leakyMessage);
          assert.ok(!redacted.includes(token));
          assert.ok(!redacted.includes(`${pat}@`));

          const response = handleResponseError(new Error(leakyMessage));
          assert.strictEqual(response.isError, true);
          assert.ok(!response.content[0].text.includes(token));
          assert.ok(!response.content[0].text.includes(`${pat}@`));

          const stderrText = stderrChunks.join('');
          assert.ok(!stderrText.includes(token));
          assert.ok(!stderrText.includes(`${pat}@`));
        },
      ),
      { numRuns: 150 },
    );
  });

  void it('HttpError and sanitizeUrlForError strip credentials and query tokens from URLs', () => {
    fc.assert(
      fc.property(patArb, patArb, (pass, sasSig) => {
        const rawUrl = `https://pat:${pass}@dev.azure.com/myorg/_apis/projects?sig=${sasSig}&api-version=7.1`;
        const sanitized = sanitizeUrlForError(rawUrl);
        assert.strictEqual(
          sanitized,
          'https://dev.azure.com/myorg/_apis/projects',
        );
        assert.ok(!sanitized.includes(pass));
        assert.ok(!sanitized.includes(sasSig));

        const err = new HttpError({
          message: 'HTTP 401',
          status: 401,
          statusText: 'Unauthorized',
          url: rawUrl,
        });
        assert.ok(!err.url.includes(pass));
        assert.ok(!err.url.includes(sasSig));
        assert.ok(!formatOrgUrlForLog(rawUrl).includes(pass));
        assert.ok(!formatOrgUrlForLog(rawUrl).includes(sasSig));
      }),
      { numRuns: 100 },
    );
  });

  void it('preserves ordinary English diagnostics containing Basic/Bearer words without false-positive redaction', () => {
    assert.strictEqual(
      redactSecrets('Basic authentication failed for request'),
      'Basic authentication failed for request',
    );
    assert.strictEqual(
      redactSecrets('Invalid basic credentials supplied'),
      'Invalid basic credentials supplied',
    );
  });
});
