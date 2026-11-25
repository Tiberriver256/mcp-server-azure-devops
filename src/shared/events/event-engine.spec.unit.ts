import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import { AzureDevOpsRateLimitError } from '../errors/index.ts';
import { resolveAzureDevOpsBaseUrls } from '../azure-devops-url.ts';
import type { ToolContext } from '../session/azure-devops-session.ts';
import { CANONICAL_EVENT_NAMES } from './catalog.ts';
import { EventsErrorCode, isEventsProtocolError } from './errors.ts';
import {
  DEFAULT_NEXT_POLL_MS,
  EventEngine,
  MAX_HEARTBEAT_MS,
  MIN_HEARTBEAT_MS,
  SUBSCRIPTION_ID_META_KEY,
} from './event-engine.ts';
import type { StreamNotificationMessage } from './event-engine.ts';
import { clearPollingApiVersionCache } from './polling-watcher.ts';
import { CURSOR_PATTERN, parseCursor } from './ring-buffer.ts';

interface FakeTimerScheduler {
  readonly pendingCount: () => number;
  readonly lastDelayMs: () => number | undefined;
  readonly schedule: (
    fn: () => void,
    ms: number,
  ) => ReturnType<typeof setTimeout>;
  readonly clear: (id: ReturnType<typeof setTimeout>) => void;
  readonly fireAll: () => void;
}

