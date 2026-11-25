import { createHash } from 'node:crypto';
import { AzureDevOpsRateLimitError } from '../errors/index.ts';
import type { HttpMethod } from '../http/http-client.ts';
import { logDebug } from '../logging.ts';
import type { ToolContext } from '../session/azure-devops-session.ts';
import { truncateEventText } from './catalog.ts';
import type { EventOccurrence } from './catalog.ts';
import type { ParsedEventResourceUri } from './event-uri.ts';

export const MIN_POLL_INTERVAL_MS = 10_000;
export const DEFAULT_POLL_INTERVAL_MS = 30_000;
const MAX_BACKOFF_MS = 300_000; // 5 minutes
const OPTIONS_TIMEOUT_MS = 10_000;
const OPTIONS_MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MiB bounded OPTIONS catalog
const MAX_AREA_CACHE_ENTRIES = 64;

// HttpClient.request forwards `method` directly to fetch(), supporting OPTIONS even though HttpMethod omits it.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const HTTP_OPTIONS_METHOD = 'OPTIONS' as unknown as HttpMethod;

export type WatchableEventResourceUri = Exclude<
  ParsedEventResourceUri,
  { readonly kind: 'feed' }
>;

type PollingArea = 'wit' | 'git' | 'build';

interface PollingAreaTarget {
  readonly area: PollingArea;
  readonly locationId: string;
  readonly resourceName: string;
}

const POLLING_AREA_TARGETS: Record<
  WatchableEventResourceUri['kind'],
  PollingAreaTarget
> = {
  'work-item': {
    area: 'wit',
    locationId: '72c7ddf8-2cdc-4f60-90cd-ab71c14a399b',
    resourceName: 'workItems',
  },
  'pull-request': {
    area: 'git',
    locationId: '01a46dea-7d46-4d40-bc84-319e7c260d99',
    resourceName: 'pullRequests',
  },
  pipeline: {
    area: 'build',
    locationId: '0cd358e1-9217-4d94-8269-1c1ee6f93dcf',
    resourceName: 'builds',
  },
};

interface ApiResourceLocationLike {
  readonly id?: string;
  readonly area?: string;
  readonly resourceName?: string;
  readonly resourceVersion?: number;
  readonly minVersion?: string;
  readonly maxVersion?: string;
  readonly releasedVersion?: string;
}

interface ParsedApiVersion {
  readonly major: number;
  readonly minor: number;
  readonly isPreview: boolean;
  readonly previewNum?: number;
}

const areaLocationsCache = new Map<
  string,
  Promise<Map<string, ApiResourceLocationLike> | null>
>();

function parseApiVersion(raw: string): ParsedApiVersion | null {
  const match = /^(\d+)\.(\d+)(?:-preview(?:\.(\d+))?)?$/i.exec(raw.trim());
  if (!match) {
    return null;
  }
  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) {
    return null;
  }
  const isPreview = /-preview/i.test(raw);
  const previewNum = match[3] ? Number.parseInt(match[3], 10) : undefined;
  return { major, minor, isPreview, previewNum };
}

function compareApiVersions(
  a: { readonly major: number; readonly minor: number },
  b: { readonly major: number; readonly minor: number },
): number {
  return a.major !== b.major ? a.major - b.major : a.minor - b.minor;
}

