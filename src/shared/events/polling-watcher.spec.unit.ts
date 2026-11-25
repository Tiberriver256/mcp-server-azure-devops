import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { resolveAzureDevOpsBaseUrls } from '../azure-devops-url.ts';
import type { ToolContext } from '../session/azure-devops-session.ts';
import type { EventOccurrence } from './catalog.ts';
import { EventEngine } from './event-engine.ts';
import { parseEventResourceUri } from './event-uri.ts';
import {
  clearPollingApiVersionCache,
  ResourcePollingWatcher,
} from './polling-watcher.ts';
import type { WatchableEventResourceUri } from './polling-watcher.ts';

interface FakeTimerScheduler {
  readonly pendingCount: () => number;
  readonly schedule: (
    fn: () => void,
    ms: number,
  ) => ReturnType<typeof setTimeout>;
  readonly clear: (id: ReturnType<typeof setTimeout>) => void;
  readonly fireAll: () => void;
}

function createFakeScheduler(): FakeTimerScheduler {
  let nextId = 1;
  const timers = new Map<number, () => void>();

  return {
    pendingCount: () => timers.size,
    schedule: (fn) => {
      const id = nextId++;
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

function createRealUrlMockToolContext(
  responder: (url: string, req: MockRequestInfo) => Promise<unknown>,
  options: {
    readonly organizationUrl?: string;
    readonly defaultProject?: string;
    readonly apiVersion?: string;
  } = {},
): ToolContext {
  const orgUrl = options.organizationUrl ?? 'https://dev.azure.com/default-org';
  const defaultProject = options.defaultProject ?? 'DemoProject';
  const baseUrls = resolveAzureDevOpsBaseUrls(orgUrl, {
    projectId: defaultProject,
  });

  return {
    config: {
      organizationUrl: orgUrl,
      authMethod: 'pat',
      personalAccessToken: 'test-pat',
      defaultProject,
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
    resolveBaseUrls: (urlOpts) => {
      if (!urlOpts || (!urlOpts.organizationId && !urlOpts.projectId)) {
        return baseUrls;
      }
      return resolveAzureDevOpsBaseUrls(orgUrl, {
        organizationId: urlOpts.organizationId?.trim() || undefined,
        projectId: urlOpts.projectId?.trim() || defaultProject,
      });
    },
    resolveProjectId: (p?: string) => p ?? defaultProject,
    resolveOptionalProjectId: (p?: string) => p ?? defaultProject,
  };
}

function mustParseWatchableUri(uri: string): WatchableEventResourceUri {
  const parsed = parseEventResourceUri(uri);
  assert.ok(parsed && parsed.kind !== 'feed');
  return parsed;
}

void describe('ResourcePollingWatcher — separate sub-endpoints & multi-org scoping', () => {
  beforeEach(() => {
    clearPollingApiVersionCache();
  });

  void it('fetches separate PR /threads and /statuses endpoints when not inline and emits commented and checks_changed events', async () => {
    const scheduler = createFakeScheduler();
    const emitted: EventOccurrence[] = [];
    const requestedUrls: string[] = [];

    // Realistic ADO main PR payload: NO inline threads or statuses
    const prPayload = {
      pullRequestId: 42,
      title: 'Implement feature X',
      status: 'active',
      mergeStatus: 'succeeded',
      isDraft: false,
      repository: { id: 'repo-uuid-1', name: 'DemoRepo' },
      reviewers: [{ id: 'alice', vote: 0 }],
      url: 'https://dev.azure.com/default-org/DemoProject/_apis/git/repositories/repo-uuid-1/pullRequests/42',
    };

    let threadsValue: Array<{
      id: number;
      comments: Array<{ id: number; content: string }>;
    }> = [];
    let statusesValue: Array<{
      id: number;
      state: string;
      context: { name: string };
    }> = [{ id: 1, state: 'pending', context: { name: 'ci/build' } }];

    const ctx = createRealUrlMockToolContext(async (url, req) => {
      if (req.method === 'OPTIONS') {
        throw new Error('OPTIONS skipped in unit test');
      }
      requestedUrls.push(url);

      if (
        url.endsWith(
          '/DemoProject/_apis/git/repositories/repo-uuid-1/pullRequests/42/threads',
        )
      ) {
        return {
          count: threadsValue.length,
          value: structuredClone(threadsValue),
        };
      }
      if (
        url.endsWith(
          '/DemoProject/_apis/git/repositories/repo-uuid-1/pullRequests/42/statuses',
        )
      ) {
        return {
          count: statusesValue.length,
          value: structuredClone(statusesValue),
        };
      }
      if (url.endsWith('/DemoProject/_apis/git/pullrequests/42')) {
        return structuredClone(prPayload);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const watcher = new ResourcePollingWatcher({
      parsedUri: mustParseWatchableUri(
        'ado://default-org/DemoProject/events/pull-requests/42',
      ),
      ctx,
      pollIntervalMs: 10_000,
      onEvent: (ev) => {
        emitted.push(ev);
      },
      scheduleTimeout: scheduler.schedule,
      clearScheduledTimeout: scheduler.clear,
    });

    await watcher.start();
    assert.equal(emitted.length, 0);

    // Tick 2: add a review comment thread and fail CI status check while main PR object is unchanged
    threadsValue = [
      { id: 10, comments: [{ id: 1, content: 'Please add unit tests' }] },
    ];
    statusesValue = [{ id: 1, state: 'failed', context: { name: 'ci/build' } }];

    scheduler.fireAll();
    await new Promise<void>((r) => {
      setImmediate(r);
    });

    assert.equal(emitted.length, 2);

    const commentedEvent = emitted.find(
      (e) => e.name === 'ado.pull_request.updated',
    );
    assert.ok(commentedEvent);
    assert.equal(commentedEvent.data.action, 'commented');
    assert.equal(commentedEvent.data.commentCount, 1);
    assert.equal(commentedEvent.data.organization, 'default-org');

    const checksEvent = emitted.find(
      (e) => e.name === 'ado.pull_request.checks_changed',
    );
    assert.ok(checksEvent);
    assert.equal(checksEvent.data.overallState, 'failed');
    assert.deepEqual(checksEvent.data.failedChecks, ['ci/build']);
    assert.equal(checksEvent.data.organization, 'default-org');

    assert.ok(
      requestedUrls.some((u) =>
        u.endsWith('/repositories/repo-uuid-1/pullRequests/42/threads'),
      ),
    );
    assert.ok(
      requestedUrls.some((u) =>
        u.endsWith('/repositories/repo-uuid-1/pullRequests/42/statuses'),
      ),
    );

    watcher.stop();
  });

  void it('falls back to /_apis/git/pullrequests/{id}/threads & /statuses when repository.id is absent and tolerates sub-endpoint failures', async () => {
    const scheduler = createFakeScheduler();
    const emitted: EventOccurrence[] = [];
    const requestedUrls: string[] = [];

    let prTitle = 'Initial PR';
    const ctx = createRealUrlMockToolContext(async (url, req) => {
      if (req.method === 'OPTIONS') {
        throw new Error('OPTIONS skipped');
      }
      requestedUrls.push(url);
      if (url.endsWith('/_apis/git/pullrequests/99/threads')) {
        throw new Error('HTTP 403 Forbidden');
      }
      if (url.endsWith('/_apis/git/pullrequests/99/statuses')) {
        return { value: [] };
      }
      if (url.endsWith('/_apis/git/pullrequests/99')) {
        return {
          pullRequestId: 99,
          title: prTitle,
          status: 'active',
          mergeStatus: 'succeeded',
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const watcher = new ResourcePollingWatcher({
      parsedUri: mustParseWatchableUri(
        'ado://default-org/DemoProject/events/pull-requests/99',
      ),
      ctx,
      pollIntervalMs: 10_000,
      onEvent: (ev) => {
        emitted.push(ev);
      },
      scheduleTimeout: scheduler.schedule,
      clearScheduledTimeout: scheduler.clear,
    });

    await watcher.start();

    prTitle = 'Updated PR title';
    scheduler.fireAll();
    await new Promise<void>((r) => {
      setImmediate(r);
    });

    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].name, 'ado.pull_request.updated');
    assert.equal(emitted[0].data.title, 'Updated PR title');
    assert.ok(
      requestedUrls.some((u) =>
        u.endsWith('/_apis/git/pullrequests/99/threads'),
      ),
    );
    assert.ok(
      requestedUrls.some((u) =>
        u.endsWith('/_apis/git/pullrequests/99/statuses'),
      ),
    );

    watcher.stop();
  });

  void it('fetches separate build /timeline endpoint when stages are not inline and emits pipeline stage_changed event', async () => {
    const scheduler = createFakeScheduler();
    const emitted: EventOccurrence[] = [];
    const requestedUrls: string[] = [];

    // Realistic ADO build payload: NO inline stages property
    const buildPayload = {
      id: 500,
      buildNumber: '20261125.1',
      status: 'inProgress',
      definition: { id: 10, name: 'CI-Main' },
      sourceBranch: 'refs/heads/main',
      url: 'https://dev.azure.com/default-org/DemoProject/_apis/build/Builds/500',
    };

    let timelineRecords = [
      {
        id: 'stage-build',
        type: 'Stage',
        name: 'Build',
        state: 'completed',
        result: 'succeeded',
      },
      {
        id: 'stage-deploy',
        type: 'Stage',
        name: 'Deploy',
        state: 'inProgress',
        result: undefined as string | undefined,
      },
      {
        id: 'job-1',
        type: 'Job',
        name: 'RunTests',
        state: 'inProgress',
        result: undefined as string | undefined,
      },
    ];

    const ctx = createRealUrlMockToolContext(async (url, req) => {
      if (req.method === 'OPTIONS') {
        throw new Error('OPTIONS skipped');
      }
      requestedUrls.push(url);
      if (url.endsWith('/DemoProject/_apis/build/builds/500/timeline')) {
        return { records: structuredClone(timelineRecords) };
      }
      if (url.endsWith('/DemoProject/_apis/build/builds/500')) {
        return structuredClone(buildPayload);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const watcher = new ResourcePollingWatcher({
      parsedUri: mustParseWatchableUri(
        'ado://default-org/DemoProject/events/pipelines/500',
      ),
      ctx,
      pollIntervalMs: 10_000,
      onEvent: (ev) => {
        emitted.push(ev);
      },
      scheduleTimeout: scheduler.schedule,
      clearScheduledTimeout: scheduler.clear,
    });

    await watcher.start();
    assert.equal(emitted.length, 0);

    // Tick 2: only a non-stage Job record changes -> should NOT emit a stage change
    timelineRecords = [
      {
        id: 'stage-build',
        type: 'Stage',
        name: 'Build',
        state: 'completed',
        result: 'succeeded',
      },
      {
        id: 'stage-deploy',
        type: 'Stage',
        name: 'Deploy',
        state: 'inProgress',
        result: undefined,
      },
      {
        id: 'job-1',
        type: 'Job',
        name: 'RunTests',
        state: 'completed',
        result: 'succeeded',
      },
    ];
    scheduler.fireAll();
    await new Promise<void>((r) => {
      setImmediate(r);
    });
    assert.equal(emitted.length, 0);

    // Tick 3: Deploy Stage completes with failure while overall build status stays inProgress
    timelineRecords = [
      {
        id: 'stage-build',
        type: 'Stage',
        name: 'Build',
        state: 'completed',
        result: 'succeeded',
      },
      {
        id: 'stage-deploy',
        type: 'Stage',
        name: 'Deploy',
        state: 'completed',
        result: 'failed',
      },
      {
        id: 'job-1',
        type: 'Job',
        name: 'RunTests',
        state: 'completed',
        result: 'succeeded',
      },
    ];
    scheduler.fireAll();
    await new Promise<void>((r) => {
      setImmediate(r);
    });

    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].name, 'ado.pipeline.run_state_changed');
    assert.equal(emitted[0].data.runId, 500);
    assert.equal(emitted[0].data.stageName, 'Deploy');
    assert.equal(emitted[0].data.result, 'failed');
    assert.equal(emitted[0].data.organization, 'default-org');
    assert.ok(
      requestedUrls.some((u) =>
        u.endsWith('/DemoProject/_apis/build/builds/500/timeline'),
      ),
    );

    watcher.stop();
  });

  void it('polls the organization specified in the subscribed URI (not the default configured org) and isolates cross-org notifications', async () => {
    const scheduler = createFakeScheduler();
    const engine = new EventEngine({
      pollIntervalMs: 10_000,
      scheduleTimeout: scheduler.schedule,
      clearScheduledTimeout: scheduler.clear,
    });

    const requestedUrls: string[] = [];
    const optionsUrls: string[] = [];
    let otherOrgRev = 1;
    const defaultOrgRev = 1;

    const ctx = createRealUrlMockToolContext(
      async (url, req) => {
        if (req.method === 'OPTIONS') {
          optionsUrls.push(url);
          throw new Error('OPTIONS unavailable');
        }
        requestedUrls.push(url);
        if (url.startsWith('https://dev.azure.com/other-org/')) {
          return {
            id: 101,
            rev: otherOrgRev,
            url,
            fields: {
              'System.State': otherOrgRev === 1 ? 'Active' : 'Resolved',
              'System.Title': 'Other Org WI',
            },
          };
        }
        if (url.startsWith('https://dev.azure.com/default-org/')) {
          return {
            id: 101,
            rev: defaultOrgRev,
            url,
            fields: {
              'System.State': 'Active',
              'System.Title': 'Default Org WI',
            },
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
      { organizationUrl: 'https://dev.azure.com/default-org' },
    );

    const otherOrgUri = 'ado://other-org/DemoProject/events/work-items/101';
    const defaultOrgUri = 'ado://default-org/DemoProject/events/work-items/101';
    const otherNotifs: string[] = [];
    const defaultNotifs: string[] = [];

    await engine.subscribeResource('s1', otherOrgUri, ctx, (u) => {
      otherNotifs.push(u);
    });
    await engine.subscribeResource('s1', defaultOrgUri, ctx, (u) => {
      defaultNotifs.push(u);
    });

    // Confirm baseline polled the exact subscribed orgs (other-org AND default-org)
    assert.ok(
      requestedUrls.includes(
        'https://dev.azure.com/other-org/DemoProject/_apis/wit/workitems/101',
      ),
    );
    assert.ok(
      requestedUrls.includes(
        'https://dev.azure.com/default-org/DemoProject/_apis/wit/workitems/101',
      ),
    );
    assert.ok(
      optionsUrls.includes('https://dev.azure.com/other-org/_apis/wit'),
    );
    assert.ok(
      optionsUrls.includes('https://dev.azure.com/default-org/_apis/wit'),
    );

    // Mutate ONLY other-org's work item 101
    otherOrgRev = 2;
    scheduler.fireAll();
    await new Promise<void>((r) => {
      setImmediate(r);
    });

    // ONLY other-org subscription was notified; default-org subscription was NOT cross-notified
    assert.deepEqual(otherNotifs, [otherOrgUri]);
    assert.deepEqual(defaultNotifs, []);

    const otherFeed = engine.readEventResource(otherOrgUri);
    const defaultFeed = engine.readEventResource(defaultOrgUri);
    assert.equal(otherFeed.events.length, 1);
    assert.equal(otherFeed.events[0].data.organization, 'other-org');
    assert.equal(otherFeed.events[0].data.rev, 2);
    assert.equal(defaultFeed.events.length, 0);

    engine.close();
  });

  void it('routes on-prem Azure DevOps Server watchers to the collection specified in the event URI', async () => {
    const scheduler = createFakeScheduler();
    const requestedUrls: string[] = [];

    const ctx = createRealUrlMockToolContext(
      async (url, req) => {
        if (req.method === 'OPTIONS') {
          throw new Error('OPTIONS unavailable');
        }
        requestedUrls.push(url);
        return {
          id: 101,
          rev: 1,
          fields: { 'System.State': 'Active', 'System.Title': 'On-Prem WI' },
        };
      },
      { organizationUrl: 'https://ado.corp:8080/tfs/DefaultCollection' },
    );

    const watcher = new ResourcePollingWatcher({
      parsedUri: mustParseWatchableUri(
        'ado://OtherCollection/DemoProject/events/work-items/101',
      ),
      ctx,
      pollIntervalMs: 10_000,
      onEvent: () => {},
      scheduleTimeout: scheduler.schedule,
      clearScheduledTimeout: scheduler.clear,
    });

    await watcher.start();

    assert.deepEqual(requestedUrls, [
      'https://ado.corp:8080/tfs/OtherCollection/DemoProject/_apis/wit/workitems/101',
    ]);

    watcher.stop();
  });
});
