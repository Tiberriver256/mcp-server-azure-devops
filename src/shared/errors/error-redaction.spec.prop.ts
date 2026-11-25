import fc from 'fast-check';
import { handleResponseError, redactSecrets } from './handle-request-error';
import { HttpError, sanitizeUrlForError } from '../http/http-client';
import { formatOrgUrlForLog } from '../azure-devops-url';

const tokenArb = fc.stringMatching(/^[A-Za-z0-9+/=._-]{16,48}$/);
const patArb = fc.stringMatching(/^[a-z0-9]{20,52}$/);

describe('error & log secret-redaction security properties', () => {
  let stderrChunks: string[];
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stderrChunks = [];
    stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: unknown) => {
        stderrChunks.push(String(chunk));
        return true;
      });
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('SECURITY INVARIANT: arbitrary Basic/Bearer tokens and URL userinfo never survive redactSecrets or handleResponseError (neither response nor stderr)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('Basic', 'Bearer'),
        tokenArb,
        patArb,
        (scheme, token, pat) => {
          stderrChunks.length = 0;
          const leakyMessage =
            `Request failed: Authorization: ${scheme} ${token} ` +
            `to https://user:${pat}@dev.azure.com/org/_apis/git?secret=${pat}`;

          const redacted = redactSecrets(leakyMessage);
          expect(redacted).not.toContain(token);
          expect(redacted).not.toContain(`:${pat}@`);

          const response = handleResponseError(new Error(leakyMessage));
          expect(response.isError).toBe(true);
          expect(response.content[0].text).not.toContain(token);
          expect(response.content[0].text).not.toContain(`:${pat}@`);

          const stderrText = stderrChunks.join('');
          expect(stderrText).not.toContain(token);
          expect(stderrText).not.toContain(`:${pat}@`);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('HttpError and sanitizeUrlForError strip credentials and query tokens from URLs', () => {
    fc.assert(
      fc.property(patArb, patArb, (pass, sasSig) => {
        const rawUrl = `https://pat:${pass}@dev.azure.com/myorg/_apis/projects?sig=${sasSig}&api-version=7.1`;
        const sanitized = sanitizeUrlForError(rawUrl);
        expect(sanitized).toBe('https://dev.azure.com/myorg/_apis/projects');
        expect(sanitized).not.toContain(pass);
        expect(sanitized).not.toContain(sasSig);

        const err = new HttpError({
          message: 'HTTP 401',
          status: 401,
          statusText: 'Unauthorized',
          url: rawUrl,
        });
        expect(err.url).not.toContain(pass);
        expect(err.url).not.toContain(sasSig);
        expect(formatOrgUrlForLog(rawUrl)).not.toContain(pass);
        expect(formatOrgUrlForLog(rawUrl)).not.toContain(sasSig);
      }),
      { numRuns: 100 },
    );
  });
});
