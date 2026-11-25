import { randomBytes } from 'node:crypto';
import { EventsErrorCode, EventsProtocolError } from './errors.ts';

export const DEFAULT_RING_BUFFER_SIZE = 1000;
export const MIN_RING_BUFFER_SIZE = 1;
export const MAX_RING_BUFFER_SIZE = 10_000;
export const DEFAULT_RING_BUFFER_MAX_AGE_MS = 3_600_000;

export const CURSOR_PATTERN = /^v1:([0-9a-f]{8}):(\d+)$/;

export interface ParsedCursor {
  readonly version: 'v1';
  readonly epoch: string;
  readonly seq: number;
}

export interface RingBufferEntry<T> {
  readonly cursor: string;
  readonly seq: number;
  readonly timestamp: number;
  readonly item: T;
}

export interface RingBufferReadResult<T> {
  readonly items: readonly RingBufferEntry<T>[];
  readonly cursor: string;
  readonly truncated: boolean;
  readonly hasMore: boolean;
}

export interface BoundedRingBufferOptions {
  readonly maxEntries?: number;
  readonly maxAgeMs?: number;
  readonly epoch?: string;
  readonly now?: () => number;
}

/**
 * Clamp requested ring buffer capacity to the safe bounds `[1, 10_000]`.
 */
export function clampRingBufferSize(size?: number): number {
  if (size === undefined || !Number.isFinite(size)) {
    return DEFAULT_RING_BUFFER_SIZE;
  }
  const intVal = Math.trunc(size);
  if (intVal < MIN_RING_BUFFER_SIZE) {
    return MIN_RING_BUFFER_SIZE;
  }
  if (intVal > MAX_RING_BUFFER_SIZE) {
    return MAX_RING_BUFFER_SIZE;
  }
  return intVal;
}

/**
 * Format a cursor string `v1:<8-hex-epoch>:<seq>`.
 */
export function formatCursor(epoch: string, seq: number): string {
  return `v1:${epoch}:${seq}`;
}

/**
 * Parse and strictly validate a SEP-3415 cursor string (`v1:<8-hex>:<seq>`).
 * Returns `null` when the syntax or sequence number is invalid.
 */
export function parseCursor(cursor: string): ParsedCursor | null {
  const match = CURSOR_PATTERN.exec(cursor);
  if (!match) {
    return null;
  }
  const epoch = match[1];
  const seqStr = match[2];
  // Reject leading zeros on multi-digit sequence numbers to keep canonical form
  if (seqStr.length > 1 && seqStr.startsWith('0')) {
    return null;
  }
  const seq = Number(seqStr);
  if (!Number.isSafeInteger(seq) || seq < 0) {
    return null;
  }
  return { version: 'v1', epoch, seq };
}

/**
 * Fixed-capacity, age-bounded ring buffer with O(1) append/eviction and
 * epoch-tagged monotonic cursors (`v1:<8-hex-epoch>:<seq>`).
 *
 * Evicted cursors and mismatched boot epochs never throw; `readSince()`
 * cleanly returns `{ truncated: true, items, cursor: headOrPageCursor }`.
 */
export class BoundedRingBuffer<T> {
  private readonly maxEntries: number;
  private readonly maxAgeMs: number;
  private readonly epoch: string;
  private readonly now: () => number;
  private readonly slots: Array<RingBufferEntry<T> | undefined>;
  private headIndex = 0;
  private count = 0;
  private seq = 0;

  constructor(options: BoundedRingBufferOptions = {}) {
    this.maxEntries = clampRingBufferSize(options.maxEntries);
    this.maxAgeMs =
      options.maxAgeMs !== undefined &&
      Number.isFinite(options.maxAgeMs) &&
      options.maxAgeMs > 0
        ? options.maxAgeMs
        : DEFAULT_RING_BUFFER_MAX_AGE_MS;

    if (options.epoch !== undefined) {
      if (!/^[0-9a-f]{8}$/.test(options.epoch)) {
        throw new Error(
          `Invalid ring buffer epoch "${options.epoch}": expected 8 lowercase hex characters`,
        );
      }
      this.epoch = options.epoch;
    } else {
      this.epoch = randomBytes(4).toString('hex');
    }

    this.now = options.now ?? (() => Date.now());
    this.slots = new Array<RingBufferEntry<T> | undefined>(this.maxEntries);
  }

  get capacity(): number {
    return this.maxEntries;
  }

  get epochId(): string {
    return this.epoch;
  }

  get currentSeq(): number {
    return this.seq;
  }

  get headCursor(): string {
    return formatCursor(this.epoch, this.seq);
  }

  get size(): number {
    this.pruneExpired();
    return this.count;
  }

