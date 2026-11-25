import type {
  EventId,
  EventStore,
  StreamId,
} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

export const DEFAULT_MAX_EVENTS_PER_STREAM = 256;
export const DEFAULT_MAX_STREAMS = 1000;
export const DEFAULT_IDLE_STREAM_TTL_MS = 30 * 60 * 1000;

export interface BoundedEventStoreOptions {
  /** Maximum number of events retained per stream (default: 256). */
  maxEventsPerStream?: number;
  /** Maximum number of distinct streams retained (default: 1000). */
  maxStreams?: number;
  /** Idle TTL in milliseconds before an inactive stream is evicted (default: 30 minutes). */
  idleStreamTtlMs?: number;
  /** Clock function for deterministic testing (default: Date.now). */
  now?: () => number;
}

interface StoredEvent {
  readonly seq: number;
  readonly eventId: EventId;
  readonly message: JSONRPCMessage;
}

interface StreamBucket {
  readonly buffer: StoredEvent[];
  start: number;
  count: number;
  nextSeq: number;
  lastAccessedAt: number;
}

interface ParsedEventId {
  readonly streamId: StreamId;
  readonly seq: number;
}

function parseEventId(eventId: EventId): ParsedEventId | undefined {
  const separatorIndex = eventId.lastIndexOf(':');
  if (separatorIndex <= 0 || separatorIndex === eventId.length - 1) {
    return undefined;
  }
  const streamId = eventId.slice(0, separatorIndex);
  const seqText = eventId.slice(separatorIndex + 1);
  if (!/^[1-9]\d*$/.test(seqText)) {
    return undefined;
  }
  const seq = Number(seqText);
  if (!Number.isSafeInteger(seq)) {
    return undefined;
  }
  return { streamId, seq };
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer, got ${value}`);
  }
}

/**
 * Memory-bounded in-memory MCP Streamable HTTP EventStore supporting SSE
 * `Last-Event-ID` resumability with O(1) append/eviction per stream and
 * LRU + TTL stream eviction.
 */
export class BoundedEventStore implements EventStore {
  private readonly maxEventsPerStream: number;
  private readonly maxStreams: number;
  private readonly idleStreamTtlMs: number;
  private readonly now: () => number;
  private readonly streams = new Map<StreamId, StreamBucket>();

  constructor(options: BoundedEventStoreOptions = {}) {
    const maxEventsPerStream =
      options.maxEventsPerStream ?? DEFAULT_MAX_EVENTS_PER_STREAM;
    const maxStreams = options.maxStreams ?? DEFAULT_MAX_STREAMS;
    const idleStreamTtlMs =
      options.idleStreamTtlMs ?? DEFAULT_IDLE_STREAM_TTL_MS;

    assertPositiveInteger(maxEventsPerStream, 'maxEventsPerStream');
    assertPositiveInteger(maxStreams, 'maxStreams');
    assertPositiveInteger(idleStreamTtlMs, 'idleStreamTtlMs');

    this.maxEventsPerStream = maxEventsPerStream;
    this.maxStreams = maxStreams;
    this.idleStreamTtlMs = idleStreamTtlMs;
    this.now = options.now ?? Date.now;
  }

  get streamCount(): number {
    return this.streams.size;
  }

  /**
   * Removes streams whose last access timestamp exceeds the configured idle TTL.
   * Returns the number of evicted streams.
   */
  pruneExpired(): number {
    const cutoff = this.now() - this.idleStreamTtlMs;
    let evicted = 0;
    // Map preserves access order (oldest first), so we can stop at the first fresh stream.
    for (const [streamId, bucket] of this.streams) {
      if (bucket.lastAccessedAt < cutoff) {
        this.streams.delete(streamId);
        evicted += 1;
      } else {
        break;
      }
    }
    return evicted;
  }

  /**
   * Clears all stored streams and events.
   */
  clear(): void {
    this.streams.clear();
  }

  async storeEvent(
    streamId: StreamId,
    message: JSONRPCMessage,
  ): Promise<EventId> {
    this.pruneExpired();
    const timestamp = this.now();

    let bucket = this.streams.get(streamId);
    if (bucket) {
      // Refresh LRU ordering
      this.streams.delete(streamId);
      bucket.lastAccessedAt = timestamp;
      this.streams.set(streamId, bucket);
    } else {
      while (this.streams.size >= this.maxStreams) {
        const oldestKey = this.streams.keys().next().value;
        if (oldestKey === undefined) {
          break;
        }
        this.streams.delete(oldestKey);
      }
      bucket = {
        buffer: [],
        start: 0,
        count: 0,
        nextSeq: 1,
        lastAccessedAt: timestamp,
      };
      this.streams.set(streamId, bucket);
    }

    const seq = bucket.nextSeq;
    bucket.nextSeq += 1;
    const eventId: EventId = `${streamId}:${seq}`;
    const stored: StoredEvent = { seq, eventId, message };

    if (bucket.count < this.maxEventsPerStream) {
      if (bucket.buffer.length < this.maxEventsPerStream) {
        bucket.buffer.push(stored);
      } else {
        bucket.buffer[(bucket.start + bucket.count) % this.maxEventsPerStream] =
          stored;
      }
      bucket.count += 1;
    } else {
      // Ring buffer is full: overwrite the oldest slot in O(1) and advance head.
      bucket.buffer[bucket.start] = stored;
      bucket.start = (bucket.start + 1) % this.maxEventsPerStream;
    }

    return eventId;
  }

  async getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined> {
    this.pruneExpired();
    const parsed = parseEventId(eventId);
    if (!parsed) {
      return undefined;
    }
    const bucket = this.streams.get(parsed.streamId);
    if (!bucket) {
      return undefined;
    }
    return parsed.streamId;
  }

  async replayEventsAfter(
    lastEventId: EventId,
    {
      send,
    }: {
      send: (eventId: EventId, message: JSONRPCMessage) => Promise<void>;
    },
  ): Promise<StreamId> {
    this.pruneExpired();
    const parsed = parseEventId(lastEventId);
    if (!parsed) {
      throw new Error(`Invalid event ID format: ${lastEventId}`);
    }

    const bucket = this.streams.get(parsed.streamId);
    if (!bucket) {
      throw new Error(`Unknown or expired stream for event ID: ${lastEventId}`);
    }

    // Touch stream to keep it warm in LRU/TTL tracking.
    this.streams.delete(parsed.streamId);
    bucket.lastAccessedAt = this.now();
    this.streams.set(parsed.streamId, bucket);

    if (bucket.count === 0) {
      return parsed.streamId;
    }

    const firstEvent = bucket.buffer[bucket.start];
    const lastOffset = (bucket.start + bucket.count - 1) % bucket.buffer.length;
    const lastEvent = bucket.buffer[lastOffset];

    if (parsed.seq >= lastEvent.seq) {
      return parsed.streamId;
    }

    const startOffset =
      parsed.seq < firstEvent.seq ? 0 : parsed.seq - firstEvent.seq + 1;

    // Snapshot missed events in order so concurrent appends during awaits are safe.
    const toReplay: StoredEvent[] = [];
    for (let i = startOffset; i < bucket.count; i += 1) {
      const idx = (bucket.start + i) % bucket.buffer.length;
      toReplay.push(bucket.buffer[idx]);
    }

    for (const event of toReplay) {
      await send(event.eventId, event.message);
    }

    return parsed.streamId;
  }
}
