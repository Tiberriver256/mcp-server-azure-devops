import { AzureDevOpsValidationError } from '../../shared/errors/index.ts';
import type { ToolContext } from '../../shared/session/azure-devops-session.ts';

export const CORE_AREA = 'core';
export const CORE_PROJECTS_LOCATION_ID = '603fe2ac-9723-48b9-88ad-09305aa6c6e1';

export const WIKI_AREA = 'wiki';
export const WIKI_WIKIS_LOCATION_ID = '288d122c-dbd4-451d-aa5f-7dbbba070728';
export const WIKI_PAGES_LOCATION_ID = '25d3fbc7-fe3d-46cb-b5a5-0b6f79caf27b';
export const WIKI_PAGES_BATCH_LOCATION_ID =
  '32e4214e-09a0-4673-a10d-619091005a33';

export const WIKI_PAGES_BATCH_UNSUPPORTED_MESSAGE =
  'Listing wiki pages (wiki/pagesbatch) is not available on this server (Azure DevOps Server 2019 / API version 5.0 does not support _apis/wiki/.../pagesbatch). It requires Azure DevOps Server 2020 (API version 6.0-preview.1) or later, or Azure DevOps Services.';

const OPTIONS_TIMEOUT_MS = 10_000;
const MAX_CACHE_ENTRIES = 64;

export interface WikiApiResourceLocation {
  readonly id?: string;
  readonly area?: string;
  readonly resourceName?: string;
  readonly routeTemplate?: string;
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

const wikiAreaCache = new Map<
  string,
  Promise<Map<string, WikiApiResourceLocation> | null>
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

function compareVersions(
  a: { readonly major: number; readonly minor: number },
  b: { readonly major: number; readonly minor: number },
): number {
  return a.major !== b.major ? a.major - b.major : a.minor - b.minor;
}

export function negotiateWikiVersionFromLocation(
  location: WikiApiResourceLocation,
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
    released && compareVersions(released, max) >= 0
      ? `${released.major}.${released.minor}`
      : `${max.major}.${max.minor}-preview.${rv}`;

  const req = parseApiVersion(requestedVersion);
  if (!req) {
    return latestVersion();
  }

  if (min && compareVersions(req, min) < 0) {
    return latestVersion();
  }

  if (!req.isPreview) {
    if (released !== null) {
      const target = compareVersions(req, released) <= 0 ? req : released;
      return `${target.major}.${target.minor}`;
    }
    const target = compareVersions(req, max) <= 0 ? req : max;
    return `${target.major}.${target.minor}-preview.${rv}`;
  }

  if (compareVersions(req, max) <= 0) {
    const num =
      req.previewNum !== undefined && req.previewNum <= rv
        ? req.previewNum
        : rv;
    return `${req.major}.${req.minor}-preview.${num}`;
  }

  return latestVersion();
}

function toWikiResourceLocation(item: unknown): WikiApiResourceLocation | null {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return null;
  }
  const rec = Object.fromEntries(Object.entries(item));
  return {
    id: typeof rec.id === 'string' ? rec.id : undefined,
    area: typeof rec.area === 'string' ? rec.area : undefined,
    resourceName:
      typeof rec.resourceName === 'string' ? rec.resourceName : undefined,
    routeTemplate:
      typeof rec.routeTemplate === 'string' ? rec.routeTemplate : undefined,
    resourceVersion:
      typeof rec.resourceVersion === 'number' ? rec.resourceVersion : undefined,
    minVersion: typeof rec.minVersion === 'string' ? rec.minVersion : undefined,
    maxVersion: typeof rec.maxVersion === 'string' ? rec.maxVersion : undefined,
    releasedVersion:
      typeof rec.releasedVersion === 'string' ? rec.releasedVersion : undefined,
  };
}

