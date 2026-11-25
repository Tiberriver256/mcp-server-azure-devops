import type { ToolContext } from '../../shared/session/azure-devops-session.ts';

export const SEARCH_AREA = 'search';
export const CODE_SEARCH_LOCATION_ID = 'e7f29993-5b82-4fca-9386-f5cfe683d524';
export const WIKI_SEARCH_LOCATION_ID = 'e90e7664-7049-4100-9a86-66b161d81080';
export const WORK_ITEM_SEARCH_LOCATION_ID =
  '73b2c9e2-ff9e-4447-8cda-5f5b21ff7cae';

const OPTIONS_TIMEOUT_MS = 10_000;
const MAX_CACHE_ENTRIES = 64;

export interface SearchApiResourceLocation {
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

const searchAreaCache = new Map<
  string,
  Promise<Map<string, SearchApiResourceLocation> | null>
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

export function negotiateSearchVersionFromLocation(
  location: SearchApiResourceLocation,
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

function toSearchResourceLocation(
  item: unknown,
): SearchApiResourceLocation | null {
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
): Map<string, SearchApiResourceLocation> | null {
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
  const map = new Map<string, SearchApiResourceLocation>();
  for (const item of value) {
    const loc = toSearchResourceLocation(item);
    const id = loc?.id?.trim().toLowerCase();
    if (loc && id && id.length > 0) {
      map.set(id, loc);
    }
  }
  return map;
}

async function fetchSearchAreaLocations(
  session: ToolContext,
  searchBaseUrl: string,
): Promise<Map<string, SearchApiResourceLocation> | null> {
  const normalizedBase = searchBaseUrl.replace(/\/+$/, '');
  const cacheKey = `${normalizedBase.toLowerCase()}|${SEARCH_AREA}`;
  const existing = searchAreaCache.get(cacheKey);
  if (existing) {
    return await existing;
  }

  if (searchAreaCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = searchAreaCache.keys().next().value;
    if (oldestKey !== undefined) {
      searchAreaCache.delete(oldestKey);
    }
  }

  const pending = (async (): Promise<Map<
    string,
    SearchApiResourceLocation
  > | null> => {
    try {
      const authHeader = await session.getAuthHeader();
      const optionsUrl = `${normalizedBase}/_apis/${SEARCH_AREA}`;
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
        searchAreaCache.delete(cacheKey);
        return null;
      }

      const payload: unknown = await response.json();
      const locations = parseOptionsLocations(payload);
      if (locations === null) {
        searchAreaCache.delete(cacheKey);
        return null;
      }
      return locations;
    } catch {
      searchAreaCache.delete(cacheKey);
      return null;
    }
  })();

  searchAreaCache.set(cacheKey, pending);
  return await pending;
}

/**
 * Negotiate the `api-version` for an Azure DevOps Search endpoint via cached
 * `OPTIONS {searchBaseUrl}/_apis/search`.
 * Resolves `5.0-preview.1` on Server 2019, `6.0-preview.1` on Server 2020,
 * `7.0` on Server 2022, and `7.1` on Services, falling back to `session.config.apiVersion`
 * if `OPTIONS` is unavailable.
 */
export async function negotiateSearchApiVersion(
  session: ToolContext,
  searchBaseUrl: string,
  locationId: string,
  resourceName: string,
): Promise<string> {
  const fallback = session.config.apiVersion;
  const locations = await fetchSearchAreaLocations(session, searchBaseUrl);
  if (!locations) {
    return fallback;
  }

  let location = locations.get(locationId.toLowerCase());
  if (!location) {
    const lowerName = resourceName.toLowerCase();
    for (const entry of locations.values()) {
      if (entry.resourceName?.toLowerCase() === lowerName) {
        location = entry;
        break;
      }
    }
  }

  if (!location) {
    return fallback;
  }

  return negotiateSearchVersionFromLocation(location, fallback);
}

export function clearSearchApiVersionCache(): void {
  searchAreaCache.clear();
}
