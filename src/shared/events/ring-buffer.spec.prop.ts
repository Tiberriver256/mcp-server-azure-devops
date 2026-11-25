import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import { MAX_EVENT_TEXT_LENGTH, truncateEventText } from './catalog.ts';
import {
  BoundedRingBuffer,
  CURSOR_PATTERN,
  formatCursor,
  parseCursor,
} from './ring-buffer.ts';

void describe('BoundedRingBuffer & text truncation property invariants', () => {
  void it('formatCursor and parseCursor round-trip for any valid 8-hex epoch and safe seq', () => {
    const hexEpochArb = fc
      .array(fc.constantFrom(...'0123456789abcdef'.split('')), {
        minLength: 8,
        maxLength: 8,
      })
      .map((chars) => chars.join(''));

    fc.assert(
      fc.property(
        hexEpochArb,
        fc.integer({ min: 0, max: 1_000_000 }),
        (epoch, seq) => {
          const formatted = formatCursor(epoch, seq);
          assert.match(formatted, CURSOR_PATTERN);
          const parsed = parseCursor(formatted);
          assert.deepEqual(parsed, { version: 'v1', epoch, seq });
        },
      ),
    );
  });

  void it('ring buffer never exceeds capacity and preserves FIFO order of newest entries', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.array(fc.integer({ min: -1000, max: 1000 }), {
          minLength: 0,
          maxLength: 150,
        }),
        (capacity, items) => {
          const buf = new BoundedRingBuffer<number>({ maxEntries: capacity });
          const boot = buf.readSince(null);

          for (const item of items) {
            buf.push(item);
            assert.ok(buf.size <= capacity);
          }

          const read = buf.readSince(boot.cursor);
          const expectedTruncated = items.length > capacity;
          const expectedItems = items.slice(-capacity);

          assert.equal(read.truncated, expectedTruncated);
          assert.deepEqual(
            read.items.map((e) => e.item),
            expectedItems,
          );
          assert.match(read.cursor, CURSOR_PATTERN);
          assert.equal(read.cursor, buf.headCursor);
        },
      ),
    );
  });

  void it('paginated reads without eviction reconstruct the exact sequence with zero drops or duplicates', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ maxLength: 16 }), { minLength: 0, maxLength: 60 }),
        fc.integer({ min: 1, max: 10 }),
        (items, pageSize) => {
          const buf = new BoundedRingBuffer<string>({
            maxEntries: Math.max(1, items.length + 5),
          });
          let cursor = buf.readSince(null).cursor;

          for (const item of items) {
            buf.push(item);
          }

          const collected: string[] = [];
          for (let guard = 0; guard < 100; guard += 1) {
            const page = buf.readSince(cursor, pageSize);
            assert.equal(page.truncated, false);
            for (const entry of page.items) {
              collected.push(entry.item);
            }
            cursor = page.cursor;
            if (!page.hasMore) {
              break;
            }
          }

          assert.deepEqual(collected, items);
        },
      ),
    );
  });

  void it('truncateEventText always bounds length to <= maxLength and preserves leading prefix', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 600 }),
        fc.integer({ min: 2, max: MAX_EVENT_TEXT_LENGTH }),
        (input, maxLen) => {
          const result = truncateEventText(input, maxLen);
          assert.equal(typeof result, 'string');
          assert.ok(result!.length <= maxLen);
          if (input.length <= maxLen) {
            assert.equal(result, input);
          } else {
            assert.equal(result!.length, maxLen);
            assert.ok(result!.startsWith(input.slice(0, maxLen - 1)));
          }
        },
      ),
    );
  });
});