function createFakeScheduler(): FakeTimerScheduler {
  let nextId = 1;
  let lastDelay: number | undefined;
  const timers = new Map<number, () => void>();

  return {
    pendingCount: () => timers.size,
    lastDelayMs: () => lastDelay,
    schedule: (fn, ms) => {
      const id = nextId++;
      lastDelay = ms;
      timers.set(id, fn);
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clear: (id) => {
      timers.delete(id as unknown as number);
    },
    fireAll: () => {
      const entries = Array.from(timers.entries());
      timers.clear();
      for (const [, fn] of entries) {
        fn();
      }
    },
  };
}

interface MockRequestInfo {
  readonly method?: string;
  readonly url: string;
  readonly query?: Record<string, string | number | boolean | undefined>;
}

function createMockToolContext(
  responder: (url: string, req: MockRequestInfo) => Promise<unknown>,
  options: {
    readonly organizationUrl?: string;
    readonly personalAccessToken?: string;
    readonly apiVersion?: string;
  } = {},
): ToolContext {
  const orgUrl =
    options.organizationUrl ?? 'http://127.0.0.1:8080/tfs/DefaultCollection';
  const baseUrls = resolveAzureDevOpsBaseUrls(orgUrl);
  return {
    config: {
      organizationUrl: orgUrl,
      authMethod: 'pat',
      personalAccessToken: options.personalAccessToken ?? 'test-pat',
      defaultProject: 'DemoProject',
      apiVersion: options.apiVersion ?? '7.1',
      readOnly: false,
      spotlighting: true,
    },
    baseUrls,
    http: {} as ToolContext['http'],
    getWebApi: async () => {
      throw new Error('getWebApi not used');
    },
    getAuthHeader: async () => 'Basic dGVzdA==',
    requestAzureDevOps: async <T>(opts: {
      method?: string;
      url: string;
      query?: Record<string, string | number | boolean | undefined>;
    }) => ({
      status: 200,
      headers: {},
      data: (await responder(opts.url, {
        method: opts.method,
        url: opts.url,
        query: opts.query,
      })) as T,
    }),
    resolveBaseUrls: () => baseUrls,
    resolveProjectId: (p?: string) => p ?? 'DemoProject',
    resolveOptionalProjectId: (p?: string) => p ?? 'DemoProject',
  };
}

void describe('EventEngine — SEP-3415, Resource Subscriptions & Polling Watcher', () => {
  beforeEach(() => {
    clearPollingApiVersionCache();
  });
  void it('listEvents exposes all 5 canonical events with poll+push delivery (never webhook)', () => {
    const engine = new EventEngine();
    const res = engine.listEvents();

    assert.equal(res.resultType, 'complete');
    assert.deepEqual(
      res.events.map((e) => e.name).sort(),
      [...CANONICAL_EVENT_NAMES].sort(),
    );
    for (const desc of res.events) {
      assert.deepEqual(desc.delivery, ['poll', 'push']);
      assert.ok(desc.inputSchema && typeof desc.inputSchema === 'object');
      assert.ok(desc.payloadSchema && typeof desc.payloadSchema === 'object');
    }
    engine.close();
  });

  void it('pollEvents validates unknown events (-32023), bad args (-32602), and supports bootstrap + filtering', () => {
    const engine = new EventEngine({ bufferSize: 10 });

    assert.throws(
      () => engine.pollEvents({ name: 'ado.does.not.exist', cursor: null }),
      (err: unknown) => {
        assert.ok(isEventsProtocolError(err));
        assert.equal(err.code, EventsErrorCode.NotFound);
        return true;
      },
    );

    assert.throws(
      () =>
        engine.pollEvents({
          name: 'ado.work_item.updated',
          cursor: null,
          maxEvents: -5,
        }),
      (err: unknown) => {
        assert.ok(isEventsProtocolError(err));
        assert.equal(err.code, EventsErrorCode.InvalidParams);
        return true;
      },
    );

    assert.throws(
      () =>
        engine.pollEvents({
          name: 'ado.work_item.updated',
          arguments: { workItemId: 'not-an-int' },
          cursor: null,
        }),
      (err: unknown) => {
        assert.ok(isEventsProtocolError(err));
        assert.equal(err.code, EventsErrorCode.InvalidParams);
        return true;
      },
    );

    const boot = engine.pollEvents({
      name: 'ado.work_item.updated',
      arguments: { projectId: 'DemoProject', workItemId: 101 },
      cursor: null,
    });
    assert.equal(boot.resultType, 'complete');
    assert.deepEqual(boot.events, []);
    assert.equal(boot.truncated, false);
    assert.equal(boot.hasMore, false);
    assert.equal(boot.nextPollMs, DEFAULT_NEXT_POLL_MS);
    assert.match(boot.cursor, CURSOR_PATTERN);

    // Publish non-matching and matching events
    engine.publish({
      eventId: 'e1',
      name: 'ado.work_item.updated',
      timestamp: new Date().toISOString(),
      data: { project: 'DemoProject', workItemId: 999, eventAction: 'updated' },
    });
    engine.publish({
      eventId: 'e2',
      name: 'ado.work_item.updated',
      timestamp: new Date().toISOString(),
      data: {
        project: 'DemoProject',
        workItemId: 101,
        eventAction: 'updated',
        title: `ATTACK_${'Z'.repeat(300)}`,
      },
    });

    const poll = engine.pollEvents({
      name: 'ado.work_item.updated',
      arguments: { projectId: 'DemoProject', workItemId: 101 },
      cursor: boot.cursor,
    });
    assert.equal(poll.events.length, 1);
    assert.equal(poll.events[0].eventId, 'e2');
    assert.ok(String(poll.events[0].data.title).length <= 200);
    engine.close();
  });

  void it('openStream emits active, live flat events, clamped heartbeats, and tears down on abort', async () => {
    const scheduler = createFakeScheduler();
    const engine = new EventEngine({
      scheduleTimeout: scheduler.schedule,
      clearScheduledTimeout: scheduler.clear,
    });

    const received: StreamNotificationMessage[] = [];
    const controller = new AbortController();

    const streamPromise = engine.openStream(
      {
        name: 'ado.work_item.updated',
        arguments: { projectId: 'DemoProject' },
        cursor: null,
        heartbeatMs: 1000, // should clamp up to MIN_HEARTBEAT_MS (5000)
      },
      (notif) => {
        received.push(notif);
      },
      controller.signal,
      'req-42',
    );

    // Wait microtask for active notification and stream registration
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(received.length, 1);
    assert.equal(received[0].method, 'notifications/events/active');
    assert.equal(received[0].params.heartbeatMs, MIN_HEARTBEAT_MS);
    assert.equal(received[0].params.truncated, false);
    assert.equal(
      (received[0].params._meta as Record<string, unknown>)[
        SUBSCRIPTION_ID_META_KEY
      ],
      'req-42',
    );
    assert.equal(scheduler.lastDelayMs(), MIN_HEARTBEAT_MS);

    engine.publish({
      eventId: 'live-1',
      name: 'ado.work_item.updated',
      timestamp: '2026-11-25T12:00:00Z',
      data: { project: 'DemoProject', workItemId: 101, eventAction: 'updated' },
    });

    assert.equal(received.length, 2);
    assert.equal(received[1].method, 'notifications/events/event');
    assert.equal(received[1].params.name, 'ado.work_item.updated');
    assert.equal(received[1].params.eventId, 'live-1');
    assert.match(String(received[1].params.cursor), CURSOR_PATTERN);

    // Fire heartbeat timer
    scheduler.fireAll();
    assert.equal(received.length, 3);
    assert.equal(received[2].method, 'notifications/events/heartbeat');
    assert.match(String(received[2].params.cursor), CURSOR_PATTERN);

    controller.abort();
    await streamPromise;
    assert.equal(engine.getStats().activeStreams, 0);
    assert.equal(scheduler.pendingCount(), 0);

    // Verify upper heartbeat clamp
    const ctrl2 = new AbortController();
    const received2: StreamNotificationMessage[] = [];
    const p2 = engine.openStream(
      { name: 'ado.git.pushed', cursor: null, heartbeatMs: 999_999 },
      (n) => {
        received2.push(n);
      },
      ctrl2.signal,
    );
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(received2[0].params.heartbeatMs, MAX_HEARTBEAT_MS);
    ctrl2.abort();
    await p2;
    engine.close();
  });

  void it('enforces per-session cap (20) and global watcher cap (-32025) and frees slots on unsubscribe', async () => {
    const scheduler = createFakeScheduler();
    const engine = new EventEngine({
      maxSubscriptionsPerSession: 20,
      maxGlobalWatchers: 25,
      scheduleTimeout: scheduler.schedule,
      clearScheduledTimeout: scheduler.clear,
    });
    const ctx = createMockToolContext(async () => ({
      id: 1,
      rev: 1,
      fields: { 'System.State': 'Active', 'System.Title': 'WI' },
    }));

    for (let i = 1; i <= 20; i += 1) {
      await engine.subscribeResource(
        'session-A',
        `ado://DefaultCollection/DemoProject/events/work-items/${i}`,
        ctx,
        () => {},
      );
    }

    // 21st subscription in same session rejects with -32025
    await assert.rejects(
      () =>
        engine.subscribeResource(
          'session-A',
          'ado://DefaultCollection/DemoProject/events/work-items/21',
          ctx,
          () => {},
        ),
      (err: unknown) => {
        assert.ok(isEventsProtocolError(err));
        assert.equal(err.code, EventsErrorCode.ResourceExhausted);
        return true;
      },
    );

    // Unsubscribing frees slot and stops idle watcher immediately
    assert.equal(
      engine.unsubscribeResource(
        'session-A',
        'ado://DefaultCollection/DemoProject/events/work-items/1',
      ),
      true,
    );
    assert.equal(engine.getStats().activeWatchers, 19);

    await engine.subscribeResource(
      'session-A',
      'ado://DefaultCollection/DemoProject/events/work-items/21',
      ctx,
      () => {},
    );
    assert.equal(engine.getStats().activeWatchers, 20);

    // Second session subscribing to same URI creates its OWN isolated watcher (no credential sharing)
    await engine.subscribeResource(
      'session-B',
      'ado://DefaultCollection/DemoProject/events/work-items/21',
      ctx,
      () => {},
    );
    assert.equal(engine.getStats().activeWatchers, 21);

    // Fill global watcher cap to 25 using session-B
    for (let i = 22; i <= 25; i += 1) {
      await engine.subscribeResource(
        'session-B',
        `ado://DefaultCollection/DemoProject/events/work-items/${i}`,
        ctx,
        () => {},
      );
    }
    assert.equal(engine.getStats().activeWatchers, 25);

    // 26th watcher rejects with -32025
    await assert.rejects(
      () =>
        engine.subscribeResource(
          'session-B',
          'ado://DefaultCollection/DemoProject/events/work-items/26',
          ctx,
          () => {},
        ),
      (err: unknown) => {
        assert.ok(isEventsProtocolError(err));
        assert.equal(err.code, EventsErrorCode.ResourceExhausted);
        return true;
      },
    );

    // cleanupSession stops all 20 watchers owned by session-A without disturbing session-B's 5
    engine.cleanupSession('session-A');
    assert.equal(engine.getStats().activeWatchers, 5);
    engine.cleanupSession('session-B');
    assert.equal(engine.getStats().activeWatchers, 0);
    assert.equal(scheduler.pendingCount(), 0);
    engine.close();
  });

  void it('Polling Watcher detects Work Item, PR, and Pipeline Run transitions and emits resource notifications', async () => {
    const scheduler = createFakeScheduler();
    const engine = new EventEngine({
      pollIntervalMs: 100, // should clamp up to 10_000ms
      scheduleTimeout: scheduler.schedule,
      clearScheduledTimeout: scheduler.clear,
    });
    assert.equal(engine.configuredPollIntervalMs, 10_000);

    let wiState = {
      id: 101,
      rev: 1,
      url: 'http://127.0.0.1:8080/tfs/DefaultCollection/DemoProject/_apis/wit/workitems/101',
      fields: {
        'System.State': 'Active',
        'System.Title': 'Initial WI',
        'System.WorkItemType': 'User Story',
      },
    };
    let prState = {
      pullRequestId: 42,
      title: 'Initial PR',
      status: 'active',
      mergeStatus: 'succeeded',
      repository: { id: 'repo-1', name: 'DemoRepo' },
      reviewers: [{ id: 'alice', vote: 0 }],
      threads: [],
      statuses: [{ id: 1, state: 'pending', context: { name: 'ci' } }],
    };
    let buildState = {
      id: 500,
      buildNumber: '20261125.1',
      status: 'inProgress',
      result: undefined as string | undefined,
      definition: { id: 10, name: 'CI-Main' },
      sourceBranch: 'refs/heads/main',
    };

    const ctx = createMockToolContext(async (url) => {
      if (url.includes('/workitems/101')) {
        return structuredClone(wiState);
      }
      if (url.includes('/pullrequests/42')) {
        return structuredClone(prState);
      }
      if (url.includes('/builds/500')) {
        return structuredClone(buildState);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const notifiedUris: string[] = [];
    const wiUri = 'ado://DefaultCollection/DemoProject/events/work-items/101';
    const prUri = 'ado://DefaultCollection/DemoProject/events/pull-requests/42';
    const runUri = 'ado://DefaultCollection/DemoProject/events/pipelines/500';
    const feedUri = 'ado://DefaultCollection/DemoProject/events/feed';

    await engine.subscribeResource('s1', wiUri, ctx, (u) => {
      notifiedUris.push(u);
    });
    await engine.subscribeResource('s1', prUri, ctx, (u) => {
      notifiedUris.push(u);
    });
    await engine.subscribeResource('s1', runUri, ctx, (u) => {
      notifiedUris.push(u);
    });
    await engine.subscribeResource('s1', feedUri, ctx, (u) => {
      notifiedUris.push(u);
    });

    assert.equal(engine.getStats().activeWatchers, 3);
    assert.equal(notifiedUris.length, 0);

    // Mutate all 3 resources
    wiState = {
      ...wiState,
      rev: 2,
      fields: { ...wiState.fields, 'System.State': 'Resolved' },
    };
    prState = {
      ...prState,
      mergeStatus: 'conflicts',
      reviewers: [{ id: 'alice', vote: 10 }],
      statuses: [{ id: 1, state: 'failed', context: { name: 'ci' } }],
    };
    buildState = {
      ...buildState,
      status: 'completed',
      result: 'succeeded',
    };

    scheduler.fireAll();
    // Wait for async fetch promises to resolve
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    assert.ok(notifiedUris.includes(wiUri));
    assert.ok(notifiedUris.includes(prUri));
    assert.ok(notifiedUris.includes(runUri));
    assert.ok(notifiedUris.includes(feedUri));

    const wiFeed = engine.readEventResource(wiUri);
    assert.equal(wiFeed.events.length, 1);
    assert.equal(wiFeed.events[0].data.rev, 2);
    assert.equal(wiFeed.events[0].data.state, 'Resolved');
    assert.equal(wiFeed.events[0].data.previousState, 'Active');

    const prFeed = engine.readEventResource(prUri);
    assert.equal(prFeed.events.length, 2);
    assert.deepEqual(prFeed.events.map((e) => e.name).sort(), [
      'ado.pull_request.checks_changed',
      'ado.pull_request.updated',
    ]);

    const runFeed = engine.readEventResource(runUri);
    assert.equal(runFeed.events.length, 1);
    assert.equal(runFeed.events[0].data.state, 'completed');
    assert.equal(runFeed.events[0].data.result, 'succeeded');

    const projectFeed = engine.readEventResource(feedUri);
    assert.equal(projectFeed.events.length, 4);

    engine.close();
  });

  void it('backs off polling delay and nextPollMs on ADO 429 rate-limit error', async () => {
    let nowMs = 10_000;
    const scheduler = createFakeScheduler();
    const engine = new EventEngine({
      pollIntervalMs: 10_000,
      now: () => nowMs,
      scheduleTimeout: scheduler.schedule,
      clearScheduledTimeout: scheduler.clear,
    });

    let callCount = 0;
    const ctx = createMockToolContext(async (_url, req) => {
      if (req.method === 'OPTIONS') {
        throw new Error('OPTIONS unavailable in mock');
      }
      callCount += 1;
      if (callCount === 2) {
        throw new AzureDevOpsRateLimitError(
          'Rate limited',
          new Date(nowMs + 45_000),
        );
      }
      return { id: 101, rev: 1, fields: { 'System.State': 'Active' } };
    });

    await engine.subscribeResource(
      's1',
      'ado://DefaultCollection/DemoProject/events/work-items/101',
      ctx,
      () => {},
    );

    scheduler.fireAll();
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    assert.equal(scheduler.lastDelayMs(), 45_000);
    const poll = engine.pollEvents({
      name: 'ado.work_item.updated',
      cursor: null,
    });
    assert.equal(poll.nextPollMs, 45_000);

    // After backoff expires, nextPollMs returns to default
    nowMs += 50_000;
    const pollAfter = engine.pollEvents({
      name: 'ado.work_item.updated',
      cursor: null,
    });
    assert.equal(pollAfter.nextPollMs, DEFAULT_NEXT_POLL_MS);

    engine.close();
  });

  void it('createUnsupportedError returns SEP-3415 -32026', () => {
    const engine = new EventEngine();
    const err = engine.createUnsupportedError('events/subscribe');
    assert.equal(err.code, EventsErrorCode.Unsupported);
    assert.deepEqual(err.data, { feature: 'deliveryMode', value: 'webhook' });
    engine.close();
  });

  void it('isolates polling watchers per session so Session A disconnect immediately stops polling on Session A credentials even while Session B remains subscribed to the same URI', async () => {
    const scheduler = createFakeScheduler();
    const engine = new EventEngine({
      pollIntervalMs: 10_000,
      scheduleTimeout: scheduler.schedule,
      clearScheduledTimeout: scheduler.clear,
    });

    let sessionAPolls = 0;
    let sessionBPolls = 0;
    let currentRev = 1;

    const ctxA = createMockToolContext(
      async (_url, req) => {
        if (req.method === 'OPTIONS') {
          throw new Error('OPTIONS unavailable');
        }
        sessionAPolls += 1;
        return {
          id: 101,
          rev: currentRev,
          fields: { 'System.State': 'Active', 'System.Title': 'Shared WI' },
        };
      },
      { personalAccessToken: 'secret-pat-session-A' },
    );

    const ctxB = createMockToolContext(
      async (_url, req) => {
        if (req.method === 'OPTIONS') {
          throw new Error('OPTIONS unavailable');
        }
        sessionBPolls += 1;
        return {
          id: 101,
          rev: currentRev,
          fields: { 'System.State': 'Active', 'System.Title': 'Shared WI' },
        };
      },
      { personalAccessToken: 'secret-pat-session-B' },
    );

    const uri = 'ado://DefaultCollection/DemoProject/events/work-items/101';
    await engine.subscribeResource('session-A', uri, ctxA, () => {});
    await engine.subscribeResource('session-B', uri, ctxB, () => {});

    // Each session has its own dedicated watcher bound to its own ToolContext/PAT
    assert.equal(engine.getStats().activeWatchers, 2);
    assert.equal(sessionAPolls, 1);
    assert.equal(sessionBPolls, 1);

    // Session A disconnects: its watcher MUST stop immediately
    engine.cleanupSession('session-A');
    assert.equal(engine.getStats().activeWatchers, 1);

    currentRev = 2;
    scheduler.fireAll();
    await new Promise<void>((r) => {
      setImmediate(r);
    });

    // Session A's credentials were NEVER used again after disconnect; only Session B polled
    assert.equal(sessionAPolls, 1);
    assert.equal(sessionBPolls, 2);

    // Also verify explicit unsubscribeResource immediately stops Session B's watcher
    assert.equal(engine.unsubscribeResource('session-B', uri), true);
    assert.equal(engine.getStats().activeWatchers, 0);
    assert.equal(scheduler.pendingCount(), 0);

    scheduler.fireAll();
    await new Promise<void>((r) => {
      setImmediate(r);
    });
    assert.equal(sessionAPolls, 1);
    assert.equal(sessionBPolls, 2);

    engine.close();
  });

  void it('enforces per-session (20) and global stream caps (-32025) and tears down session streams on cleanupSession', async () => {
    const scheduler = createFakeScheduler();
    const engine = new EventEngine({
      maxActiveStreamsPerSession: 20,
      maxGlobalStreams: 25,
      scheduleTimeout: scheduler.schedule,
      clearScheduledTimeout: scheduler.clear,
    });

    const controllersA: AbortController[] = [];
    const promisesA: Promise<void>[] = [];
    let resolvedA = 0;

    for (let i = 0; i < 20; i += 1) {
      const ctrl = new AbortController();
      controllersA.push(ctrl);
      const p = engine
        .openStream(
          { name: 'ado.work_item.updated', cursor: null },
          () => {},
          ctrl.signal,
          `req-a-${i}`,
          'session-A',
        )
        .then(() => {
          resolvedA += 1;
        });
      promisesA.push(p);
    }

    assert.equal(engine.getStats().activeStreams, 20);

    // 21st stream for session-A rejects with -32025 ResourceExhausted
    await assert.rejects(
      () =>
        engine.openStream(
          { name: 'ado.work_item.updated', cursor: null },
          () => {},
          new AbortController().signal,
          'req-a-21',
          'session-A',
        ),
      (err: unknown) => {
        assert.ok(isEventsProtocolError(err));
        assert.equal(err.code, EventsErrorCode.ResourceExhausted);
        return true;
      },
    );

    // Fill global stream cap to 25 using session-B
    const promisesB: Promise<void>[] = [];
    let resolvedB = 0;
    for (let i = 0; i < 5; i += 1) {
      const p = engine
        .openStream(
          { name: 'ado.git.pushed', cursor: null },
          () => {},
          new AbortController().signal,
          `req-b-${i}`,
          'session-B',
        )
        .then(() => {
          resolvedB += 1;
        });
      promisesB.push(p);
    }
    assert.equal(engine.getStats().activeStreams, 25);

    // 26th global stream rejects with -32025 ResourceExhausted
    await assert.rejects(
      () =>
        engine.openStream(
          { name: 'ado.git.pushed', cursor: null },
          () => {},
          new AbortController().signal,
          'req-c-1',
          'session-C',
        ),
      (err: unknown) => {
        assert.ok(isEventsProtocolError(err));
        assert.equal(err.code, EventsErrorCode.ResourceExhausted);
        return true;
      },
    );

    // Let startup active notifications settle
    await Promise.resolve();
    await Promise.resolve();

    // cleanupSession('session-A') immediately closes all 20 of session-A's streams
    // while leaving session-B's 5 streams intact
    engine.cleanupSession('session-A');
    await Promise.all(promisesA);
    assert.equal(resolvedA, 20);
    assert.equal(resolvedB, 0);
    assert.equal(engine.getStats().activeStreams, 5);

    // cleanupSession('session-B') closes remaining 5 streams and clears all heartbeat timers
    engine.cleanupSession('session-B');
    await Promise.all(promisesB);
    assert.equal(resolvedB, 5);
    assert.equal(engine.getStats().activeStreams, 0);
    assert.equal(scheduler.pendingCount(), 0);

    engine.close();
  });

  void it('delivers zero-drop, strictly ordered events when publish() runs concurrently during async openStream() replay', async () => {
    const scheduler = createFakeScheduler();
    const engine = new EventEngine({
      scheduleTimeout: scheduler.schedule,
      clearScheduledTimeout: scheduler.clear,
    });

    const makeOccurrence = (id: string, workItemId: number) => ({
      eventId: id,
      name: 'ado.work_item.updated' as const,
      timestamp: '2026-11-25T12:00:00Z',
      data: {
        project: 'DemoProject',
        workItemId,
        eventAction: 'updated',
      },
    });

    // Historical events before stream opens
    const e1 = engine.publish(makeOccurrence('e1', 1));
    engine.publish(makeOccurrence('e2', 2));

    // Gate async sendNotification calls to deterministically interleave publish()
    // during `active`, during replay `e2`, and during queued flush `e3`!
    const received: StreamNotificationMessage[] = [];
    const gates: Array<() => void> = [];
    let sendIndex = 0;

    const controller = new AbortController();
    const streamPromise = engine.openStream(
      {
        name: 'ado.work_item.updated',
        arguments: { projectId: 'DemoProject' },
        cursor: e1.cursor,
      },
      async (notif) => {
        received.push(notif);
        const idx = sendIndex++;
        if (idx < 3) {
          await new Promise<void>((resolveGate) => {
            gates.push(resolveGate);
          });
        }
      },
      controller.signal,
      'req-replay-race',
      'session-race',
    );

    // Gate 0: `notifications/events/active` is currently awaiting
    assert.equal(received.length, 1);
    assert.equal(received[0].method, 'notifications/events/active');

    // Publish e3 while `active` is in-flight
    engine.publish(makeOccurrence('e3', 3));

    // Release `active` -> replay e2 starts and pauses on Gate 1
    gates[0]();
    await new Promise<void>((r) => {
      setImmediate(r);
    });
    assert.equal(received.length, 2);
    assert.equal(received[1].params.eventId, 'e2');

    // Publish e4 while replay e2 is in-flight
    engine.publish(makeOccurrence('e4', 4));

    // Release e2 -> queued e3 starts flushing and pauses on Gate 2
    gates[1]();
    await new Promise<void>((r) => {
      setImmediate(r);
    });
    assert.equal(received.length, 3);
    assert.equal(received[2].params.eventId, 'e3');

    // Publish e5 while queued e3 is flushing
    engine.publish(makeOccurrence('e5', 5));

    // Release e3 -> e4 and e5 flush synchronously to live mode
    gates[2]();
    await new Promise<void>((r) => {
      setImmediate(r);
    });

    // Now stream is live: publish e6
    engine.publish(makeOccurrence('e6', 6));
    await new Promise<void>((r) => {
      setImmediate(r);
    });

    const eventNotifs = received.filter(
      (n) => n.method === 'notifications/events/event',
    );
    assert.deepEqual(
      eventNotifs.map((n) => n.params.eventId),
      ['e2', 'e3', 'e4', 'e5', 'e6'],
    );

    // Verify strictly ascending sequence numbers (zero duplicates, zero drops, exact order)
    const seqs = eventNotifs.map((n) => {
      const parsed = parseCursor(String(n.params.cursor));
      assert.ok(parsed);
      return parsed.seq;
    });
    assert.deepEqual(seqs, [2, 3, 4, 5, 6]);

    controller.abort();
    await streamPromise;
    engine.close();
  });

  void it('negotiates area api-version via cached OPTIONS /_apis/{area} across Server 2019 (5.0), 2020 (6.0), 2022 (7.0), and Services (7.1)', async () => {
    const profiles = [
      {
        fixture: 'server-2019-rtm.json',
        orgUrl: 'https://ado2019.corp:8080/tfs/DefaultCollection',
        expectedVersion: '5.0',
      },
      {
        fixture: 'server-2020.json',
        orgUrl: 'https://ado2020.corp/DefaultCollection',
        expectedVersion: '6.0',
      },
      {
        fixture: 'server-2022.json',
        orgUrl: 'https://ado2022.corp/DefaultCollection',
        expectedVersion: '7.0',
      },
      {
        fixture: 'services-cloud.json',
        orgUrl: 'https://dev.azure.com/contoso',
        expectedVersion: '7.1',
      },
    ] as const;

    for (const profile of profiles) {
      clearPollingApiVersionCache();
      const fixturePath = resolve(
        process.cwd(),
        'tests/fixtures/ado-server-profiles',
        profile.fixture,
      );
      const fixtureData = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
        resourceLocations: Record<string, unknown[]>;
      };

      const optionsCalls: string[] = [];
      const getCalls: Array<{ url: string; apiVersion: string | undefined }> =
        [];

      const ctx = createMockToolContext(
        async (url, req) => {
          if (req.method === 'OPTIONS') {
            optionsCalls.push(url);
            const area = url.split('/_apis/').pop() ?? '';
            return {
              count: fixtureData.resourceLocations[area]?.length ?? 0,
              value: fixtureData.resourceLocations[area] ?? [],
            };
          }

          const requestedVersion =
            req.query?.['api-version'] !== undefined
              ? String(req.query['api-version'])
              : undefined;
          getCalls.push({ url, apiVersion: requestedVersion });

          // Reject mismatched higher api-versions just like real on-prem Server 2019/2020/2022!
          if (requestedVersion !== profile.expectedVersion) {
            throw new Error(
              `HTTP 400 VssVersionOutOfRangeException: requested ${String(requestedVersion)}, max ${profile.expectedVersion}`,
            );
          }

          if (url.includes('/_apis/wit/workitems/')) {
            return {
              id: 101,
              rev: 1,
              fields: { 'System.State': 'Active', 'System.Title': 'WI 101' },
            };
          }
          if (url.includes('/_apis/git/pullrequests/')) {
            return {
              pullRequestId: 42,
              title: 'PR 42',
              status: 'active',
              mergeStatus: 'succeeded',
              reviewers: [],
              threads: [],
              statuses: [],
            };
          }
          if (url.includes('/_apis/build/builds/')) {
            return {
              id: 500,
              buildNumber: '20261125.1',
              status: 'inProgress',
              definition: { id: 10, name: 'CI' },
            };
          }
          throw new Error(`Unexpected URL: ${url}`);
        },
        {
          organizationUrl: profile.orgUrl,
          apiVersion: '7.1', // Cloud default — must be auto-downgraded for on-prem!
        },
      );

      const scheduler = createFakeScheduler();
      const engine = new EventEngine({
        pollIntervalMs: 10_000,
        scheduleTimeout: scheduler.schedule,
        clearScheduledTimeout: scheduler.clear,
      });

      await engine.subscribeResource(
        's-onprem',
        'ado://DefaultCollection/DemoProject/events/work-items/101',
        ctx,
        () => {},
      );
      await engine.subscribeResource(
        's-onprem',
        'ado://DefaultCollection/DemoProject/events/pull-requests/42',
        ctx,
        () => {},
      );
      await engine.subscribeResource(
        's-onprem',
        'ado://DefaultCollection/DemoProject/events/pipelines/500',
        ctx,
        () => {},
      );

      // Fire a second poll tick across all 3 watchers to confirm OPTIONS is cached!
      scheduler.fireAll();
      await new Promise<void>((r) => {
        setImmediate(r);
      });

      // Exactly 1 OPTIONS call per area (wit, git, build), NEVER repeated on second tick
      assert.deepEqual(
        optionsCalls.sort(),
        [
          `${profile.orgUrl}/_apis/build`,
          `${profile.orgUrl}/_apis/git`,
          `${profile.orgUrl}/_apis/wit`,
        ].sort(),
        `Expected cached OPTIONS per area for ${profile.fixture}`,
      );

      // All 6 GET polls (3 baseline + 3 tick) sent the exact negotiated api-version
      assert.equal(getCalls.length, 6);
      for (const call of getCalls) {
        assert.equal(
          call.apiVersion,
          profile.expectedVersion,
          `Expected api-version=${profile.expectedVersion} for ${profile.fixture} on ${call.url}`,
        );
      }

      engine.close();
    }
  });
});
