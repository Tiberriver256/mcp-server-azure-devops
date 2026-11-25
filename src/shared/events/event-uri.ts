import {
  getOrgNameFromUrl,
  isAzureDevOpsServicesUrl,
} from '../azure-devops-url.ts';
import type { EventOccurrence } from './catalog.ts';

export interface AdoEventResourceTemplate {
  readonly uriTemplate: string;
  readonly name: string;
  readonly description: string;
  readonly mimeType: 'application/json';
}

export const ADO_EVENT_RESOURCE_TEMPLATES: readonly AdoEventResourceTemplate[] =
  [
    {
      uriTemplate: 'ado://{organization}/{project}/events/pull-requests/{prId}',
      name: 'Pull Request Event Feed',
      description:
        'Live triage event feed for an Azure DevOps pull request (status, checks, comments, votes)',
      mimeType: 'application/json',
    },
    {
      uriTemplate: 'ado://{organization}/{project}/events/pipelines/{runId}',
      name: 'Pipeline Run Event Feed',
      description:
        'Live state transition feed for an Azure DevOps pipeline or build run',
      mimeType: 'application/json',
    },
    {
      uriTemplate:
        'ado://{organization}/{project}/events/work-items/{workItemId}',
      name: 'Work Item Event Feed',
      description:
        'Live revision, state, and comment transition feed for an Azure DevOps work item',
      mimeType: 'application/json',
    },
    {
      uriTemplate: 'ado://{organization}/{project}/events/feed',
      name: 'Project Event Feed',
      description:
        'Project-level Azure DevOps event feed populated by webhooks and active watchers',
      mimeType: 'application/json',
    },
  ];

export type ParsedEventResourceUri =
  | {
      readonly kind: 'pull-request';
      readonly organization: string;
      readonly project: string;
      readonly pullRequestId: number;
    }
  | {
      readonly kind: 'pipeline';
      readonly organization: string;
      readonly project: string;
      readonly runId: number;
    }
  | {
      readonly kind: 'work-item';
      readonly organization: string;
      readonly project: string;
      readonly workItemId: number;
    }
  | {
      readonly kind: 'feed';
      readonly organization: string;
      readonly project: string;
    };

function safeDecode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function parsePositiveInt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * Extract the Azure DevOps organization (Services) or collection (Server)
 * name from a resource or container URL, returning `undefined` when it cannot
 * be determined unambiguously.
 */
export function extractOrganizationFromUrl(
  rawUrl: string,
  projectHint?: string,
): string | undefined {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return undefined;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return undefined;
  }

  if (isAzureDevOpsServicesUrl(rawUrl)) {
    return getOrgNameFromUrl(rawUrl);
  }

  const rawSegments = url.pathname.split('/').filter(Boolean);
  const segments: string[] = [];
  for (const seg of rawSegments) {
    const decoded = safeDecode(seg);
    if (decoded === null) {
      return undefined;
    }
    segments.push(decoded);
  }

  if (segments.length === 0) {
    return undefined;
  }

  const projectLower = projectHint?.toLowerCase();
  if (projectLower) {
    for (let i = 1; i < segments.length; i += 1) {
      if (segments[i].toLowerCase() === projectLower) {
        const candidate = segments[i - 1];
        if (candidate.toLowerCase() !== 'tfs') {
          return candidate;
        }
      }
    }
  }

  for (let i = 1; i < segments.length; i += 1) {
    const segLower = segments[i].toLowerCase();
    if (segLower === '_apis' || segLower === '_git') {
      const prev = segments[i - 1];
      if (projectLower && prev.toLowerCase() === projectLower && i > 1) {
        const candidate = segments[i - 2];
        if (candidate.toLowerCase() !== 'tfs') {
          return candidate;
        }
      } else if (prev.toLowerCase() !== 'tfs') {
        return prev;
      }
    }
  }

  if (segments.length <= 2) {
    return getOrgNameFromUrl(rawUrl);
  }

  return undefined;
}

/**
 * Parse an `ado://{organization}/{project}/events/...` MCP resource URI.
 * Returns `null` when the URI is not a valid event resource URI.
 */
