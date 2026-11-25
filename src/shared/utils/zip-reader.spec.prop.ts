import fc from 'fast-check';
import { readZipArchive } from './zip-reader';
import { buildTestZip } from '../test/zip-builder';
import { AzureDevOpsError } from '../errors';

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

describe('zip-reader properties', () => {
  it('losslessly round-trips arbitrary Stored (0) and Deflate (8) file maps including UTF-8 names and empty files', () => {
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
          expect(archive.entries).toHaveLength(entries.length);

          for (const expected of entries) {
            const meta = archive.findEntry(expected.name);
            expect(meta).toBeDefined();
            expect(meta?.isDirectory).toBe(false);
            expect(meta?.uncompressedSize).toBe(expected.content.length);
            expect(meta?.compressionMethod).toBe(expected.method);
            expect(archive.readEntryBuffer(meta!)).toEqual(
              Buffer.from(expected.content),
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('enforces maxEntries and maxEntryBytes zip-bomb caps for both Stored and Deflate entries', () => {
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
          expect(() => archive.readEntryBuffer(archive.entries[0])).toThrow(
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
    expect(() => readZipArchive(manyZip, { maxEntries: 2 })).toThrow(
      AzureDevOpsError,
    );
  });

  it('fuzzing arbitrary random byte buffers never hangs or throws anything other than AzureDevOpsError', () => {
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
          expect(err).toBeInstanceOf(AzureDevOpsError);
        }
      }),
      { numRuns: 200 },
    );
  });
});