function negotiateVersionFromLocation(
  location: ApiResourceLocationLike,
  requestedVersion: string,
): string {
  const max = parseApiVersion(location.maxVersion ?? '');
  if (!max) {
    return requestedVersion;
  }

  const rawReleased = location.releasedVersion?.trim();
  const released =
    rawReleased && rawReleased !== '0.0' ? parseApiVersion(rawReleased) : null;
  const min = location.minVersion ? parseApiVersion(location.minVersion) : null;
  const rv =
    typeof location.resourceVersion === 'number' &&
    Number.isInteger(location.resourceVersion) &&
    location.resourceVersion > 0
      ? location.resourceVersion
      : 1;

  const latestVersion = (): string =>
    released && compareApiVersions(released, max) >= 0
      ? `${released.major}.${released.minor}`
      : `${max.major}.${max.minor}-preview.${rv}`;

  const req = parseApiVersion(requestedVersion);
  if (!req) {
    return latestVersion();
  }

  if (min && compareApiVersions(req, min) < 0) {
    return latestVersion();
  }

  if (!req.isPreview) {
    if (released !== null) {
      const target = compareApiVersions(req, released) <= 0 ? req : released;
      return `${target.major}.${target.minor}`;
    }
    const target = compareApiVersions(req, max) <= 0 ? req : max;
    return `${target.major}.${target.minor}-preview.${rv}`;
  }

  if (compareApiVersions(req, max) <= 0) {
    const num =
      req.previewNum !== undefined && req.previewNum <= rv
        ? req.previewNum
        : rv;
    return `${req.major}.${req.minor}-preview.${num}`;
  }

  return latestVersion();
}

function toApiResourceLocation(item: unknown): ApiResourceLocationLike | null {
  if (!isRecord(item)) {
    return null;
  }
  return {
    id: asString(item.id),
    area: asString(item.area),
    resourceName: asString(item.resourceName),
    resourceVersion: asNumber(item.resourceVersion),
    minVersion: asString(item.minVersion),
    maxVersion: asString(item.maxVersion),
    releasedVersion: asString(item.releasedVersion),
  };
}

function parseOptionsCatalog(
  payload: unknown,
): Map<string, ApiResourceLocationLike> | null {
  if (!isRecord(payload) || !Array.isArray(payload.value)) {
    return null;
  }
  const locations = new Map<string, ApiResourceLocationLike>();
  let syntheticIdx = 0;
  for (const item of payload.value) {
    const loc = toApiResourceLocation(item);
    if (!loc) {
      continue;
    }
    const key =
      loc.id?.trim().toLowerCase() ??
      (loc.resourceName
        ? `name:${loc.resourceName.trim().toLowerCase()}`
        : `idx:${syntheticIdx++}`);
    locations.set(key, loc);
  }
  return locations.size > 0 ? locations : null;
}

async function fetchAreaLocations(
  ctx: ToolContext,
  coreBaseUrl: string,
  area: PollingArea,
): Promise<Map<string, ApiResourceLocationLike> | null> {
  const normalizedBase = coreBaseUrl.replace(/\/+$/, '');
  const cacheKey = `${normalizedBase.toLowerCase()}|${area}`;
  const existing = areaLocationsCache.get(cacheKey);
  if (existing) {
    return await existing;
  }

  if (areaLocationsCache.size >= MAX_AREA_CACHE_ENTRIES) {
    const oldestKey = areaLocationsCache.keys().next().value;
    if (oldestKey !== undefined) {
      areaLocationsCache.delete(oldestKey);
    }
  }

  const optionsUrl = `${normalizedBase}/_apis/${encodeURIComponent(area)}`;
  const pending = (async (): Promise<Map<
    string,
    ApiResourceLocationLike
  > | null> => {
    try {
      const response = await ctx.requestAzureDevOps<unknown>({
        method: HTTP_OPTIONS_METHOD,
        url: optionsUrl,
        headers: { Accept: 'application/json' },
        timeoutMs: OPTIONS_TIMEOUT_MS,
        maxResponseBytes: OPTIONS_MAX_RESPONSE_BYTES,
        context: `negotiate ${area} api-version`,
      });
      if (response.status !== 200) {
        areaLocationsCache.delete(cacheKey);
        return null;
      }
      const catalog = parseOptionsCatalog(response.data);
      if (catalog === null) {
        areaLocationsCache.delete(cacheKey);
        return null;
      }
      return catalog;
    } catch {
      areaLocationsCache.delete(cacheKey);
      return null;
    }
  })();

  areaLocationsCache.set(cacheKey, pending);
  return await pending;
}

