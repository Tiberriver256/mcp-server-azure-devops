import { z } from 'zod';
import { toJsonSchema } from '../utils/to-json-schema.ts';
import { EventsErrorCode, EventsProtocolError } from './errors.ts';

export const MAX_EVENT_TEXT_LENGTH = 200;

export const CANONICAL_EVENT_NAMES = [
  'ado.pull_request.updated',
  'ado.pull_request.checks_changed',
  'ado.pipeline.run_state_changed',
  'ado.work_item.updated',
  'ado.git.pushed',
] as const;

export type CanonicalEventName = (typeof CANONICAL_EVENT_NAMES)[number];

export type EventDeliveryMode = 'poll' | 'push';

export interface EventOccurrence {
  readonly eventId: string;
  readonly name: CanonicalEventName;
  readonly timestamp: string;
  readonly data: Record<string, unknown>;
}

export interface EventDescriptor {
  readonly name: CanonicalEventName;
  readonly description: string;
  readonly delivery: readonly EventDeliveryMode[];
  readonly inputSchema: Record<string, unknown>;
  readonly payloadSchema: Record<string, unknown>;
}

/**
 * Truncate untrusted event text fields (`title`, `commentPreview`) to at most
 * `maxLength` characters (default 200) while preserving the leading prefix.
 */
export function truncateEventText(
  value: string | undefined | null,
  maxLength: number = MAX_EVENT_TEXT_LENGTH,
): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  if (value.length <= maxLength) {
    return value;
  }
  if (maxLength <= 1) {
    return value.slice(0, Math.max(0, maxLength));
  }
  return `${value.slice(0, maxLength - 1)}\u2026`;
}

const PullRequestUpdatedFilterSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    repositoryId: z.string().min(1).optional(),
    pullRequestId: z.number().int().positive().optional(),
    status: z.string().min(1).optional(),
  })
  .strict();

const PullRequestChecksChangedFilterSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    repositoryId: z.string().min(1).optional(),
    pullRequestId: z.number().int().positive().optional(),
  })
  .strict();

const PipelineRunStateChangedFilterSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    pipelineId: z.number().int().positive().optional(),
    runId: z.number().int().positive().optional(),
    branch: z.string().min(1).optional(),
  })
  .strict();

const WorkItemUpdatedFilterSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    workItemId: z.number().int().positive().optional(),
    workItemType: z.string().min(1).optional(),
    areaPath: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
  })
  .strict();

const GitPushedFilterSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    repositoryId: z.string().min(1).optional(),
    branch: z.string().min(1).optional(),
  })
  .strict();

const PullRequestUpdatedPayloadSchema = z.object({
  project: z.string().optional(),
  projectId: z.string().optional(),
  repository: z.string().optional(),
  repositoryId: z.string().optional(),
  pullRequestId: z.number().int(),
  action: z.string(),
  status: z.string().optional(),
  mergeStatus: z.string().optional(),
  commentCount: z.number().int().optional(),
  lastCommitId: z.string().optional(),
  title: z.string().max(MAX_EVENT_TEXT_LENGTH).optional(),
  commentPreview: z.string().max(MAX_EVENT_TEXT_LENGTH).optional(),
  url: z.string().optional(),
});

const PullRequestChecksChangedPayloadSchema = z.object({
  project: z.string().optional(),
  projectId: z.string().optional(),
  repository: z.string().optional(),
  repositoryId: z.string().optional(),
  pullRequestId: z.number().int(),
  overallState: z.string(),
  failingPolicies: z.array(z.string()),
  failedChecks: z.array(z.string()),
  url: z.string().optional(),
});

const PipelineRunStateChangedPayloadSchema = z.object({
  project: z.string().optional(),
  projectId: z.string().optional(),
  pipelineId: z.number().int().optional(),
  pipelineName: z.string().optional(),
  runId: z.number().int(),
  buildNumber: z.string().optional(),
  state: z.string(),
  result: z.string().optional(),
  stageName: z.string().optional(),
  sourceBranch: z.string().optional(),
  url: z.string().optional(),
});

const WorkItemUpdatedPayloadSchema = z.object({
  project: z.string().optional(),
  projectId: z.string().optional(),
  workItemId: z.number().int(),
  rev: z.number().int().optional(),
  eventAction: z.string(),
  workItemType: z.string().optional(),
  areaPath: z.string().optional(),
  state: z.string().optional(),
  previousState: z.string().optional(),
  assignedTo: z.string().optional(),
  title: z.string().max(MAX_EVENT_TEXT_LENGTH).optional(),
  commentPreview: z.string().max(MAX_EVENT_TEXT_LENGTH).optional(),
  url: z.string().optional(),
});