export function parseEventResourceUri(
  uriString: string,
): ParsedEventResourceUri | null {
  let uri: URL;
  try {
    uri = new URL(uriString);
  } catch {
    return null;
  }

  if (uri.protocol !== 'ado:') {
    return null;
  }

  const rawPathSegments = uri.pathname.split('/').filter(Boolean);
  const decodedPath: string[] = [];
  for (const segment of rawPathSegments) {
    const decoded = safeDecode(segment);
    if (decoded === null) {
      return null;
    }
    decodedPath.push(decoded);
  }

  const hostOrg = uri.host ? safeDecode(uri.host) : undefined;
  if (hostOrg === null) {
    return null;
  }

  const segments = hostOrg ? [hostOrg, ...decodedPath] : decodedPath;
  if (segments.length < 4 || segments[2] !== 'events') {
    return null;
  }

  const [organization, project, , kindSegment, idSegment, ...extra] = segments;
  if (!organization || !project || extra.length > 0) {
    return null;
  }

  if (kindSegment === 'feed' && idSegment === undefined) {
    return { kind: 'feed', organization, project };
  }

  if (kindSegment === 'pull-requests' && idSegment !== undefined) {
    const pullRequestId = parsePositiveInt(idSegment);
    if (pullRequestId === null) {
      return null;
    }
    return { kind: 'pull-request', organization, project, pullRequestId };
  }

  if (kindSegment === 'pipelines' && idSegment !== undefined) {
    const runId = parsePositiveInt(idSegment);
    if (runId === null) {
      return null;
    }
    return { kind: 'pipeline', organization, project, runId };
  }

  if (kindSegment === 'work-items' && idSegment !== undefined) {
    const workItemId = parsePositiveInt(idSegment);
    if (workItemId === null) {
      return null;
    }
    return { kind: 'work-item', organization, project, workItemId };
  }

  return null;
}

/**
 * Return `true` when `uriString` is a recognized `ado://.../events/...` resource URI.
 */
export function isEventResourceUri(uriString: string): boolean {
  return parseEventResourceUri(uriString) !== null;
}

/**
 * Canonicalize an event resource URI for deduplication keys.
 */
export function canonicalizeEventResourceUri(
  parsed: ParsedEventResourceUri,
): string {
  const org = encodeURIComponent(parsed.organization.toLowerCase());
  const project = encodeURIComponent(parsed.project.toLowerCase());
  switch (parsed.kind) {
    case 'feed':
      return `ado://${org}/${project}/events/feed`;
    case 'pull-request':
      return `ado://${org}/${project}/events/pull-requests/${parsed.pullRequestId}`;
    case 'pipeline':
      return `ado://${org}/${project}/events/pipelines/${parsed.runId}`;
    case 'work-item':
      return `ado://${org}/${project}/events/work-items/${parsed.workItemId}`;
  }
}

function matchesOrganization(
  organization: string,
  data: Record<string, unknown>,
): boolean {
  const explicitOrg =
    typeof data.organization === 'string' && data.organization.length > 0
      ? data.organization
      : undefined;
  const projectHint =
    typeof data.project === 'string' && data.project.length > 0
      ? data.project
      : typeof data.projectId === 'string' && data.projectId.length > 0
        ? data.projectId
        : undefined;
  const urlOrg =
    !explicitOrg && typeof data.url === 'string' && data.url.length > 0
      ? extractOrganizationFromUrl(data.url, projectHint)
      : undefined;
  const candidate = explicitOrg ?? urlOrg;
  if (!candidate) {
    return true;
  }
  return candidate.toLowerCase() === organization.toLowerCase();
}

function matchesProject(
  project: string,
  data: Record<string, unknown>,
): boolean {
  const target = project.toLowerCase();
  if (
    typeof data.project === 'string' &&
    data.project.toLowerCase() === target
  ) {
    return true;
  }
  if (
    typeof data.projectId === 'string' &&
    data.projectId.toLowerCase() === target
  ) {
    return true;
  }
  return false;
}

/**
 * Determine whether an `EventOccurrence` belongs to a parsed `ado://.../events/...` URI.
 */
export function matchesEventResourceUri(
  parsed: ParsedEventResourceUri,
  occurrence: EventOccurrence,
): boolean {
  const data = occurrence.data;
  if (!matchesOrganization(parsed.organization, data)) {
    return false;
  }
  if (!matchesProject(parsed.project, data)) {
    return false;
  }

  switch (parsed.kind) {
    case 'feed':
      return true;
    case 'pull-request':
      return (
        (occurrence.name === 'ado.pull_request.updated' ||
          occurrence.name === 'ado.pull_request.checks_changed') &&
        Number(data.pullRequestId) === parsed.pullRequestId
      );
    case 'pipeline':
      return (
        occurrence.name === 'ado.pipeline.run_state_changed' &&
        Number(data.runId) === parsed.runId
      );
    case 'work-item':
      return (
        occurrence.name === 'ado.work_item.updated' &&
        Number(data.workItemId) === parsed.workItemId
      );
  }
}
