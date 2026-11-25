import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { BoundedEventStore } from './bounded-event-store.ts';

function makeNotification(seq: number): JSONRPCMessage {
  return {
    jsonrpc: '2.0',
    method: 'notifications/resources/updated',
    params: { uri: `ado://org/proj/item/${seq}` },
  };
}

void describe('BoundedEventStore', () => {
  void it('stores events with ${streamId}:${seq} IDs and replays strictly after lastEventId', async () => {
    const store = new BoundedEventStore();
    const id1 = await store.storeEvent('_GET_stream', makeNotification(1));
    const id2 = await store.storeEvent('_GET_stream', makeNotification(2));
    const id3 = await store.storeEvent('_GET_stream', makeNotification(3));

    assert.equal(id1, '_GET_stream:1');
    assert.equal(id2, '_GET_stream:2');
    assert.equal(id3, '_GET_stream:3');
    assert.equal(await store.getStreamIdForEventId(id1), '_GET_stream');

    const replayed: Array<{ eventId: string; message: JSONRPCMessage }> = [];
    const streamId = await store.replayEventsAfter(id1, {
      send: async (eventId, message) => {
        replayed.push({ eventId, message });
      },
    });

    assert.equal(streamId, '_GET_stream');
    assert.deepEqual(
      replayed.map((r) => r.eventId),
      ['_GET_stream:2', '_GET_stream:3'],
    );
    assert.deepEqual(replayed[0].message, makeNotification(2));
    assert.deepEqual(replayed[1].message, makeNotification(3));
  });

  void it('replays zero events when client is already caught up to latest event', async () => {
    const store = new BoundedEventStore();
    await store.storeEvent('s1', makeNotification(1));
    const latest = await store.storeEvent('s1', makeNotification(2));

    const replayed: string[] = [];
    const streamId = await store.replayEventsAfter(latest, {
      send: async (eventId) => {
        replayed.push(eventId);
      },
    });

    assert.equal(streamId, 's1');
    assert.deepEqual(replayed, []);
  });

  void it('supports stream IDs containing colons', async () => {
    const store = new BoundedEventStore();
    const id1 = await store.storeEvent(
      'sess:alpha:stream',
      makeNotification(1),
    );
    const id2 = await store.storeEvent(
      'sess:alpha:stream',
      makeNotification(2),
    );

    assert.equal(id1, 'sess:alpha:stream:1');
    assert.equal(await store.getStreamIdForEventId(id1), 'sess:alpha:stream');

    const replayed: string[] = [];
    const streamId = await store.replayEventsAfter(id1, {
      send: async (eventId) => {
        replayed.push(eventId);
      },
    });
    assert.equal(streamId, 'sess:alpha:stream');
    assert.deepEqual(replayed, [id2]);
  });

  void it('bounds per-stream memory with O(1) FIFO ring buffer eviction across wrap-around', async () => {
    const store = new BoundedEventStore({ maxEventsPerStream: 3 });
    const ids: string[] = [];
    for (let i = 1; i <= 10; i += 1) {
      ids.push(await store.storeEvent('ring', makeNotification(i)));
    }

    // Only events 8, 9, 10 remain; replaying after evicted event 2 replays all 3 retained events.
    const fromEvicted: string[] = [];
    await store.replayEventsAfter(ids[1], {
      send: async (eventId) => {
        fromEvicted.push(eventId);
      },
    });
    assert.deepEqual(fromEvicted, ['ring:8', 'ring:9', 'ring:10']);

    // Replaying after event 8 replays 9 and 10.
    const fromRetained: string[] = [];
    await store.replayEventsAfter('ring:8', {
      send: async (eventId) => {
        fromRetained.push(eventId);
      },
    });
    assert.deepEqual(fromRetained, ['ring:9', 'ring:10']);
  });

  void it('evicts least-recently-used stream when maxStreams is exceeded', async () => {
    const store = new BoundedEventStore({ maxStreams: 2 });
    const s1 = await store.storeEvent('stream-1', makeNotification(1));
    const s2 = await store.storeEvent('stream-2', makeNotification(1));

    // Touch stream-1 so stream-2 becomes oldest
    await store.storeEvent('stream-1', makeNotification(2));
    // Adding stream-3 must evict stream-2
    const s3 = await store.storeEvent('stream-3', makeNotification(1));

    assert.equal(store.streamCount, 2);
    assert.equal(await store.getStreamIdForEventId(s1), 'stream-1');
    assert.equal(await store.getStreamIdForEventId(s2), undefined);
    assert.equal(await store.getStreamIdForEventId(s3), 'stream-3');
  });

  void it('expires idle streams after idleStreamTtlMs while preserving active streams', async () => {
    let nowMs = 1_000_000;
    const store = new BoundedEventStore({
      idleStreamTtlMs: 5_000,
      now: () => nowMs,
    });

    const staleId = await store.storeEvent('stale', makeNotification(1));
    nowMs += 3_000;
    const freshId = await store.storeEvent('fresh', makeNotification(1));
    nowMs += 3_000; // stale is 6_000ms old (>5_000), fresh is 3_000ms old

    assert.equal(await store.getStreamIdForEventId(staleId), undefined);
    assert.equal(await store.getStreamIdForEventId(freshId), 'fresh');
    assert.equal(store.streamCount, 1);

    nowMs += 6_000;
    assert.equal(store.pruneExpired(), 1);
    assert.equal(store.streamCount, 0);
  });

  void it('returns undefined / throws for invalid or unknown event IDs', async () => {
    const store = new BoundedEventStore();
    assert.equal(await store.getStreamIdForEventId(''), undefined);
    assert.equal(await store.getStreamIdForEventId('no-colon'), undefined);
    assert.equal(await store.getStreamIdForEventId(':1'), undefined);
    assert.equal(await store.getStreamIdForEventId('stream:0'), undefined);
    assert.equal(await store.getStreamIdForEventId('stream:abc'), undefined);
    assert.equal(await store.getStreamIdForEventId('unknown:1'), undefined);

    await assert.rejects(
      () => store.replayEventsAfter('bad-id', { send: async () => {} }),
      /Invalid event ID format/,
    );
    await assert.rejects(
      () => store.replayEventsAfter('unknown:1', { send: async () => {} }),
      /Unknown or expired stream/,
    );
  });

  void it('validates positive integer options and supports clear()', async () => {
    assert.throws(
      () => new BoundedEventStore({ maxEventsPerStream: 0 }),
      RangeError,
    );
    assert.throws(() => new BoundedEventStore({ maxStreams: -1 }), RangeError);
    assert.throws(
      () => new BoundedEventStore({ idleStreamTtlMs: 0 }),
      RangeError,
    );

    const store = new BoundedEventStore();
    await store.storeEvent('s1', makeNotification(1));
    assert.equal(store.streamCount, 1);
    store.clear();
    assert.equal(store.streamCount, 0);
  });
});