  /**
   * Append an item, assigning the next monotonic sequence number and cursor.
   * Evicts the oldest entry in O(1) when full.
   */
  push(item: T): RingBufferEntry<T> {
    this.pruneExpired();
    this.seq += 1;
    const entry: RingBufferEntry<T> = {
      cursor: formatCursor(this.epoch, this.seq),
      seq: this.seq,
      timestamp: this.now(),
      item,
    };

    if (this.count < this.maxEntries) {
      const writeIndex = (this.headIndex + this.count) % this.maxEntries;
      this.slots[writeIndex] = entry;
      this.count += 1;
    } else {
      // Buffer is full: overwrite oldest slot and advance headIndex
      this.slots[this.headIndex] = entry;
      this.headIndex = (this.headIndex + 1) % this.maxEntries;
    }

    return entry;
  }

  /**
   * Read retained entries after `cursor` (or bootstrap when `cursor === null`).
   *
   * - `cursor === null` returns `{ items: [], cursor: headCursor, truncated: false, hasMore: false }`.
   * - Malformed cursor syntax throws `EventsProtocolError(-32602)`.
   * - Evicted cursors or mismatched boot epochs NEVER throw; they return
   *   `truncated: true` along with retained matching items and a fresh cursor.
   */
  readSince(
    cursor: string | null,
    maxItems?: number,
    predicate?: (item: T) => boolean,
  ): RingBufferReadResult<T> {
    this.pruneExpired();

    if (cursor === null) {
      return {
        items: [],
        cursor: this.headCursor,
        truncated: false,
        hasMore: false,
      };
    }

    const parsed = parseCursor(cursor);
    if (!parsed) {
      throw new EventsProtocolError(
        EventsErrorCode.InvalidParams,
        `Invalid cursor format "${cursor}": expected v1:<8-hex-epoch>:<seq>`,
        { cursor },
      );
    }

    const limit =
      maxItems !== undefined && Number.isFinite(maxItems) && maxItems > 0
        ? Math.trunc(maxItems)
        : Number.POSITIVE_INFINITY;

    const epochMismatch = parsed.epoch !== this.epoch;
    const futureSeq = !epochMismatch && parsed.seq > this.seq;

    if (!epochMismatch && parsed.seq === this.seq) {
      return {
        items: [],
        cursor: this.headCursor,
        truncated: false,
        hasMore: false,
      };
    }

    if (this.count === 0) {
      return {
        items: [],
        cursor: this.headCursor,
        truncated: epochMismatch || futureSeq || parsed.seq < this.seq,
        hasMore: false,
      };
    }

    const oldestEntry = this.slots[this.headIndex];
    const oldestSeq = oldestEntry ? oldestEntry.seq : this.seq + 1;
    const truncated = epochMismatch || futureSeq || oldestSeq > parsed.seq + 1;

    const minSeqExclusive = epochMismatch || futureSeq ? 0 : parsed.seq;
    const matched: RingBufferEntry<T>[] = [];
    let hasMore = false;

    for (let i = 0; i < this.count; i += 1) {
      const entry = this.slots[(this.headIndex + i) % this.maxEntries];
      if (!entry || entry.seq <= minSeqExclusive) {
        continue;
      }
      if (predicate && !predicate(entry.item)) {
        continue;
      }
      if (matched.length < limit) {
        matched.push(entry);
      } else {
        hasMore = true;
        break;
      }
    }

    const nextCursor =
      hasMore && matched.length > 0
        ? matched[matched.length - 1].cursor
        : this.headCursor;

    return {
      items: matched,
      cursor: nextCursor,
      truncated,
      hasMore,
    };
  }

  /**
   * Read all currently retained entries matching an optional predicate (oldest first),
   * capped to the newest `maxItems` when specified.
   */
  snapshot(
    maxItems?: number,
    predicate?: (item: T) => boolean,
  ): RingBufferReadResult<T> {
    this.pruneExpired();

    const matched: RingBufferEntry<T>[] = [];
    for (let i = 0; i < this.count; i += 1) {
      const entry = this.slots[(this.headIndex + i) % this.maxEntries];
      if (!entry) {
        continue;
      }
      if (predicate && !predicate(entry.item)) {
        continue;
      }
      matched.push(entry);
    }

    const limit =
      maxItems !== undefined && Number.isFinite(maxItems) && maxItems > 0
        ? Math.trunc(maxItems)
        : matched.length;

    const truncated = matched.length > limit;
    const items = truncated ? matched.slice(matched.length - limit) : matched;

    return {
      items,
      cursor: this.headCursor,
      truncated,
      hasMore: false,
    };
  }

  clear(): void {
    this.slots.fill(undefined);
    this.headIndex = 0;
    this.count = 0;
  }

  private pruneExpired(): void {
    if (this.count === 0) {
      return;
    }
    const cutoff = this.now() - this.maxAgeMs;
    while (this.count > 0) {
      const oldest = this.slots[this.headIndex];
      if (!oldest || oldest.timestamp < cutoff) {
        this.slots[this.headIndex] = undefined;
        this.headIndex = (this.headIndex + 1) % this.maxEntries;
        this.count -= 1;
      } else {
        break;
      }
    }
  }
}
