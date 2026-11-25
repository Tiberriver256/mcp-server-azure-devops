export {
  EventsErrorCode,
  EventsProtocolError,
  isEventsProtocolError,
} from './errors.ts';

export {
  BoundedRingBuffer,
  CURSOR_PATTERN,
  DEFAULT_RING_BUFFER_MAX_AGE_MS,
  DEFAULT_RING_BUFFER_SIZE,
  MAX_RING_BUFFER_SIZE,
  MIN_RING_BUFFER_SIZE,
  clampRingBufferSize,
  formatCursor,
  parseCursor,
} from './ring-buffer.ts';
export type {
  BoundedRingBufferOptions,
  ParsedCursor,
  RingBufferEntry,
  RingBufferReadResult,
} from './ring-buffer.ts';

export {
  CANONICAL_EVENT_NAMES,
  MAX_EVENT_TEXT_LENGTH,
  isCanonicalEventName,
  listCanonicalEventDescriptors,
  matchesEventFilter,
  sanitizeEventOccurrence,
  truncateEventText,
  validateEventFilterArguments,
} from './catalog.ts';
export type {
  CanonicalEventName,
  EventDeliveryMode,
  EventDescriptor,
  EventOccurrence,
} from './catalog.ts';

export {
  ADO_EVENT_RESOURCE_TEMPLATES,
  canonicalizeEventResourceUri,
  isEventResourceUri,
  matchesEventResourceUri,
  parseEventResourceUri,
} from './event-uri.ts';
export type {
  AdoEventResourceTemplate,
  ParsedEventResourceUri,
} from './event-uri.ts';

export {
  MAX_WEBHOOK_BODY_BYTES,
  normalizeAdoWebhookPayload,
  verifyWebhookAuth,
} from './webhook-normalizer.ts';
export type { NormalizedWebhookResult } from './webhook-normalizer.ts';

export {
  DEFAULT_POLL_INTERVAL_MS,
  MIN_POLL_INTERVAL_MS,
  ResourcePollingWatcher,
  clampPollIntervalMs,
  clearPollingApiVersionCache,
} from './polling-watcher.ts';
export type {
  PollingWatcherOptions,
  WatchableEventResourceUri,
} from './polling-watcher.ts';

export {
  DEFAULT_HEARTBEAT_MS,
  DEFAULT_MAX_ACTIVE_STREAMS_PER_SESSION,
  DEFAULT_MAX_GLOBAL_STREAMS,
  DEFAULT_MAX_GLOBAL_WATCHERS,
  DEFAULT_MAX_POLL_EVENTS,
  DEFAULT_MAX_SUBSCRIPTIONS_PER_SESSION,
  DEFAULT_NEXT_POLL_MS,
  EventEngine,
  MAX_HEARTBEAT_MS,
  MAX_POLL_EVENTS,
  MIN_HEARTBEAT_MS,
  SUBSCRIPTION_ID_META_KEY,
} from './event-engine.ts';
export type {
  EventEngineOptions,
  EventEngineStats,
  EventResourceFeed,
  ListEventsResult,
  PollEventsResult,
  ResourceUpdateNotifier,
  StreamNotificationMessage,
  StreamNotificationSender,
  WebhookIngestResult,
} from './event-engine.ts';