function parseOptionsLocations(
  payload: unknown,
): Map<string, WikiApiResourceLocation> | null {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return null;
  }
  const value = 'value' in payload ? payload.value : undefined;
  if (!Array.isArray(value)) {
    return null;
  }
  const map = new Map<string, WikiApiResourceLocation>();
  for (const item of value) {
    const loc = toWikiResourceLocation(item);
    const id = loc?.id?.trim().toLowerCase();
    if (loc && id && id.length > 0) {
      map.set(id, loc);
    }
  }
  return map;
}

async function fetchAreaLocations(
  session: ToolContext,
  baseUrl: string,
  area: string,
): Promise<Map<string, WikiApiResourceLocation> | null> {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedArea = area.trim().toLowerCase();
  const cacheKey = `${normalizedBase.toLowerCase()}|${normalizedArea}`;
  const existing = wikiAreaCache.get(cacheKey);
  if (existing) {
    return await existing;
  }

  if (wikiAreaCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = wikiAreaCache.keys().next().value;
    if (oldestKey !== undefined) {
      wikiAreaCache.delete(oldestKey);
    }
  }

  const pending = (async (): Promise<Map<
    string,
    WikiApiResourceLocation
  > | null> => {
    try {
      const authHeader = await session.getAuthHeader();
      const optionsUrl = `${normalizedBase}/_apis/${encodeURIComponent(normalizedArea)}`;
      const response = await globalThis.fetch(optionsUrl, {
        method: 'OPTIONS',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(OPTIONS_TIMEOUT_MS),
      });

      const contentType = (
        response.headers.get('content-type') ?? ''
      ).toLowerCase();
      if (response.status !== 200 || contentType.includes('text/html')) {
        await response.body?.cancel().catch(() => undefined);
        wikiAreaCache.delete(cacheKey);
        return null;
      }

      const payload: unknown = await response.json();
      const locations = parseOptionsLocations(payload);
      if (locations === null) {
        wikiAreaCache.delete(cacheKey);
        return null;
      }
      return locations;
    } catch {
      wikiAreaCache.delete(cacheKey);
      return null;
    }
  })();

  wikiAreaCache.set(cacheKey, pending);
  return await pending;
}

export interface NegotiateWikiApiVersionOptions {
  readonly area: string;
  readonly locationId: string;
  readonly resourceName: string;
  readonly missingLocationErrorMessage?: string;
}

/**
 * Negotiate an endpoint-specific `api-version` via cached `OPTIONS {baseUrl}/_apis/{area}`.
 * - Resolves `5.0` / `6.0` / `7.0` / `7.1` for GA endpoints (`wikis`, `pages`, `projects`)
 *   and `6.0-preview.1` / `7.0` / `7.1` for `pagesbatch`.
 * - Throws `AzureDevOpsValidationError` when `OPTIONS` returns a valid catalog without
 *   the requested location and `missingLocationErrorMessage` is provided (e.g., `pagesbatch` on Server 2019).
 * - Gracefully falls back to `session.config.apiVersion` if `OPTIONS` is unavailable.
 */
export async function negotiateWikiApiVersion(
  session: ToolContext,
  baseUrl: string,
  options: NegotiateWikiApiVersionOptions,
): Promise<string> {
  const fallback = session.config.apiVersion;
  const locations = await fetchAreaLocations(session, baseUrl, options.area);
  if (locations === null) {
    return fallback;
  }

  let location = locations.get(options.locationId.toLowerCase());
  if (!location) {
    const lowerName = options.resourceName.toLowerCase();
    for (const entry of locations.values()) {
      if (entry.resourceName?.toLowerCase() === lowerName) {
        location = entry;
        break;
      }
    }
  }

  if (!location) {
    if (options.missingLocationErrorMessage) {
      throw new AzureDevOpsValidationError(options.missingLocationErrorMessage);
    }
    return fallback;
  }

  return negotiateWikiVersionFromLocation(location, fallback);
}

export function clearWikiApiVersionCache(): void {
  wikiAreaCache.clear();
}
