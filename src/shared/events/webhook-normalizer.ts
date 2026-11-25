import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { extractHeader } from '../http/http-client.ts';
import { truncateEventText } from './catalog.ts';
import type { EventOccurrence } from './catalog.ts';

export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024; // 256 KiB

const ALL_ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export type NormalizedWebhookResult =
  | { readonly kind: 'event'; readonly occurrence: EventOccurrence }
  | { readonly kind: 'test'; readonly eventType?: string }
  | {
      readonly kind: 'ignored';
      readonly reason: string;
      readonly eventType?: string;
    };

/**
 * Constant-time, length-safe string comparison over SHA-256 digests.
 * Hashing both sides to fixed 32-byte digests avoids any length side-channel.
 */
function timingSafeEqualString(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a, 'utf8').digest();
  const digestB = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * Verify Azure DevOps Service Hook authentication (fail-closed).
 *
 * Supports three authentication mechanisms using constant-time SHA-256 comparison:
 * 1. `X-ADO-Webhook-Secret: <secret>`
 * 2. `Authorization: Basic <base64(user:secret)>` (validates password portion)
 * 3. `X-Webhook-Signature-256: sha256=<hex>` (HMAC-SHA256 of exact raw body bytes)
 */
export function verifyWebhookAuth(
  headers: unknown,
  rawBody: string | Buffer,
  secret: string,
): boolean {
  if (!secret || secret.length === 0) {
    return false;
  }

  const secretHeader = extractHeader(headers, 'x-ado-webhook-secret');
  if (
    secretHeader !== undefined &&
    timingSafeEqualString(secretHeader, secret)
  ) {
    return true;
  }

  const authHeader = extractHeader(headers, 'authorization');
  if (authHeader !== undefined) {
    const basicMatch = /^Basic\s+(\S+)$/i.exec(authHeader.trim());
    if (basicMatch) {
      try {
        const decoded = Buffer.from(basicMatch[1], 'base64').toString('utf8');
        const colonIdx = decoded.indexOf(':');
        if (colonIdx !== -1) {
          const password = decoded.slice(colonIdx + 1);
          if (timingSafeEqualString(password, secret)) {
            return true;
          }
        }
      } catch {
        // Malformed base64 falls through to false
      }
    }
  }

  const sigHeader = extractHeader(headers, 'x-webhook-signature-256');
  if (sigHeader !== undefined) {
    const sigMatch = /^sha256=([0-9a-f]{64})$/i.exec(sigHeader.trim());
    if (sigMatch) {
      const expectedHex = createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');
      if (timingSafeEqualString(sigMatch[1].toLowerCase(), expectedHex)) {
        return true;
      }
    }
  }

  return false;
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
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

function extractIdentityName(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  return asString(rec.displayName) ?? asString(rec.uniqueName);
}

function extractFieldScalar(
  fields: Record<string, unknown> | undefined,
  key: string,
): unknown {
  if (!fields || !(key in fields)) {
    return undefined;
  }
  const raw = fields[key];
  const rec = asRecord(raw);
  if (rec && 'newValue' in rec) {
    return rec.newValue;
  }
  return raw;
}

function extractFieldOldValue(
  fields: Record<string, unknown> | undefined,
  key: string,
): unknown {
  if (!fields || !(key in fields)) {
    return undefined;
  }
  const rec = asRecord(fields[key]);
  return rec && 'oldValue' in rec ? rec.oldValue : undefined;
}

function extractTimestamp(payload: Record<string, unknown>): string {
  const created = asString(payload.createdDate);
  if (created && !Number.isNaN(Date.parse(created))) {
    return created;
  }
  return new Date().toISOString();
}

function extractEventId(
  payload: Record<string, unknown>,
  eventType: string,
): string {
  const explicitId = asString(payload.id);
  if (explicitId) {
    return explicitId;
  }
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        eventType,
        notificationId: payload.notificationId ?? null,
        createdDate: payload.createdDate ?? null,
        resource: payload.resource ?? null,
      }),
    )
    .digest('hex')
    .slice(0, 24);
  return `wh-${digest}`;
}

function extractProjectInfo(
  payload: Record<string, unknown>,
  resource: Record<string, unknown> | undefined,
): { project?: string; projectId?: string } {
  const containers = asRecord(payload.resourceContainers);
  const containerProject = asRecord(containers?.project);
  const repo = asRecord(resource?.repository);
  const repoProject = asRecord(repo?.project);
  const resProject = asRecord(resource?.project);
  const pr = asRecord(resource?.pullRequest);
  const prRepo = asRecord(pr?.repository);
  const prRepoProject = asRecord(prRepo?.project);
  const revision = asRecord(resource?.revision);
  const revFields = asRecord(revision?.fields);
  const directFields = asRecord(resource?.fields);

  const projectId =
    asString(repoProject?.id) ??
    asString(prRepoProject?.id) ??
    asString(resProject?.id) ??
    asString(containerProject?.id);

  const project =
    asString(repoProject?.name) ??
    asString(prRepoProject?.name) ??
    asString(resProject?.name) ??
    asString(revFields?.['System.TeamProject']) ??
    asString(extractFieldScalar(directFields, 'System.TeamProject')) ??
    asString(containerProject?.name) ??
    projectId;

  return { project, projectId };
}

