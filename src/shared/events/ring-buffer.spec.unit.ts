import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EventsErrorCode, isEventsProtocolError } from './errors.ts';
import {
  BoundedRingBuffer,
  CURSOR_PATTERN,
  DEFAULT_RING_BUFFER_SIZE,
  MAX_RING_BUFFER_SIZE,
  MIN_RING_BUFFER_SIZE,
  clampRingBufferSize,
  formatCursor,
  parseCursor,
} from './ring-buffer.ts';

void describe('BoundedRingBuffer', () => {
  void it('clamps capacity to [1, 10_000] with default 1000', () => {
    assert.equal(clampRingBufferSize(undefined), DEFAULT_RING_BUFFER_SIZE);
    assert.equal(clampRingBufferSize(Number.NaN), DEFAULT_RING_BUFFER_SIZE);
    assert.equal(clampRingBufferSize(0), MIN_RING_BUFFER_SIZE);
    assert.equal(clampRingBufferSize(-50), MIN_RING_BUFFER_SIZE);
    assert.equal(clampRingBufferSize(50_000), MAX_RING_BUFFER_SIZE);
    assert.equal(clampRingBufferSize(42.9), 42);
  });

  void it('generates valid v1:<8-hex>:<seq> cursors and parses/rejects cursor syntax strictly', () => {
    const buf = new BoundedRingBuffer<string>({ maxEntries: 5 });
    assert.match(buf.headCursor, CURSOR_PATTERN);

    const parsed = parseCursor(buf.headCursor);
    assert.ok(parsed);
    assert.equal(parsed.version, 'v1');
    assert.equal(parsed.epoch, buf.epochId);
    assert.equal(parsed.seq, 0);

    assert.equal(parseCursor('invalid'), null);
    assert.equal(parseCursor('v2:deadbeef:1'), null);
    assert.equal(parseCursor('v1:DEADBEEF:1'), null);
    assert.equal(parseCursor('v1:deadbee:1'), null);
    assert.equal(parseCursor('v1:deadbeef:-1'), null);
    assert.equal(parseCursor('v1:deadbeef:01'), null);
    assert.equal(parseCursor('v1:deadbeef:99999999999999999999999'), null);
  });

  void it('supports null cursor bootstrap and incremental paginated reads', () => {
    const buf = new BoundedRingBuffer<number>({
      maxEntries: 10,
      epoch: 'a1b2c3d4',
    });

    const boot = buf.readSince(null);
    assert.deepEqual(boot.items, []);
    assert.equal(boot.cursor, 'v1:a1b2c3d4:0');
    assert.equal(boot.truncated, false);
    assert.equal(boot.hasMore, false);

    for (let i = 1; i <= 5; i += 1) {
      buf.push(i);
    }

    const page1 = buf.readSince(boot.cursor, 2);
    assert.deepEqual(
      page1.items.map((e) => e.item),
      [1, 2],
    );
    assert.equal(page1.cursor, 'v1:a1b2c3d4:2');
    assert.equal(page1.truncated, false);
    assert.equal(page1.hasMore, true);

    const page2 = buf.readSince(page1.cursor, 2);
    assert.deepEqual(
      page2.items.map((e) => e.item),
      [3, 4],
    );
    assert.equal(page2.cursor, 'v1:a1b2c3d4:4');
    assert.equal(page2.truncated, false);
    assert.equal(page2.hasMore, true);

    const page3 = buf.readSince(page2.cursor, 2);
    assert.deepEqual(
      page3.items.map((e) => e.item),
      [5],
    );
    assert.equal(page3.cursor, 'v1:a1b2c3d4:5');
    assert.equal(page3.truncated, false);
    assert.equal(page3.hasMore, false);

    const caughtUp = buf.readSince(page3.cursor, 2);
    assert.deepEqual(caughtUp.items, []);
    assert.equal(caughtUp.cursor, 'v1:a1b2c3d4:5');
    assert.equal(caughtUp.truncated, false);
    assert.equal(caughtUp.hasMore, false);
  });

  void it('never throws on evicted cursor or mismatched boot epoch and reports truncated: true', () => {
    const buf = new BoundedRingBuffer<string>({
      maxEntries: 3,
      epoch: '11223344',
    });
    const boot = buf.readSince(null);

    for (let i = 1; i <= 6; i += 1) {
      buf.push(`ev-${i}`);
    }
    assert.equal(buf.size, 3);

    const evicted = buf.readSince(boot.cursor);
    assert.equal(evicted.truncated, true);
    assert.equal(evicted.cursor, 'v1:11223344:6');
    assert.deepEqual(
      evicted.items.map((e) => e.item),
      ['ev-4', 'ev-5', 'ev-6'],
    );

    const mismatched = buf.readSince(formatCursor('deadbeef', 1));
    assert.equal(mismatched.truncated, true);
    assert.equal(mismatched.cursor, 'v1:11223344:6');
    assert.deepEqual(
      mismatched.items.map((e) => e.item),
      ['ev-4', 'ev-5', 'ev-6'],
    );
  });

  void it('rejects malformed cursor syntax with EventsProtocolError(-32602)', () => {
    const buf = new BoundedRingBuffer<string>({ maxEntries: 5 });
    assert.throws(
      () => buf.readSince('not-a-valid-cursor'),
      (err: unknown) => {
        assert.ok(isEventsProtocolError(err));
        assert.equal(err.code, EventsErrorCode.InvalidParams);
        return true;
      },
    );
  });

  void it('prunes entries older than maxAgeMs and reports truncation when older entries expired', () => {
    let currentTime = 1_000_000;
    const buf = new BoundedRingBuffer<string>({
      maxEntries: 10,
      maxAgeMs: 5_000,
      epoch: 'aabbccdd',
      now: () => currentTime,
    });

    const boot = buf.readSince(null);
    buf.push('old-1');
    currentTime += 3_000;
    buf.push('fresh-2');
    currentTime += 3_000; // old-1 is now 6_000ms old (> 5_000ms), fresh-2 is 3_000ms old

    assert.equal(buf.size, 1);
    const res = buf.readSince(boot.cursor);
    assert.equal(res.truncated, true);
    assert.deepEqual(
      res.items.map((e) => e.item),
      ['fresh-2'],
    );
  });

  void it('enforces the 10_000 hard ceiling during high-volume bursts', () => {
    const buf = new BoundedRingBuffer<number>({ maxEntries: 50_000 });
    assert.equal(buf.capacity, 10_000);
    const boot = buf.readSince(null);

    for (let i = 0; i < 10_005; i += 1) {
      buf.push(i);
    }

    assert.equal(buf.size, 10_000);
    const read = buf.readSince(boot.cursor, 10);
    assert.equal(read.truncated, true);
    assert.equal(read.items.length, 10);
    assert.equal(read.items[0].item, 5);
    assert.equal(read.hasMore, true);
  });
});