const GitPushedPayloadSchema = z.object({
  project: z.string().optional(),
  projectId: z.string().optional(),
  repository: z.string().optional(),
  repositoryId: z.string().optional(),
  pushId: z.number().int().optional(),
  branch: z.string().optional(),
  commitCount: z.number().int(),
  headCommitId: z.string().optional(),
  pushedBy: z.string().optional(),
  url: z.string().optional(),
});

interface EventCatalogEntry {
  readonly name: CanonicalEventName;
  readonly description: string;
  readonly delivery: readonly EventDeliveryMode[];
  readonly filterSchema: z.ZodType<Record<string, unknown>>;
  readonly payloadZodSchema: z.ZodType;
}

const EVENT_CATALOG_ENTRIES: readonly EventCatalogEntry[] = [
  {
    name: 'ado.pull_request.updated',
    description:
      'Emitted when an Azure DevOps pull request is created, updated, commented on, voted on, or merged.',
    delivery: ['poll', 'push'],
    filterSchema: PullRequestUpdatedFilterSchema,
    payloadZodSchema: PullRequestUpdatedPayloadSchema,
  },
  {
    name: 'ado.pull_request.checks_changed',
    description:
      'Emitted when Azure DevOps pull request status checks or branch policy evaluations change.',
    delivery: ['poll', 'push'],
    filterSchema: PullRequestChecksChangedFilterSchema,
    payloadZodSchema: PullRequestChecksChangedPayloadSchema,
  },
  {
    name: 'ado.pipeline.run_state_changed',
    description:
      'Emitted when an Azure DevOps pipeline or build run or stage changes state or completes.',
    delivery: ['poll', 'push'],
    filterSchema: PipelineRunStateChangedFilterSchema,
    payloadZodSchema: PipelineRunStateChangedPayloadSchema,
  },
  {
    name: 'ado.work_item.updated',
    description:
      'Emitted when an Azure DevOps work item is created, revised, commented on, or transitions state.',
    delivery: ['poll', 'push'],
    filterSchema: WorkItemUpdatedFilterSchema,
    payloadZodSchema: WorkItemUpdatedPayloadSchema,
  },
  {
    name: 'ado.git.pushed',
    description:
      'Emitted when commits are pushed to an Azure DevOps Git repository branch.',
    delivery: ['poll', 'push'],
    filterSchema: GitPushedFilterSchema,
    payloadZodSchema: GitPushedPayloadSchema,
  },
];

const EVENT_CATALOG_MAP = new Map<string, EventCatalogEntry>(
  EVENT_CATALOG_ENTRIES.map((entry) => [entry.name, entry]),
);

let cachedDescriptors: readonly EventDescriptor[] | null = null;

export function isCanonicalEventName(name: string): name is CanonicalEventName {
  return EVENT_CATALOG_MAP.has(name);
}

/**
 * Return all 5 canonical SEP-3415 event descriptors with draft-07 JSON Schemas.
 */
export function listCanonicalEventDescriptors(): readonly EventDescriptor[] {
  if (!cachedDescriptors) {
    cachedDescriptors = EVENT_CATALOG_ENTRIES.map((entry) => ({
      name: entry.name,
      description: entry.description,
      delivery: [...entry.delivery],
      inputSchema: toJsonSchema(entry.filterSchema),
      payloadSchema: toJsonSchema(entry.payloadZodSchema),
    }));
  }
  return cachedDescriptors;
}

/**
 * Validate event name and filter arguments against the event's Zod schema.
 *
 * - Unknown event name -> `EventsProtocolError(-32023)` (NotFound)
 * - Invalid filter argument type or unknown key -> `EventsProtocolError(-32602)` (InvalidParams)
 */
export function validateEventFilterArguments(
  eventName: string,
  args: unknown = {},
): Record<string, unknown> {
  const entry = EVENT_CATALOG_MAP.get(eventName);
  if (!entry) {
    throw new EventsProtocolError(
      EventsErrorCode.NotFound,
      `Unknown event type "${eventName}"`,
      { name: eventName },
    );
  }

  const candidate = args === undefined || args === null ? {} : args;
  if (typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new EventsProtocolError(
      EventsErrorCode.InvalidParams,
      `Event filter arguments for "${eventName}" must be an object`,
      { name: eventName },
    );
  }

  const parsed = entry.filterSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new EventsProtocolError(
      EventsErrorCode.InvalidParams,
      `Invalid filter arguments for "${eventName}": ${parsed.error.issues
        .map(
          (issue) => `${issue.path.join('.') || 'arguments'}: ${issue.message}`,
        )
        .join('; ')}`,
      { name: eventName, issues: parsed.error.issues },
    );
  }

  return parsed.data;
}

