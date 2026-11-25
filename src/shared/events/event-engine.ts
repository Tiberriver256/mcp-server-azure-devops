import type { ToolContext } from '../session/azure-devops-session.ts';
import {
  isCanonicalEventName,
  listCanonicalEventDescriptors,
  matchesEventFilter,
  sanitizeEventOccurrence,
  validateEventFilterArguments,
} from './catalog.ts';
import type {
  CanonicalEventName,
  EventDescriptor,
  EventOccurrence,
} from './catalog.ts';
import { EventsErrorCode, EventsProtocolError } from './errors.ts';
import {
  canonicalizeEventResourceUri,
  matchesEventResourceUri,
  parseEventResourceUri,
} from './event-uri.ts';
import type { ParsedEventResourceUri } from './event-uri.ts';
import {
  clampPollIntervalMs,
  ResourcePollingWatcher,
} from './polling-watcher.ts';
import {
  BoundedRingBuffer,
  DEFAULT_RING_BUFFER_MAX_AGE_MS,
  parseCursor,
} from './ring-buffer.ts';
import type { RingBufferEntry } from './ring-buffer.ts';
import { normalizeAdoWebhookPayload } from './webhook-normalizer.ts';

export const DEFAULT_NEXT_POLL_MS = 15_000;
export const DEFAULT_MAX_POLL_EVENTS = 50;
export const MAX_POLL_EVENTS = 200;
export const DEFAULT_HEARTBEAT_MS = 30_000;
export const MIN_HEARTBEAT_MS = 5_000;
export const MAX_HEARTBEAT_MS = 60_000;
export const DEFAULT_MAX_SUBSCRIPTIONS_PER_SESSION = 20;
export const DEFAULT_MAX_GLOBAL_WATCHERS = 100;
export const DEFAULT_MAX_ACTIVE_STREAMS_PER_SESSION = 20;
export const DEFAULT_MAX_GLOBAL_STREAMS = 100;
export const SUBSCRIPTION_ID_META_KEY =
  'io.modelcontextprotocol/subscriptionId';

export interface EventEngineOptions {
  readonly bufferSize?: number;
  readonly maxAgeMs?: number;
  readonly pollIntervalMs?: number;
  readonly maxSubscriptionsPerSession?: number;
  readonly maxGlobalWatchers?: number;
  readonly maxActiveStreamsPerSession?: number;
  readonly maxGlobalStreams?: number;
  readonly epoch?: string;
  readonly now?: () => number;
  readonly scheduleTimeout?: (
    fn: () => void,
    ms: number,
  ) => ReturnType<typeof setTimeout>;
  readonly clearScheduledTimeout?: (id: ReturnType<typeof setTimeout>) => void;
}

export interface ListEventsResult {
  readonly resultType: 'complete';
  readonly events: readonly EventDescriptor[];
}

export interface PollEventsResult {
  readonly resultType: 'complete';
  readonly events: readonly EventOccurrence[];
  readonly cursor: string;
  readonly truncated: boolean;
  readonly hasMore: boolean;
  readonly nextPollMs: number;
}

export interface EventResourceFeed {
  readonly cursor: string;
  readonly truncated: boolean;
  readonly events: readonly EventOccurrence[];
}

export type WebhookIngestResult =
  | { readonly kind: 'event'; readonly entry: RingBufferEntry<EventOccurrence> }
  | { readonly kind: 'test'; readonly eventType?: string }
  | {
      readonly kind: 'ignored';
      readonly reason: string;
      readonly eventType?: string;
    };

export interface StreamNotificationMessage {
  readonly method:
    | 'notifications/events/active'
    | 'notifications/events/event'
    | 'notifications/events/heartbeat';
  readonly params: Record<string, unknown>;
}

export type StreamNotificationSender = (
  notification: StreamNotificationMessage,
) => void | Promise<void>;

export type ResourceUpdateNotifier = (uri: string) => void | Promise<void>;

