import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import { readZipArchive } from './zip-reader.ts';
import { buildTestZip } from '../test/zip-builder.ts';
import { AzureDevOpsError } from '../errors/index.ts';

const fileNameSegmentArb = fc.stringMatching(/^[a-zA-Z0-9._-]{1,12}$/);
const unicodeSegmentArb = fc.constantFrom(
  'café',
  'über',
  '日本語',
  'résumé',
  'docs',
  'src',
  'a-b_c.txt',
);

const entryNameArb = fc
  .array(fc.oneof(fileNameSegmentArb, unicodeSegmentArb), {
    minLength: 1,
    maxLength: 3,
  })
  .map((parts) => parts.join('/'));

void describe('zip-reader properties', () => {
  void it('losslessly round-trips arbitrary Stored (0) and Deflate (8) file maps including UTF-8 names and empty files', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            name: entryNameArb,
            content: fc.uint8Array({ minLength: 0, maxLength: 512 }),
            method: fc.constantFrom<0 | 8>(0, 8),
          }),
          { selector: (e) => e.name, minLength: 0, maxLength: 12 },
        ),
        (entries) => {
          const zipBuf = buildTestZip(
            entries.map((e) => ({
              name: e.name,
              content: Buffer.from(e.content),
              method: e.method,
              utf8: true,
            })),
          );

          const archive = readZipArchive(zipBuf);
          assert.strictEqual(archive.entries.length, entries.length);

          for (const expected of entries) {
            const meta = archive.findEntry(expected.name);
            assert.ok(meta !== undefined);
            assert.strictEqual(meta.isDirectory, false);
            assert.strictEqual(meta.uncompressedSize, expected.content.length);
            assert.strictEqual(meta.compressionMethod, expected.method);
            assert.deepStrictEqual(
              archive.readEntryBuffer(meta),
              Buffer.from(expected.content),
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  void it('enforces maxEntries and maxEntryBytes zip-bomb caps for both Stored and Deflate entries', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<0 | 8>(0, 8),
        fc.integer({ min: 64, max: 1024 }),
        fc.integer({ min: 1, max: 63 }),
        (method, payloadLen, maxBytes) => {
          const payload = Buffer.alloc(payloadLen, 0x41); // highly compressible
          const zipBuf = buildTestZip([
            { name: 'bomb.txt', content: payload, method },
          ]);

          const archive = readZipArchive(zipBuf, { maxEntryBytes: maxBytes });
          assert.throws(
            () => archive.readEntryBuffer(archive.entries[0]),
            AzureDevOpsError,
          );
        },
      ),
      { numRuns: 50 },
    );

    const manyZip = buildTestZip([
      { name: 'a.txt', content: '1' },
      { name: 'b.txt', content: '2' },
      { name: 'c.txt', content: '3' },
    ]);
    assert.throws(
      () => readZipArchive(manyZip, { maxEntries: 2 }),
      AzureDevOpsError,
    );
  });

  void it('fuzzing arbitrary random byte buffers never hangs or throws anything other than AzureDevOpsError', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 512 }), (bytes) => {
        try {
          const archive = readZipArchive(bytes, {
            maxEntries: 100,
            maxEntryBytes: 1024 * 64,
          });
          for (const entry of archive.entries) {
            archive.readEntryBuffer(entry);
          }
        } catch (err) {
          assert.ok(err instanceof AzureDevOpsError);
        }
      }),
      { numRuns: 200 },
    );
  });
});
