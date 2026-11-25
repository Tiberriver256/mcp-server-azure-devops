import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import {
  buildAdoResourceUri,
  getMimeType,
  parseAdoResourceUri,
} from './ado-resource-uri.ts';
import type {
  AdoResourceRef,
  ParsedAdoResourceUri,
} from './ado-resource-uri.ts';
import { AzureDevOpsResourceNotFoundError } from '../errors/index.ts';

// Note: URL hostnames are lowercased by WHATWG URL parser, so org uses lowercase DNS-safe slugs
const orgArb = fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,16}$/);
const segmentArb = fc
  .stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,16}$/)
  .filter(
    (s) => s !== 'contents' && s !== '.' && s !== '..' && s.trim().length > 0,
  );
const slashedRefArb = fc
  .array(segmentArb, { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join('/'));
const filePathArb = fc
  .array(segmentArb, { minLength: 0, maxLength: 4 })
  .map((parts) => (parts.length === 0 ? '/' : `/${parts.join('/')}`));
const commitArb = fc.stringMatching(/^[0-9a-f]{7,40}$/);

const refArb: fc.Arbitrary<AdoResourceRef> = fc.oneof(
  fc.constant({ kind: 'default' as const }),
  slashedRefArb.map((branch) => ({ kind: 'branch' as const, branch })),
  commitArb.map((commit) => ({ kind: 'commit' as const, commit })),
  slashedRefArb.map((tag) => ({ kind: 'tag' as const, tag })),
  fc
    .integer({ min: 1, max: 1_000_000 })
    .map((pullRequestId) => ({ kind: 'pullrequest' as const, pullRequestId })),
);

const parsedUriArb: fc.Arbitrary<ParsedAdoResourceUri> = fc.record({
  organization: orgArb,
  project: segmentArb,
  repository: segmentArb,
  path: filePathArb,
  ref: refArb,
});

void describe('ado-resource-uri properties', () => {
  void it('round-trips parseAdoResourceUri(buildAdoResourceUri(x)) === x across all 5 ref kinds including slashed branches/tags', () => {
    fc.assert(
      fc.property(parsedUriArb, (input) => {
        const uri = buildAdoResourceUri(input);
        const reparsed = parseAdoResourceUri(uri);
        assert.deepStrictEqual(reparsed, { ...input });
        // Canonical formatting is idempotent
        assert.strictEqual(buildAdoResourceUri(reparsed), uri);
      }),
      { numRuns: 200 },
    );
  });

  void it('rejects any non-ado: protocol with AzureDevOpsResourceNotFoundError', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('http', 'https', 'file', 'ftp', 'git', 'ssh'),
        orgArb,
        segmentArb,
        segmentArb,
        (proto, org, proj, repo) => {
          assert.throws(
            () =>
              parseAdoResourceUri(
                `${proto}://${org}/${proj}/${repo}/contents/a.ts`,
              ),
            AzureDevOpsResourceNotFoundError,
          );
        },
      ),
      { numRuns: 60 },
    );
  });

  void it('getMimeType always returns a valid type/subtype string and is case-insensitive on extension', () => {
    fc.assert(
      fc.property(
        filePathArb,
        fc.constantFrom(
          'ts',
          'TS',
          'json',
          'JSON',
          'md',
          'MD',
          'py',
          'unknownext',
        ),
        (dir, ext) => {
          const full = dir === '/' ? `/file.${ext}` : `${dir}/file.${ext}`;
          const mime = getMimeType(full);
          assert.match(mime, /^[a-z]+\/[a-z0-9.+-]+$/);
          assert.strictEqual(mime, getMimeType(full.toLowerCase()));
        },
      ),
      { numRuns: 100 },
    );
  });
});