async function negotiatePollingApiVersion(
  ctx: ToolContext,
  coreBaseUrl: string,
  target: PollingAreaTarget,
): Promise<string> {
  const fallback = ctx.config.apiVersion;
  const locations = await fetchAreaLocations(ctx, coreBaseUrl, target.area);
  if (!locations) {
    return fallback;
  }

  let location = locations.get(target.locationId.toLowerCase());
  if (!location) {
    const lowerName = target.resourceName.toLowerCase();
    for (const entry of locations.values()) {
      if (entry.resourceName?.toLowerCase() === lowerName) {
        location = entry;
        break;
      }
    }
  }
  if (!location) {
    for (const entry of locations.values()) {
      if (entry.maxVersion && parseApiVersion(entry.maxVersion)) {
        location = entry;
        break;
      }
    }
  }

  if (!location) {
    return fallback;
  }

  return negotiateVersionFromLocation(location, fallback);
}

/**
 * Clear the cached `OPTIONS /_apis/{area}` api-version catalog used by polling watchers.
 */
export function clearPollingApiVersionCache(): void {
  areaLocationsCache.clear();
}

export interface PollingWatcherOptions {
  readonly parsedUri: WatchableEventResourceUri;
  readonly ctx: ToolContext;
  readonly pollIntervalMs: number;
  readonly onEvent: (occurrence: EventOccurrence) => void;
  readonly onRateLimit?: (retryAfterMs: number) => void;
  readonly now?: () => number;
  readonly scheduleTimeout?: (
    fn: () => void,
    ms: number,
  ) => ReturnType<typeof setTimeout>;
  readonly clearScheduledTimeout?: (id: ReturnType<typeof setTimeout>) => void;
}

interface WorkItemSnapshot {
  readonly kind: 'work-item';
  readonly rev?: number;
  readonly state?: string;
  readonly title?: string;
  readonly workItemType?: string;
  readonly areaPath?: string;
  readonly assignedTo?: string;
  readonly changedDate?: string;
  readonly commentCount?: number;
  readonly url?: string;
}

interface PullRequestSnapshot {
  readonly kind: 'pull-request';
  readonly title?: string;
  readonly status?: string;
  readonly mergeStatus?: string;
  readonly isDraft?: boolean;
  readonly lastCommitId?: string;
  readonly commentCount: number;
  readonly votesKey: string;
  readonly statusesKey: string;
  readonly overallCheckState: string;
  readonly failedChecks: readonly string[];
  readonly repository?: string;
  readonly repositoryId?: string;
  readonly url?: string;
}

interface PipelineStageSummary {
  readonly key: string;
  readonly name: string;
  readonly state: string;
  readonly result: string;
}

interface PipelineRunSnapshot {
  readonly kind: 'pipeline';
  readonly state: string;
  readonly result?: string;
  readonly pipelineId?: number;
  readonly pipelineName?: string;
  readonly buildNumber?: string;
  readonly sourceBranch?: string;
  readonly stagesKey: string;
  readonly stages: readonly PipelineStageSummary[];
  readonly url?: string;
}

type ResourceSnapshot =
  | WorkItemSnapshot
  | PullRequestSnapshot
  | PipelineRunSnapshot;

/**
 * Clamp poll interval to the Poka-Yoke minimum floor (`>= 10_000 ms`, default `30_000 ms`).
 */