export interface EventEngineStats {
  readonly bufferSize: number;
  readonly bufferCapacity: number;
  readonly activeWatchers: number;
  readonly activeStreams: number;
  readonly activeSubscriptions: number;
}

interface ResourceSubscriptionRecord {
  readonly sessionId: string;
  readonly uri: string;
  readonly canonicalKey: string;
  readonly parsed: ParsedEventResourceUri;
  onNotify: ResourceUpdateNotifier;
}

interface ActiveStreamRecord {
  readonly sessionId?: string;
  readonly eventName: CanonicalEventName;
  readonly filterArgs: Record<string, unknown>;
  readonly sendNotification: StreamNotificationSender;
  readonly meta?: Record<string, unknown>;
  lastCursor: string;
  lastDeliveredSeq: number;
  replaying: boolean;
  readonly pendingQueue: RingBufferEntry<EventOccurrence>[];
  close: () => void;
}

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  if (
    typeof timer === 'object' &&
    timer !== null &&
    'unref' in timer &&
    typeof timer.unref === 'function'
  ) {
    timer.unref();
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Core in-memory MCP Events Engine backing:
 * 1. SEP-3415 `events/list`, `events/poll`, `events/stream`
 * 2. MCP 2025-11-25 `resources/subscribe`, `resources/unsubscribe`, `resources/read`
 * 3. Azure DevOps Service Hook ingestion (`ingestWebhook`) & Bounded Polling Watchers
 * 4. Opt-in `events` read-only toolset (`list_event_types`, `poll_events`)
 */
export class EventEngine {
  private readonly ringBuffer: BoundedRingBuffer<EventOccurrence>;
  private readonly pollIntervalMs: number;
  private readonly maxSubscriptionsPerSession: number;
  private readonly maxGlobalWatchers: number;
  private readonly maxActiveStreamsPerSession: number;
  private readonly maxGlobalStreams: number;
  private readonly now: () => number;
  private readonly scheduleTimeout: (
    fn: () => void,
    ms: number,
  ) => ReturnType<typeof setTimeout>;
  private readonly clearScheduledTimeout: (
    id: ReturnType<typeof setTimeout>,
  ) => void;

  // sessionId -> Map<canonicalKey, ResourceSubscriptionRecord>
  private readonly sessionSubscriptions = new Map<
    string,
    Map<string, ResourceSubscriptionRecord>
  >();
  // `${sessionId}::${canonicalKey}` -> ResourcePollingWatcher (strictly isolated per session)
  private readonly watchers = new Map<string, ResourcePollingWatcher>();
  private readonly activeStreams = new Set<ActiveStreamRecord>();
  // sessionId -> Set<ActiveStreamRecord>
  private readonly sessionStreams = new Map<string, Set<ActiveStreamRecord>>();
  private backoffUntilMs = 0;
  private backoffPollMs = DEFAULT_NEXT_POLL_MS;
  private closed = false;

  constructor(options: EventEngineOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.ringBuffer = new BoundedRingBuffer<EventOccurrence>({
      maxEntries: options.bufferSize,
      maxAgeMs: options.maxAgeMs ?? DEFAULT_RING_BUFFER_MAX_AGE_MS,
      epoch: options.epoch,
      now: this.now,
    });
    this.pollIntervalMs = clampPollIntervalMs(options.pollIntervalMs);
    this.maxSubscriptionsPerSession =
      options.maxSubscriptionsPerSession !== undefined &&
      Number.isInteger(options.maxSubscriptionsPerSession) &&
      options.maxSubscriptionsPerSession >= 1
        ? options.maxSubscriptionsPerSession
        : DEFAULT_MAX_SUBSCRIPTIONS_PER_SESSION;
    this.maxGlobalWatchers =
      options.maxGlobalWatchers !== undefined &&
      Number.isInteger(options.maxGlobalWatchers) &&
      options.maxGlobalWatchers >= 1
        ? options.maxGlobalWatchers
        : DEFAULT_MAX_GLOBAL_WATCHERS;
    this.maxActiveStreamsPerSession =
      options.maxActiveStreamsPerSession !== undefined &&
      Number.isInteger(options.maxActiveStreamsPerSession) &&
      options.maxActiveStreamsPerSession >= 1
        ? options.maxActiveStreamsPerSession
        : DEFAULT_MAX_ACTIVE_STREAMS_PER_SESSION;
    this.maxGlobalStreams =
      options.maxGlobalStreams !== undefined &&
      Number.isInteger(options.maxGlobalStreams) &&
      options.maxGlobalStreams >= 1
        ? options.maxGlobalStreams
        : DEFAULT_MAX_GLOBAL_STREAMS;
    this.scheduleTimeout =
      options.scheduleTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearScheduledTimeout =
      options.clearScheduledTimeout ?? ((id) => clearTimeout(id));
  }

  get headCursor(): string {
    return this.ringBuffer.headCursor;
  }

  get configuredPollIntervalMs(): number {
    return this.pollIntervalMs;
  }

  get bufferCapacity(): number {
    return this.ringBuffer.capacity;
  }

  getStats(): EventEngineStats {
    let activeSubscriptions = 0;
    for (const subs of this.sessionSubscriptions.values()) {
      activeSubscriptions += subs.size;
    }
    return {
      bufferSize: this.ringBuffer.size,
      bufferCapacity: this.ringBuffer.capacity,
      activeWatchers: this.watchers.size,
      activeStreams: this.activeStreams.size,
      activeSubscriptions,
    };
  }

  /**
   * SEP-3415 `events/list` — return all 5 canonical Azure DevOps event descriptors.
   */
  listEvents(): ListEventsResult {
    return {
      resultType: 'complete',
      events: listCanonicalEventDescriptors(),
    };
  }

  /**
   * SEP-3415 `events/poll` — cursor bootstrap (`cursor: null`) and incremental polling.
   */
  pollEvents(rawParams: unknown): PollEventsResult {
    if (!isPlainObject(rawParams)) {
      throw new EventsProtocolError(
        EventsErrorCode.InvalidParams,
        'events/poll params must be a JSON object',
      );
    }

    const name = rawParams.name;
    if (typeof name !== 'string' || name.length === 0) {
      throw new EventsProtocolError(
        EventsErrorCode.InvalidParams,
        'events/poll requires a non-empty string "name"',
      );
    }

    const filterArgs = validateEventFilterArguments(name, rawParams.arguments);

    let maxEvents = DEFAULT_MAX_POLL_EVENTS;
    if (rawParams.maxEvents !== undefined) {
      if (
        typeof rawParams.maxEvents !== 'number' ||
        !Number.isInteger(rawParams.maxEvents) ||
        rawParams.maxEvents < 1
      ) {
        throw new EventsProtocolError(
          EventsErrorCode.InvalidParams,
          'maxEvents must be a positive integer',
          { maxEvents: rawParams.maxEvents },
        );
      }
      maxEvents = Math.min(rawParams.maxEvents, MAX_POLL_EVENTS);
    }

    const rawCursor = rawParams.cursor;
    let cursor: string | null;
    if (rawCursor === null || rawCursor === undefined) {
      cursor = null;
    } else if (typeof rawCursor === 'string') {
      if (!parseCursor(rawCursor)) {
        throw new EventsProtocolError(
          EventsErrorCode.InvalidParams,
          `Invalid cursor "${rawCursor}": expected v1:<8-hex-epoch>:<seq>`,
          { cursor: rawCursor },
        );
      }
      cursor = rawCursor;
    } else {
      throw new EventsProtocolError(
        EventsErrorCode.InvalidParams,
        'cursor must be a string or null',
      );
    }

    const read = this.ringBuffer.readSince(
      cursor,
      maxEvents,
      (occurrence) =>
        occurrence.name === name && matchesEventFilter(occurrence, filterArgs),
    );

    return {
      resultType: 'complete',
      events: read.items.map((entry) => entry.item),
      cursor: read.cursor,
      truncated: read.truncated,
      hasMore: read.hasMore,
      nextPollMs: this.getNextPollMs(),
    };
  }

  /**
   * Append a normalized occurrence to the ring buffer and fan out to matching
   * live `events/stream` listeners and `resources/subscribe` URIs.
   */
  publish(occurrence: EventOccurrence): RingBufferEntry<EventOccurrence> {
    const sanitized = sanitizeEventOccurrence(occurrence);
    const entry = this.ringBuffer.push(sanitized);

    // 1. Fan out to matching live SEP-3415 streams
    for (const stream of this.activeStreams) {
      if (
        stream.eventName === sanitized.name &&
        matchesEventFilter(sanitized, stream.filterArgs)
      ) {
        if (stream.replaying) {
          stream.pendingQueue.push(entry);
        } else if (entry.seq > stream.lastDeliveredSeq) {
          stream.lastDeliveredSeq = entry.seq;
          stream.lastCursor = entry.cursor;
          this.safeNotifyStream(stream, {
            method: 'notifications/events/event',
            params: {
              ...sanitized,
              cursor: entry.cursor,
              ...(stream.meta ? { _meta: stream.meta } : {}),
            },
          });
        }
      }
    }

    // 2. Fan out to matching resource subscriptions
    for (const subs of this.sessionSubscriptions.values()) {
      for (const record of subs.values()) {
        if (matchesEventResourceUri(record.parsed, sanitized)) {
          this.safeNotifyResource(record);
        }
      }
    }

    return entry;
  }

  /**
   * Normalize and ingest an Azure DevOps Service Hook payload.
   * ADO Test events return `{ kind: 'test' }` without writing to the ring buffer.
   */
  ingestWebhook(payload: unknown): WebhookIngestResult {
    const normalized = normalizeAdoWebhookPayload(payload);
    if (normalized.kind === 'test') {
      return normalized;
    }
    if (normalized.kind === 'ignored') {
      return normalized;
    }
    const entry = this.publish(normalized.occurrence);
    return { kind: 'event', entry };
  }

  /**
   * Subscribe an MCP session to an `ado://{org}/{project}/events/...` resource URI.
   *
   * - Enforces per-session quota (`20`) and global watcher cap (`100`),
   *   throwing `EventsProtocolError(-32025)` (`ResourceExhausted`) when exceeded.
   * - Starts a strictly per-session bounded polling watcher (keyed by
   *   `${sessionId}::${canonicalKey}`) for PR, pipeline, and work item URIs so
   *   credentials/PATs are never shared across sessions.
   * - Idempotent for duplicate subscriptions to the same URI in the same session.
   */
  async subscribeResource(
    sessionId: string,
    uri: string,
    ctx: ToolContext,
    onNotify: ResourceUpdateNotifier,
  ): Promise<void> {
    if (this.closed) {
      throw new EventsProtocolError(
        EventsErrorCode.Internal,
        'EventEngine is closed',
      );
    }

    const parsed = parseEventResourceUri(uri);
    if (!parsed) {
      throw new EventsProtocolError(
        EventsErrorCode.InvalidParams,
        `Unsupported event resource URI "${uri}"`,
        { uri },
      );
    }

    const canonicalKey = canonicalizeEventResourceUri(parsed);
    const existingSessionSubs = this.sessionSubscriptions.get(sessionId);
    const existingSub = existingSessionSubs?.get(canonicalKey);
    if (existingSub) {
      existingSub.onNotify = onNotify;
      return;
    }

    const currentSessionSubCount = existingSessionSubs?.size ?? 0;
    if (currentSessionSubCount >= this.maxSubscriptionsPerSession) {
      throw new EventsProtocolError(
        EventsErrorCode.ResourceExhausted,
        `Subscription quota exceeded: session may subscribe to at most ${this.maxSubscriptionsPerSession} event resources`,
        {
          limit: this.maxSubscriptionsPerSession,
          current: currentSessionSubCount,
        },
      );
    }

    const needsWatcher = parsed.kind !== 'feed';
    const watcherKey = `${sessionId}::${canonicalKey}`;

    if (needsWatcher && this.watchers.size >= this.maxGlobalWatchers) {
      throw new EventsProtocolError(
        EventsErrorCode.ResourceExhausted,
        `Global watcher limit exceeded: server supports at most ${this.maxGlobalWatchers} active polling watchers`,
        {
          limit: this.maxGlobalWatchers,
          current: this.watchers.size,
        },
      );
    }

    let sessionSubs = existingSessionSubs;
    if (!sessionSubs) {
      sessionSubs = new Map<string, ResourceSubscriptionRecord>();
      this.sessionSubscriptions.set(sessionId, sessionSubs);
    }

    sessionSubs.set(canonicalKey, {
      sessionId,
      uri,
      canonicalKey,
      parsed,
      onNotify,
    });

    if (needsWatcher) {
      const watcher = new ResourcePollingWatcher({
        parsedUri: parsed,
        ctx,
        pollIntervalMs: this.pollIntervalMs,
        onEvent: (occurrence) => {
          this.publish(occurrence);
        },
        onRateLimit: (retryAfterMs) => {
          this.recordRateLimitBackoff(retryAfterMs);
        },
        now: this.now,
        scheduleTimeout: this.scheduleTimeout,
        clearScheduledTimeout: this.clearScheduledTimeout,
      });
      this.watchers.set(watcherKey, watcher);
      await watcher.start();
    }
  }

  /**
   * Unsubscribe a session from an event resource URI, freeing its quota slot
   * and immediately stopping that session's polling watcher.
   */
  unsubscribeResource(sessionId: string, uri: string): boolean {
    const parsed = parseEventResourceUri(uri);
    if (!parsed) {
      return false;
    }
    const canonicalKey = canonicalizeEventResourceUri(parsed);
    const sessionSubs = this.sessionSubscriptions.get(sessionId);
    if (!sessionSubs || !sessionSubs.delete(canonicalKey)) {
      return false;
    }
    if (sessionSubs.size === 0) {
      this.sessionSubscriptions.delete(sessionId);
    }

    this.releaseWatcher(`${sessionId}::${canonicalKey}`);
    return true;
  }

  /**
   * Tear down all resource subscriptions, per-session polling watchers, and
   * active `events/stream` listeners owned by `sessionId`.
   */
  cleanupSession(sessionId: string): void {
    const sessionSubs = this.sessionSubscriptions.get(sessionId);
    if (sessionSubs) {
      const keys = Array.from(sessionSubs.keys());
      this.sessionSubscriptions.delete(sessionId);
      for (const key of keys) {
        this.releaseWatcher(`${sessionId}::${key}`);
      }
    }

    const streams = this.sessionStreams.get(sessionId);
    if (streams) {
      for (const stream of Array.from(streams)) {
        stream.close();
      }
      this.sessionStreams.delete(sessionId);
    }
  }

  /**
   * Read the retained event feed for an `ado://{org}/{project}/events/...` URI.
   * Returns raw structured JSON `{ cursor, truncated, events }` (un-spotlighted).
   */
  readEventResource(
    uri: string,
    options: {
      readonly cursor?: string | null;
      readonly maxEvents?: number;
    } = {},
  ): EventResourceFeed {
    const parsed = parseEventResourceUri(uri);
    if (!parsed) {
      throw new EventsProtocolError(
        EventsErrorCode.NotFound,
        `Unknown event resource URI "${uri}"`,
        { uri },
      );
    }

    const maxEvents =
      options.maxEvents !== undefined &&
      Number.isInteger(options.maxEvents) &&
      options.maxEvents > 0
        ? Math.min(options.maxEvents, MAX_POLL_EVENTS)
        : MAX_POLL_EVENTS;

    const predicate = (occurrence: EventOccurrence) =>
      matchesEventResourceUri(parsed, occurrence);

    const read =
      options.cursor !== undefined && options.cursor !== null
        ? this.ringBuffer.readSince(options.cursor, maxEvents, predicate)
        : this.ringBuffer.snapshot(maxEvents, predicate);

    return {
      cursor: read.cursor,
      truncated: read.truncated,
      events: read.items.map((entry) => entry.item),
    };
  }

  /**
   * SEP-3415 `events/stream` — long-lived push stream.
   *
   * 1. Validates event name (`-32023`), filter args (`-32602`), cursor (`-32602`),
   *    clamps `heartbeatMs` to `[5_000, 60_000]` (default `30_000`), and enforces
   *    per-session (`20`) and global (`100`) stream caps (`-32025`).
   * 2. Registers the live listener BEFORE awaiting `notifications/events/active`
   *    and replay notifications, queueing concurrent live events and flushing
   *    them in strict cursor/seq order with zero drops or duplicates.
   * 3. Forwards live matching occurrences as flat `notifications/events/event`.
   * 4. Sends periodic `notifications/events/heartbeat` notifications.
   * 5. Tears down timers and listeners cleanly on `signal` abort, `cleanupSession`,
   *    or `close()`.
   */
  async openStream(
    rawParams: unknown,
    sendNotification: StreamNotificationSender,
    signal: AbortSignal,
    subscriptionId?: string | number,
    sessionId?: string,
  ): Promise<void> {
    if (!isPlainObject(rawParams)) {
      throw new EventsProtocolError(
        EventsErrorCode.InvalidParams,
        'events/stream params must be a JSON object',
      );
    }

    const name = rawParams.name;
    if (typeof name !== 'string' || name.length === 0) {
      throw new EventsProtocolError(
        EventsErrorCode.InvalidParams,
        'events/stream requires a non-empty string "name"',
      );
    }

    if (!isCanonicalEventName(name)) {
      throw new EventsProtocolError(
        EventsErrorCode.NotFound,
        `Unknown event type "${name}"`,
        { name },
      );
    }

    const filterArgs = validateEventFilterArguments(name, rawParams.arguments);
    const eventName: CanonicalEventName = name;

    let grantedHeartbeatMs = DEFAULT_HEARTBEAT_MS;
    if (rawParams.heartbeatMs !== undefined) {
      if (
        typeof rawParams.heartbeatMs !== 'number' ||
        !Number.isFinite(rawParams.heartbeatMs) ||
        rawParams.heartbeatMs <= 0
      ) {
        throw new EventsProtocolError(
          EventsErrorCode.InvalidParams,
          'heartbeatMs must be a positive number',
          { heartbeatMs: rawParams.heartbeatMs },
        );
      }
      grantedHeartbeatMs = Math.min(
        MAX_HEARTBEAT_MS,
        Math.max(MIN_HEARTBEAT_MS, Math.trunc(rawParams.heartbeatMs)),
      );
    }

    const rawCursor = rawParams.cursor;
    let initialCursor = this.ringBuffer.headCursor;
    let truncated = false;
    let replayEntries: readonly RingBufferEntry<EventOccurrence>[] = [];
    let initialDeliveredSeq = this.ringBuffer.currentSeq;

    if (rawCursor !== null && rawCursor !== undefined) {
      if (typeof rawCursor !== 'string' || !parseCursor(rawCursor)) {
        throw new EventsProtocolError(
          EventsErrorCode.InvalidParams,
          `Invalid cursor "${String(rawCursor)}": expected v1:<8-hex-epoch>:<seq>`,
          { cursor: rawCursor },
        );
      }
      const read = this.ringBuffer.readSince(
        rawCursor,
        MAX_POLL_EVENTS,
        (occurrence) =>
          occurrence.name === eventName &&
          matchesEventFilter(occurrence, filterArgs),
      );
      initialCursor = read.cursor;
      truncated = read.truncated;
      replayEntries = read.items;
      initialDeliveredSeq = 0;
    }

    if (signal.aborted || this.closed) {
      return;
    }

    if (sessionId !== undefined) {
      const currentSessionStreams =
        this.sessionStreams.get(sessionId)?.size ?? 0;
      if (currentSessionStreams >= this.maxActiveStreamsPerSession) {
        throw new EventsProtocolError(
          EventsErrorCode.ResourceExhausted,
          `Stream quota exceeded: session may open at most ${this.maxActiveStreamsPerSession} concurrent event streams`,
          {
            limit: this.maxActiveStreamsPerSession,
            current: currentSessionStreams,
          },
        );
      }
    }

    if (this.activeStreams.size >= this.maxGlobalStreams) {
      throw new EventsProtocolError(
        EventsErrorCode.ResourceExhausted,
        `Global stream limit exceeded: server supports at most ${this.maxGlobalStreams} concurrent event streams`,
        {
          limit: this.maxGlobalStreams,
          current: this.activeStreams.size,
        },
      );
    }

    const meta =
      subscriptionId !== undefined
        ? { [SUBSCRIPTION_ID_META_KEY]: subscriptionId }
        : undefined;

    await new Promise<void>((resolve, reject) => {
      let cleanedUp = false;
      let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

      const scheduleHeartbeat = (): void => {
        if (cleanedUp) {
          return;
        }
        const id = this.scheduleTimeout(() => {
          heartbeatTimer = null;
          if (cleanedUp) {
            return;
          }
          record.lastCursor = this.ringBuffer.headCursor;
          this.safeNotifyStream(record, {
            method: 'notifications/events/heartbeat',
            params: {
              cursor: record.lastCursor,
              ...(meta ? { _meta: meta } : {}),
            },
          });
          scheduleHeartbeat();
        }, grantedHeartbeatMs);
        unrefTimer(id);
        heartbeatTimer = id;
      };

      const cleanup = (error?: unknown): void => {
        if (cleanedUp) {
          return;
        }
        cleanedUp = true;
        if (heartbeatTimer !== null) {
          this.clearScheduledTimeout(heartbeatTimer);
          heartbeatTimer = null;
        }
        signal.removeEventListener('abort', onAbort);
        this.activeStreams.delete(record);
        if (sessionId !== undefined) {
          const streamsForSession = this.sessionStreams.get(sessionId);
          if (streamsForSession) {
            streamsForSession.delete(record);
            if (streamsForSession.size === 0) {
              this.sessionStreams.delete(sessionId);
            }
          }
        }
        record.pendingQueue.length = 0;
        if (error !== undefined) {
          reject(error instanceof Error ? error : new Error(String(error)));
        } else {
          resolve();
        }
      };

      const onAbort = (): void => {
        cleanup();
      };

      const record: ActiveStreamRecord = {
        sessionId,
        eventName,
        filterArgs,
        sendNotification,
        meta,
        lastCursor: initialCursor,
        lastDeliveredSeq: initialDeliveredSeq,
        replaying: true,
        pendingQueue: [],
        close: () => {
          cleanup();
        },
      };

      // Register listener BEFORE awaiting active/replay notifications so live
      // events published during replay are queued and flushed with zero drops.
      this.activeStreams.add(record);
      if (sessionId !== undefined) {
        let streamsForSession = this.sessionStreams.get(sessionId);
        if (!streamsForSession) {
          streamsForSession = new Set<ActiveStreamRecord>();
          this.sessionStreams.set(sessionId, streamsForSession);
        }
        streamsForSession.add(record);
      }
      signal.addEventListener('abort', onAbort, { once: true });

      const runStartup = async (): Promise<void> => {
        try {
          await sendNotification({
            method: 'notifications/events/active',
            params: {
              cursor: initialCursor,
              truncated,
              heartbeatMs: grantedHeartbeatMs,
              ...(meta ? { _meta: meta } : {}),
            },
          });

          if (cleanedUp || signal.aborted || this.closed) {
            cleanup();
            return;
          }

          for (const entry of replayEntries) {
            if (cleanedUp || signal.aborted || this.closed) {
              cleanup();
              return;
            }
            if (entry.seq <= record.lastDeliveredSeq) {
              continue;
            }
            record.lastDeliveredSeq = entry.seq;
            record.lastCursor = entry.cursor;
            await sendNotification({
              method: 'notifications/events/event',
              params: {
                ...entry.item,
                cursor: entry.cursor,
                ...(meta ? { _meta: meta } : {}),
              },
            });
          }

          // Flush any live events queued during active/replay notifications in strict seq order.
          while (record.pendingQueue.length > 0) {
            const batch = record.pendingQueue.splice(0);
            batch.sort((a, b) => a.seq - b.seq);
            for (const entry of batch) {
              if (cleanedUp || signal.aborted || this.closed) {
                cleanup();
                return;
              }
              if (entry.seq <= record.lastDeliveredSeq) {
                continue;
              }
              record.lastDeliveredSeq = entry.seq;
              record.lastCursor = entry.cursor;
              await sendNotification({
                method: 'notifications/events/event',
                params: {
                  ...entry.item,
                  cursor: entry.cursor,
                  ...(meta ? { _meta: meta } : {}),
                },
              });
            }
          }

          if (cleanedUp || signal.aborted || this.closed) {
            cleanup();
            return;
          }

          record.replaying = false;
          scheduleHeartbeat();
        } catch (err) {
          cleanup(err);
        }
      };

      void runStartup();
    });
  }

  /**
   * Create the canonical SEP-3415 `-32026` Unsupported error for deferred
   * outbound webhook delivery methods (`events/subscribe`, `events/unsubscribe`).
   */
  createUnsupportedError(
    method: 'events/subscribe' | 'events/unsubscribe',
  ): EventsProtocolError {
    return new EventsProtocolError(
      EventsErrorCode.Unsupported,
      `${method} is not supported: outbound webhook delivery is disabled`,
      { feature: 'deliveryMode', value: 'webhook' },
    );
  }

  /**
   * Gracefully shut down all polling watchers, heartbeat timers, and active streams.
   */
  close(): void {
    this.closed = true;

    for (const watcher of this.watchers.values()) {
      watcher.stop();
    }
    this.watchers.clear();
    this.sessionSubscriptions.clear();

    for (const stream of Array.from(this.activeStreams)) {
      stream.close();
    }
    this.activeStreams.clear();
    this.sessionStreams.clear();
  }

  private getNextPollMs(): number {
    if (this.now() < this.backoffUntilMs) {
      return Math.max(DEFAULT_NEXT_POLL_MS, this.backoffPollMs);
    }
    return DEFAULT_NEXT_POLL_MS;
  }

  private recordRateLimitBackoff(retryAfterMs: number): void {
    this.backoffPollMs = Math.max(DEFAULT_NEXT_POLL_MS, retryAfterMs);
    this.backoffUntilMs = this.now() + this.backoffPollMs;
  }

  private releaseWatcher(watcherKey: string): void {
    const watcher = this.watchers.get(watcherKey);
    if (!watcher) {
      return;
    }
    watcher.stop();
    this.watchers.delete(watcherKey);
  }

  private safeNotifyStream(
    stream: ActiveStreamRecord,
    notification: StreamNotificationMessage,
  ): void {
    try {
      const maybePromise = stream.sendNotification(notification);
      if (maybePromise && typeof maybePromise.catch === 'function') {
        void maybePromise.catch(() => {
          stream.close();
        });
      }
    } catch {
      stream.close();
    }
  }

  private safeNotifyResource(record: ResourceSubscriptionRecord): void {
    try {
      const maybePromise = record.onNotify(record.uri);
      if (maybePromise && typeof maybePromise.catch === 'function') {
        void maybePromise.catch(() => {
          // Swallow individual transport errors so fanout continues for other subscribers
        });
      }
    } catch {
      // Swallow synchronous callback errors
    }
  }
}