function equalsIgnoreCase(a: unknown, b: string): boolean {
  return typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
}

function normalizeBranchName(branch: string): string {
  return branch.replace(/^refs\/heads\//i, '').toLowerCase();
}

function matchesBranch(actual: unknown, expected: string): boolean {
  if (typeof actual !== 'string' || actual.length === 0) {
    return false;
  }
  return (
    actual.toLowerCase() === expected.toLowerCase() ||
    normalizeBranchName(actual) === normalizeBranchName(expected)
  );
}

function matchesAreaPath(actual: unknown, expected: string): boolean {
  if (typeof actual !== 'string' || actual.length === 0) {
    return false;
  }
  const actualLower = actual.toLowerCase();
  const expectedLower = expected.toLowerCase();
  return (
    actualLower === expectedLower ||
    actualLower.startsWith(`${expectedLower}\\`)
  );
}

/**
 * Evaluate whether an `EventOccurrence` matches validated SEP-3415 filter arguments.
 */
export function matchesEventFilter(
  occurrence: EventOccurrence,
  args: Record<string, unknown> = {},
): boolean {
  const data = occurrence.data;

  if (typeof args.projectId === 'string') {
    const matchesProject =
      equalsIgnoreCase(data.project, args.projectId) ||
      equalsIgnoreCase(data.projectId, args.projectId);
    if (!matchesProject) {
      return false;
    }
  }

  if (typeof args.repositoryId === 'string') {
    const matchesRepo =
      equalsIgnoreCase(data.repository, args.repositoryId) ||
      equalsIgnoreCase(data.repositoryId, args.repositoryId);
    if (!matchesRepo) {
      return false;
    }
  }

  if (typeof args.pullRequestId === 'number') {
    if (Number(data.pullRequestId) !== args.pullRequestId) {
      return false;
    }
  }

  if (typeof args.pipelineId === 'number') {
    if (Number(data.pipelineId) !== args.pipelineId) {
      return false;
    }
  }

  if (typeof args.runId === 'number') {
    if (Number(data.runId) !== args.runId) {
      return false;
    }
  }

  if (typeof args.workItemId === 'number') {
    if (Number(data.workItemId) !== args.workItemId) {
      return false;
    }
  }

  if (typeof args.branch === 'string') {
    const candidateBranch = data.branch ?? data.sourceBranch;
    if (!matchesBranch(candidateBranch, args.branch)) {
      return false;
    }
  }

  if (typeof args.status === 'string') {
    if (!equalsIgnoreCase(data.status, args.status)) {
      return false;
    }
  }

  if (typeof args.state === 'string') {
    if (!equalsIgnoreCase(data.state, args.state)) {
      return false;
    }
  }

  if (typeof args.workItemType === 'string') {
    if (!equalsIgnoreCase(data.workItemType, args.workItemType)) {
      return false;
    }
  }

  if (typeof args.areaPath === 'string') {
    if (!matchesAreaPath(data.areaPath, args.areaPath)) {
      return false;
    }
  }

  return true;
}

/**
 * Sanitize untrusted string fields (`title`, `commentPreview`) in an occurrence
 * so no occurrence stored in the ring buffer can exceed `MAX_EVENT_TEXT_LENGTH`.
 */
export function sanitizeEventOccurrence(
  occurrence: EventOccurrence,
): EventOccurrence {
  const data = occurrence.data;
  const rawTitle = data.title;
  const rawComment = data.commentPreview;

  const needsTitleTrunc =
    typeof rawTitle === 'string' && rawTitle.length > MAX_EVENT_TEXT_LENGTH;
  const needsCommentTrunc =
    typeof rawComment === 'string' && rawComment.length > MAX_EVENT_TEXT_LENGTH;

  if (!needsTitleTrunc && !needsCommentTrunc) {
    return occurrence;
  }

  return {
    ...occurrence,
    data: {
      ...data,
      ...(needsTitleTrunc ? { title: truncateEventText(rawTitle) } : {}),
      ...(needsCommentTrunc
        ? { commentPreview: truncateEventText(rawComment) }
        : {}),
    },
  };
}