export function clampPollIntervalMs(pollIntervalMs?: number): number {
  if (pollIntervalMs === undefined || !Number.isFinite(pollIntervalMs)) {
    return DEFAULT_POLL_INTERVAL_MS;
  }
  return Math.max(MIN_POLL_INTERVAL_MS, Math.trunc(pollIntervalMs));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function extractIdentityName(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  const rec = asRecord(value);
  return asString(rec?.displayName) ?? asString(rec?.uniqueName);
}

function deterministicEventId(
  prefix: string,
  parts: readonly unknown[],
): string {
  const hash = createHash('sha256')
    .update(JSON.stringify(parts))
    .digest('hex')
    .slice(0, 24);
  return `${prefix}-${hash}`;
}

function stripUndefined(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
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

function extractWorkItemSnapshot(raw: unknown): WorkItemSnapshot {
  const rec = asRecord(raw) ?? {};
  const fields = asRecord(rec.fields) ?? {};
  return {
    kind: 'work-item',
    rev: asNumber(rec.rev),
    state: asString(fields['System.State']),
    title: asString(fields['System.Title']),
    workItemType: asString(fields['System.WorkItemType']),
    areaPath: asString(fields['System.AreaPath']),
    assignedTo: extractIdentityName(fields['System.AssignedTo']),
    changedDate: asString(fields['System.ChangedDate']),
    commentCount: asNumber(fields['System.CommentCount']),
    url: asString(rec.url),
  };
}

function extractPullRequestSnapshot(raw: unknown): PullRequestSnapshot {
  const pr = asRecord(raw) ?? {};
  const repo = asRecord(pr.repository);
  const lastMergeSourceCommit = asRecord(pr.lastMergeSourceCommit);

  const threads = Array.isArray(pr.threads) ? pr.threads : [];
  let commentCount = 0;
  for (const thread of threads) {
    const threadRec = asRecord(thread);
    const comments = Array.isArray(threadRec?.comments)
      ? threadRec.comments
      : [];
    commentCount += comments.length;
  }

  const reviewers = Array.isArray(pr.reviewers) ? pr.reviewers : [];
  const votesKey = reviewers
    .map((rev) => {
      const r = asRecord(rev);
      const id =
        asString(r?.id) ??
        asString(r?.uniqueName) ??
        asString(r?.displayName) ??
        '';
      const vote = asNumber(r?.vote) ?? 0;
      return `${id}:${vote}`;
    })
    .sort()
    .join(',');

  const statuses = Array.isArray(pr.statuses) ? pr.statuses : [];
  const failedChecks: string[] = [];
  let hasPending = false;
  let hasSucceeded = false;
  const statusEntries: string[] = [];

  for (const st of statuses) {
    const s = asRecord(st);
    const state = (asString(s?.state) ?? 'unknown').toLowerCase();
    const ctxRec = asRecord(s?.context);
    const name =
      asString(ctxRec?.name) ?? asString(s?.description) ?? String(s?.id ?? '');
    statusEntries.push(`${name}:${state}`);
    if (state === 'failed' || state === 'error') {
      failedChecks.push(name);
    } else if (state === 'pending') {
      hasPending = true;
    } else if (state === 'succeeded') {
      hasSucceeded = true;
    }
  }
  statusEntries.sort();

  const overallCheckState =
    failedChecks.length > 0
      ? 'failed'
      : hasPending
        ? 'pending'
        : hasSucceeded
          ? 'succeeded'
          : 'none';

  return {
    kind: 'pull-request',
    title: asString(pr.title),
    status: asString(pr.status),
    mergeStatus: asString(pr.mergeStatus),
    isDraft: typeof pr.isDraft === 'boolean' ? pr.isDraft : undefined,
    lastCommitId: asString(lastMergeSourceCommit?.commitId),
    commentCount,
    votesKey,
    statusesKey: statusEntries.join(','),
    overallCheckState,
    failedChecks,
    repository: asString(repo?.name),
    repositoryId: asString(repo?.id),
    url: asString(pr.url),
  };
}

function extractPipelineRunSnapshot(raw: unknown): PipelineRunSnapshot {
  const build = asRecord(raw) ?? {};
  const definition = asRecord(build.definition);
  const pipeline = asRecord(build.pipeline);

  const stageSummaries: PipelineStageSummary[] = [];
  if (Array.isArray(build.stages)) {
    for (let i = 0; i < build.stages.length; i += 1) {
      const s = asRecord(build.stages[i]);
      if (!s) {
        continue;
      }
      const id = asString(s.id);
      const name = asString(s.name) ?? id ?? `stage-${i}`;
      const key = id ?? name;
      stageSummaries.push({
        key,
        name,
        state: asString(s.state) ?? '',
        result: asString(s.result) ?? '',
      });
    }
  } else {
    const stages = asRecord(build.stages);
    if (stages) {
      for (const [k, v] of Object.entries(stages)) {
        const s = asRecord(v);
        stageSummaries.push({
          key: k,
          name: asString(s?.name) ?? k,
          state: asString(s?.state) ?? '',
          result: asString(s?.result) ?? '',
        });
      }
    }
  }

  const stagesKey = stageSummaries
    .map((s) => `${s.key}:${s.state}:${s.result}`)
    .sort()
    .join(',');

  return {
    kind: 'pipeline',
    state: asString(build.status) ?? asString(build.state) ?? 'unknown',
    result: asString(build.result),
    pipelineId: asNumber(definition?.id) ?? asNumber(pipeline?.id),
    pipelineName: asString(definition?.name) ?? asString(pipeline?.name),
    buildNumber: asString(build.buildNumber) ?? asString(build.name),
    sourceBranch: asString(build.sourceBranch),
    stagesKey,
    stages: stageSummaries,
    url: asString(build.url),
  };
}

/**
 * Bounded single-resource polling watcher for an actively subscribed
 * PR, Pipeline Run, or Work Item `ado://.../events/...` URI.
 *
 * - Captures an immediate baseline snapshot on `start()`.
 * - Uses non-overlapping `setTimeout` scheduling with `.unref()`.
 * - Backs off automatically on `AzureDevOpsRateLimitError` (HTTP 429).
 * - Tears down immediately on `stop()` so 0-listener resources never poll.
 */
export class ResourcePollingWatcher {
  private readonly parsedUri: WatchableEventResourceUri;
  private readonly ctx: ToolContext;
  private readonly baseIntervalMs: number;
  private readonly onEvent: (occurrence: EventOccurrence) => void;
  private readonly onRateLimit?: (retryAfterMs: number) => void;
  private readonly now: () => number;
  private readonly scheduleTimeout: (
    fn: () => void,
    ms: number,
  ) => ReturnType<typeof setTimeout>;
  private readonly clearScheduledTimeout: (
    id: ReturnType<typeof setTimeout>,
  ) => void;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private baseline: ResourceSnapshot | null = null;
  private stopped = false;
  private inFlight = false;

  constructor(options: PollingWatcherOptions) {
    this.parsedUri = options.parsedUri;
    this.ctx = options.ctx;
    this.baseIntervalMs = clampPollIntervalMs(options.pollIntervalMs);
    this.onEvent = options.onEvent;
    this.onRateLimit = options.onRateLimit;
    this.now = options.now ?? (() => Date.now());
    this.scheduleTimeout =
      options.scheduleTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearScheduledTimeout =
      options.clearScheduledTimeout ?? ((id) => clearTimeout(id));
  }

  /**
   * Capture initial baseline snapshot and schedule periodic polling.
   */
  async start(): Promise<void> {
    if (this.stopped) {
      return;
    }
    const nextDelay = await this.pollOnce(true);
    if (!this.stopped) {
      this.scheduleNext(nextDelay);
    }
  }

  /**
   * Immediately cancel timers and prevent any further callbacks or polls.
   */
  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      this.clearScheduledTimeout(this.timer);
      this.timer = null;
    }
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  private scheduleNext(delayMs: number): void {
    if (this.stopped) {
      return;
    }
    if (this.timer !== null) {
      this.clearScheduledTimeout(this.timer);
    }
    const safeDelay = Math.max(this.baseIntervalMs, delayMs);
    const id = this.scheduleTimeout(() => {
      this.timer = null;
      void this.tick();
    }, safeDelay);
    unrefTimer(id);
    this.timer = id;
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.inFlight) {
      return;
    }
    const nextDelay = await this.pollOnce(false);
    if (!this.stopped) {
      this.scheduleNext(nextDelay);
    }
  }

  private async pollOnce(isBaseline: boolean): Promise<number> {
    if (this.stopped) {
      return this.baseIntervalMs;
    }
    this.inFlight = true;
    try {
      const baseUrls = this.ctx.resolveBaseUrls({
        organizationId: this.parsedUri.organization,
        projectId: this.parsedUri.project,
      });
      const apiVersion = await negotiatePollingApiVersion(
        this.ctx,
        baseUrls.coreBaseUrl,
        POLLING_AREA_TARGETS[this.parsedUri.kind],
      );
      if (this.stopped) {
        return this.baseIntervalMs;
      }

      const snapshot = await this.fetchSnapshot(
        baseUrls.coreBaseUrl,
        apiVersion,
      );
      if (this.stopped) {
        return this.baseIntervalMs;
      }

      if (this.baseline === null || isBaseline) {
        this.baseline = snapshot;
        return this.baseIntervalMs;
      }

      const events = this.diffSnapshots(this.baseline, snapshot);
      this.baseline = snapshot;
      for (const occurrence of events) {
        if (this.stopped) {
          break;
        }
        this.onEvent(occurrence);
      }
      return this.baseIntervalMs;
    } catch (error) {
      if (error instanceof AzureDevOpsRateLimitError) {
        const retryMs = Math.min(
          MAX_BACKOFF_MS,
          Math.max(this.baseIntervalMs, error.resetAt.getTime() - this.now()),
        );
        this.onRateLimit?.(retryMs);
        logDebug(
          `[events-watcher] Rate limited (429) on ${this.parsedUri.kind}; backing off ${retryMs}ms`,
        );
        return retryMs;
      }
      logDebug(
        `[events-watcher] Poll failed for ${this.parsedUri.kind} in ${this.parsedUri.project}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.baseIntervalMs;
    } finally {
      this.inFlight = false;
    }
  }

  private async fetchSnapshot(
    coreBaseUrl: string,
    apiVersion: string,
  ): Promise<ResourceSnapshot> {
    const encodedProject = encodeURIComponent(this.parsedUri.project);

    switch (this.parsedUri.kind) {
      case 'work-item': {
        const url = `${coreBaseUrl}/${encodedProject}/_apis/wit/workitems/${this.parsedUri.workItemId}`;
        const response = await this.ctx.requestAzureDevOps<unknown>({
          method: 'GET',
          url,
          query: { 'api-version': apiVersion },
          context: `poll work item ${this.parsedUri.workItemId}`,
        });
        return extractWorkItemSnapshot(response.data);
      }
      case 'pull-request': {
        const prId = this.parsedUri.pullRequestId;
        const url = `${coreBaseUrl}/${encodedProject}/_apis/git/pullrequests/${prId}`;
        const response = await this.ctx.requestAzureDevOps<unknown>({
          method: 'GET',
          url,
          query: { 'api-version': apiVersion },
          context: `poll pull request ${prId}`,
        });
        const prData = asRecord(response.data) ?? {};
        const repoRec = asRecord(prData.repository);
        const repoId = asString(repoRec?.id);
        const prSubresourceBase = repoId
          ? `${coreBaseUrl}/${encodedProject}/_apis/git/repositories/${encodeURIComponent(repoId)}/pullRequests/${prId}`
          : `${coreBaseUrl}/${encodedProject}/_apis/git/pullrequests/${prId}`;

        let threads: unknown = prData.threads;
        let threadsFailed = false;
        if (!Array.isArray(threads)) {
          try {
            const threadsRes = await this.ctx.requestAzureDevOps<unknown>({
              method: 'GET',
              url: `${prSubresourceBase}/threads`,
              query: { 'api-version': apiVersion },
              context: `poll pull request ${prId} threads`,
            });
            const threadsRec = asRecord(threadsRes.data);
            if (Array.isArray(threadsRec?.value)) {
              threads = threadsRec.value;
            } else if (Array.isArray(threadsRes.data)) {
              threads = threadsRes.data;
            }
          } catch (error) {
            if (error instanceof AzureDevOpsRateLimitError) {
              throw error;
            }
            threadsFailed = true;
            logDebug(
              `[events-watcher] Failed to fetch threads for PR ${prId}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        let statuses: unknown = prData.statuses;
        let statusesFailed = false;
        if (!Array.isArray(statuses)) {
          try {
            const statusesRes = await this.ctx.requestAzureDevOps<unknown>({
              method: 'GET',
              url: `${prSubresourceBase}/statuses`,
              query: { 'api-version': apiVersion },
              context: `poll pull request ${prId} statuses`,
            });
            const statusesRec = asRecord(statusesRes.data);
            if (Array.isArray(statusesRec?.value)) {
              statuses = statusesRec.value;
            } else if (Array.isArray(statusesRes.data)) {
              statuses = statusesRes.data;
            }
          } catch (error) {
            if (error instanceof AzureDevOpsRateLimitError) {
              throw error;
            }
            statusesFailed = true;
            logDebug(
              `[events-watcher] Failed to fetch statuses for PR ${prId}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        const snapshot = extractPullRequestSnapshot({
          ...prData,
          ...(threads !== undefined ? { threads } : {}),
          ...(statuses !== undefined ? { statuses } : {}),
        });

        const prevPr =
          this.baseline?.kind === 'pull-request' ? this.baseline : null;
        if (prevPr && (threadsFailed || statusesFailed)) {
          return {
            ...snapshot,
            ...(threadsFailed ? { commentCount: prevPr.commentCount } : {}),
            ...(statusesFailed
              ? {
                  statusesKey: prevPr.statusesKey,
                  overallCheckState: prevPr.overallCheckState,
                  failedChecks: prevPr.failedChecks,
                }
              : {}),
          };
        }
        return snapshot;
      }
      case 'pipeline': {
        const runId = this.parsedUri.runId;
        const url = `${coreBaseUrl}/${encodedProject}/_apis/build/builds/${runId}`;
        const response = await this.ctx.requestAzureDevOps<unknown>({
          method: 'GET',
          url,
          query: { 'api-version': apiVersion },
          context: `poll pipeline run ${runId}`,
        });
        const buildData = asRecord(response.data) ?? {};

        let stages: unknown = buildData.stages;
        let timelineFailed = false;
        if (!Array.isArray(stages) && !isRecord(stages)) {
          try {
            const timelineRes = await this.ctx.requestAzureDevOps<unknown>({
              method: 'GET',
              url: `${coreBaseUrl}/${encodedProject}/_apis/build/builds/${runId}/timeline`,
              query: { 'api-version': apiVersion },
              context: `poll pipeline run ${runId} timeline`,
            });
            const timelineRec = asRecord(timelineRes.data);
            const records = Array.isArray(timelineRec?.records)
              ? timelineRec.records
              : [];
            stages = records
              .filter((r) => {
                const rec = asRecord(r);
                return (
                  typeof rec?.type === 'string' &&
                  rec.type.toLowerCase() === 'stage'
                );
              })
              .map((r) => {
                const rec = asRecord(r) ?? {};
                return {
                  id: asString(rec.id),
                  name: asString(rec.name),
                  state: asString(rec.state),
                  result: asString(rec.result),
                };
              });
          } catch (error) {
            if (error instanceof AzureDevOpsRateLimitError) {
              throw error;
            }
            timelineFailed = true;
            logDebug(
              `[events-watcher] Failed to fetch timeline for build ${runId}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        const snapshot = extractPipelineRunSnapshot({
          ...buildData,
          ...(stages !== undefined ? { stages } : {}),
        });
        const prevPipeline =
          this.baseline?.kind === 'pipeline' ? this.baseline : null;
        if (prevPipeline && timelineFailed) {
          return {
            ...snapshot,
            stagesKey: prevPipeline.stagesKey,
            stages: prevPipeline.stages,
          };
        }
        return snapshot;
      }
    }
  }

  private diffSnapshots(
    previous: ResourceSnapshot,
    current: ResourceSnapshot,
  ): EventOccurrence[] {
    const timestamp = new Date(this.now()).toISOString();
    const organization = this.parsedUri.organization;
    const project = this.parsedUri.project;

    if (
      this.parsedUri.kind === 'work-item' &&
      previous.kind === 'work-item' &&
      current.kind === 'work-item'
    ) {
      const changed =
        previous.rev !== current.rev ||
        previous.state !== current.state ||
        previous.title !== current.title ||
        previous.assignedTo !== current.assignedTo ||
        previous.commentCount !== current.commentCount ||
        previous.changedDate !== current.changedDate;

      if (!changed) {
        return [];
      }

      const workItemId = this.parsedUri.workItemId;
      return [
        {
          eventId: deterministicEventId('poll-wi', [
            organization,
            project,
            workItemId,
            current.rev,
            current.state,
            current.title,
            current.assignedTo,
            current.commentCount,
            current.changedDate,
          ]),
          name: 'ado.work_item.updated',
          timestamp,
          data: stripUndefined({
            organization,
            project,
            workItemId,
            rev: current.rev,
            eventAction: 'updated',
            workItemType: current.workItemType,
            areaPath: current.areaPath,
            state: current.state,
            previousState:
              previous.state !== current.state ? previous.state : undefined,
            assignedTo: current.assignedTo,
            title: truncateEventText(current.title),
            url: current.url,
          }),
        },
      ];
    }

    if (
      this.parsedUri.kind === 'pull-request' &&
      previous.kind === 'pull-request' &&
      current.kind === 'pull-request'
    ) {
      const pullRequestId = this.parsedUri.pullRequestId;
      const events: EventOccurrence[] = [];

      const corePrChanged =
        previous.title !== current.title ||
        previous.status !== current.status ||
        previous.mergeStatus !== current.mergeStatus ||
        previous.isDraft !== current.isDraft ||
        previous.lastCommitId !== current.lastCommitId ||
        previous.votesKey !== current.votesKey;
      const commentsChanged = previous.commentCount !== current.commentCount;

      if (corePrChanged || commentsChanged) {
        const action =
          !corePrChanged && commentsChanged ? 'commented' : 'updated';
        events.push({
          eventId: deterministicEventId('poll-pr', [
            organization,
            project,
            pullRequestId,
            current.title,
            current.status,
            current.mergeStatus,
            current.isDraft,
            current.lastCommitId,
            current.commentCount,
            current.votesKey,
          ]),
          name: 'ado.pull_request.updated',
          timestamp,
          data: stripUndefined({
            organization,
            project,
            repository: current.repository,
            repositoryId: current.repositoryId,
            pullRequestId,
            action,
            status: current.status,
            mergeStatus: current.mergeStatus,
            commentCount: current.commentCount,
            lastCommitId: current.lastCommitId,
            title: truncateEventText(current.title),
            url: current.url,
          }),
        });
      }

      if (previous.statusesKey !== current.statusesKey) {
        events.push({
          eventId: deterministicEventId('poll-pr-checks', [
            organization,
            project,
            pullRequestId,
            current.statusesKey,
          ]),
          name: 'ado.pull_request.checks_changed',
          timestamp,
          data: stripUndefined({
            organization,
            project,
            repository: current.repository,
            repositoryId: current.repositoryId,
            pullRequestId,
            overallState: current.overallCheckState,
            failingPolicies: [],
            failedChecks: [...current.failedChecks],
            url: current.url,
          }),
        });
      }

      return events;
    }

    if (
      this.parsedUri.kind === 'pipeline' &&
      previous.kind === 'pipeline' &&
      current.kind === 'pipeline'
    ) {
      const stagesChanged = previous.stagesKey !== current.stagesKey;
      const changed =
        previous.state !== current.state ||
        previous.result !== current.result ||
        stagesChanged;

      if (!changed) {
        return [];
      }

      let changedStage: PipelineStageSummary | undefined;
      if (stagesChanged) {
        const prevByKey = new Map(previous.stages.map((s) => [s.key, s]));
        for (const st of current.stages) {
          const prev = prevByKey.get(st.key);
          if (!prev || prev.state !== st.state || prev.result !== st.result) {
            changedStage = st;
            break;
          }
        }
      }

      const runId = this.parsedUri.runId;
      return [
        {
          eventId: deterministicEventId('poll-run', [
            organization,
            project,
            runId,
            current.state,
            current.result,
            current.stagesKey,
          ]),
          name: 'ado.pipeline.run_state_changed',
          timestamp,
          data: stripUndefined({
            organization,
            project,
            pipelineId: current.pipelineId,
            pipelineName: current.pipelineName,
            runId,
            buildNumber: current.buildNumber,
            state: current.state,
            result: current.result ?? (changedStage?.result || undefined),
            stageName: changedStage?.name,
            sourceBranch: current.sourceBranch,
            url: current.url,
          }),
        },
      ];
    }

    return [];
  }
}