function isAdoTestEvent(
  payload: Record<string, unknown>,
  resource: Record<string, unknown> | undefined,
  eventTypeLower: string,
): boolean {
  if (eventTypeLower === 'test' || eventTypeLower.startsWith('test.')) {
    return true;
  }
  if (
    asString(payload.subscriptionId) === ALL_ZERO_UUID ||
    asString(payload.id) === ALL_ZERO_UUID
  ) {
    return true;
  }
  if (resource?.isTest === true) {
    return true;
  }
  return false;
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

/**
 * Normalize an Azure DevOps Service Hook JSON payload into a canonical
 * minimal SEP-3415 `EventOccurrence` (or `{ kind: 'test' }` / `{ kind: 'ignored' }`).
 */
export function normalizeAdoWebhookPayload(
  payload: unknown,
): NormalizedWebhookResult {
  const root = asRecord(payload);
  if (!root) {
    return { kind: 'ignored', reason: 'Webhook payload must be a JSON object' };
  }

  const eventType = asString(root.eventType) ?? '';
  const eventTypeLower = eventType.toLowerCase();
  const resource = asRecord(root.resource);

  if (isAdoTestEvent(root, resource, eventTypeLower)) {
    return { kind: 'test', eventType: eventType || undefined };
  }

  if (!eventType) {
    return { kind: 'ignored', reason: 'Missing eventType in webhook payload' };
  }

  if (!resource) {
    return {
      kind: 'ignored',
      reason: 'Missing resource object in webhook payload',
      eventType,
    };
  }

  const eventId = extractEventId(root, eventType);
  const timestamp = extractTimestamp(root);
  const { project, projectId } = extractProjectInfo(root, resource);

  // 1. git.push -> ado.git.pushed
  if (eventTypeLower === 'git.push') {
    const repo = asRecord(resource.repository);
    const refUpdates = Array.isArray(resource.refUpdates)
      ? resource.refUpdates
      : [];
    const firstRef = asRecord(refUpdates[0]);
    const commits = Array.isArray(resource.commits) ? resource.commits : [];
    const firstCommit = asRecord(commits[0]);

    const occurrence: EventOccurrence = {
      eventId,
      name: 'ado.git.pushed',
      timestamp,
      data: stripUndefined({
        project,
        projectId,
        repository: asString(repo?.name),
        repositoryId: asString(repo?.id),
        pushId: asNumber(resource.pushId),
        branch: asString(firstRef?.name),
        commitCount: commits.length,
        headCommitId:
          asString(firstRef?.newObjectId) ?? asString(firstCommit?.commitId),
        pushedBy: extractIdentityName(resource.pushedBy),
        url: asString(resource.url),
      }),
    };
    return { kind: 'event', occurrence };
  }

  // 2. git.pullrequest.* & ms.vss-code.git-pullrequest-comment-event -> ado.pull_request.updated
  if (
    eventTypeLower.startsWith('git.pullrequest.') ||
    eventTypeLower === 'ms.vss-code.git-pullrequest-comment-event'
  ) {
    const isCommentEvent =
      eventTypeLower === 'ms.vss-code.git-pullrequest-comment-event';
    const pr = asRecord(resource.pullRequest) ?? resource;
    const comment = asRecord(resource.comment);
    const repo = asRecord(pr.repository);
    const lastMergeSourceCommit = asRecord(pr.lastMergeSourceCommit);
    const pullRequestId = asNumber(pr.pullRequestId);

    if (pullRequestId === undefined) {
      return {
        kind: 'ignored',
        reason: 'Missing pullRequestId in pull request webhook',
        eventType,
      };
    }

    const action = isCommentEvent
      ? 'commented'
      : eventTypeLower.slice('git.pullrequest.'.length) || 'updated';

    const occurrence: EventOccurrence = {
      eventId,
      name: 'ado.pull_request.updated',
      timestamp,
      data: stripUndefined({
        project,
        projectId,
        repository: asString(repo?.name),
        repositoryId: asString(repo?.id),
        pullRequestId,
        action,
        status: asString(pr.status),
        mergeStatus: asString(pr.mergeStatus),
        lastCommitId: asString(lastMergeSourceCommit?.commitId),
        title: truncateEventText(asString(pr.title)),
        commentPreview: truncateEventText(asString(comment?.content)),
        url: asString(pr.url) ?? asString(resource.url),
      }),
    };
    return { kind: 'event', occurrence };
  }

  // 3. build.complete / ms.vss-pipelines.run-state-changed-event / stage-state-changed-event -> ado.pipeline.run_state_changed
  if (
    eventTypeLower === 'build.complete' ||
    eventTypeLower === 'ms.vss-pipelines.run-state-changed-event' ||
    eventTypeLower === 'ms.vss-pipelines.stage-state-changed-event'
  ) {
    const run = asRecord(resource.run);
    const stage = asRecord(resource.stage);
    const definition = asRecord(resource.definition);
    const pipeline = asRecord(resource.pipeline) ?? asRecord(run?.pipeline);

    const runId = asNumber(run?.id) ?? asNumber(resource.id);
    if (runId === undefined) {
      return {
        kind: 'ignored',
        reason: 'Missing run/build id in pipeline webhook',
        eventType,
      };
    }

    const state =
      asString(stage?.state) ??
      asString(run?.state) ??
      asString(resource.status) ??
      asString(resource.state) ??
      'unknown';

    const occurrence: EventOccurrence = {
      eventId,
      name: 'ado.pipeline.run_state_changed',
      timestamp,
      data: stripUndefined({
        project,
        projectId,
        pipelineId: asNumber(pipeline?.id) ?? asNumber(definition?.id),
        pipelineName: asString(pipeline?.name) ?? asString(definition?.name),
        runId,
        buildNumber:
          asString(resource.buildNumber) ??
          asString(run?.name) ??
          asString(resource.name),
        state,
        result:
          asString(stage?.result) ??
          asString(run?.result) ??
          asString(resource.result),
        stageName: asString(stage?.name),
        sourceBranch:
          asString(resource.sourceBranch) ?? asString(run?.sourceBranch),
        url: asString(run?.url) ?? asString(resource.url),
      }),
    };
    return { kind: 'event', occurrence };
  }

  // 4. workitem.created / workitem.updated / workitem.commented / deleted / restored -> ado.work_item.updated
  if (
    eventTypeLower === 'workitem.created' ||
    eventTypeLower === 'workitem.updated' ||
    eventTypeLower === 'workitem.commented' ||
    eventTypeLower === 'workitem.deleted' ||
    eventTypeLower === 'workitem.restored'
  ) {
    const revision = asRecord(resource.revision);
    const revFields = asRecord(revision?.fields);
    const directFields = asRecord(resource.fields);
    const comment = asRecord(resource.comment);

    const workItemId =
      asNumber(resource.workItemId) ??
      asNumber(revision?.id) ??
      asNumber(resource.id);

    if (workItemId === undefined) {
      return {
        kind: 'ignored',
        reason: 'Missing workItemId in work item webhook',
        eventType,
      };
    }

    const rev = asNumber(resource.rev) ?? asNumber(revision?.rev);
    const titleRaw =
      asString(revFields?.['System.Title']) ??
      asString(extractFieldScalar(directFields, 'System.Title'));
    const stateRaw =
      asString(revFields?.['System.State']) ??
      asString(extractFieldScalar(directFields, 'System.State'));
    const previousState = asString(
      extractFieldOldValue(directFields, 'System.State'),
    );
    const workItemType =
      asString(revFields?.['System.WorkItemType']) ??
      asString(extractFieldScalar(directFields, 'System.WorkItemType'));
    const areaPath =
      asString(revFields?.['System.AreaPath']) ??
      asString(extractFieldScalar(directFields, 'System.AreaPath'));
    const assignedTo =
      extractIdentityName(revFields?.['System.AssignedTo']) ??
      extractIdentityName(
        extractFieldScalar(directFields, 'System.AssignedTo'),
      );
    const commentRaw =
      asString(comment?.text) ??
      asString(extractFieldScalar(directFields, 'System.History'));

    const eventAction = eventTypeLower.slice('workitem.'.length) || 'updated';

    const occurrence: EventOccurrence = {
      eventId,
      name: 'ado.work_item.updated',
      timestamp,
      data: stripUndefined({
        project,
        projectId,
        workItemId,
        rev,
        eventAction,
        workItemType,
        areaPath,
        state: stateRaw,
        previousState,
        assignedTo,
        title: truncateEventText(titleRaw),
        commentPreview: truncateEventText(commentRaw),
        url: asString(revision?.url) ?? asString(resource.url),
      }),
    };
    return { kind: 'event', occurrence };
  }

  return {
    kind: 'ignored',
    reason: `Unsupported Azure DevOps webhook eventType "${eventType}"`,
    eventType,
  };
}
