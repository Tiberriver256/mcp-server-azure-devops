import { AzureDevOpsValidationError } from '../../shared/errors/index.ts';

export const PIPELINES_AREA = 'pipelines';
export const PIPELINES_LOCATION_ID = '28e1305e-2afe-47bf-abaf-cbb0e6a91988';
export const PIPELINE_RUNS_LOCATION_ID = '7859261e-d2e9-4a68-b820-a5d84cc5bb3d';

export const BUILD_AREA = 'build';
export const BUILD_TIMELINE_LOCATION_ID =
  '8baac422-4c6e-4de5-8532-db96d92acffa';
export const BUILD_LOGS_LOCATION_ID = '35a80daf-7f30-45fc-86e8-6b813d9c90df';

export const PIPELINES_UNSUPPORTED_ERROR_MESSAGE =
  'Azure DevOps Pipelines YAML API is not available on this server (Azure DevOps Server 2019 / API version 5.0 does not support _apis/pipelines). It requires Azure DevOps Server 2020 (API version 6.0-preview.1) or later, or Azure DevOps Services. For classic builds on Server 2019, use Build-based tools such as pipeline_timeline, get_pipeline_log, or get_build_test_results.';

export interface ApiResourceLocationLike {
  readonly id?: string;
  readonly area?: string;
  readonly resourceName?: string;
  readonly routeTemplate?: string;
  readonly resourceVersion?: number;
  readonly minVersion?: string;
  readonly maxVersion?: string;
  readonly releasedVersion?: string;
}

export interface VsoClientLike {
  beginGetLocation?: (
    area: string,
    locationId: string,
  ) => Promise<ApiResourceLocationLike | undefined>;
  restClient?: {
    options?: <T>(
      requestUrl: string,
    ) => Promise<{ statusCode: number; result: T | null }>;
  };
}

export interface ApiClientWithVsoClient {
  vsoClient?: VsoClientLike;
}

interface ParsedApiVersion {
  readonly major: number;
  readonly minor: number;
  readonly isPreview: boolean;
  readonly previewNum?: number;
}

const MAX_CACHE_ENTRIES = 64;
const areaLocationsCache = new Map<
  string,
  Promise<Map<string, ApiResourceLocationLike> | null>
>();
const singleLocationCache = new Map<
  string,
  Promise<ApiResourceLocationLike | null | undefined>
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

/**
 * Negotiate an Azure DevOps `api-version` string against a server-advertised
 * `ApiResourceLocation`, downgrading above server maxVersion and adding `-preview.N`
 * when the endpoint is preview-only (`releasedVersion === '0.0'`).
 */
export function negotiateVersionFromLocation(
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

function toApiResourceLocation(item: unknown): ApiResourceLocationLike | null {
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

function parseOptionsCatalog(
  payload: unknown,
): Map<string, ApiResourceLocationLike> | null {
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
  const map = new Map<string, ApiResourceLocationLike>();
  for (const item of value) {
    const loc = toApiResourceLocation(item);
    const id = loc?.id?.trim().toLowerCase();
    if (loc && id && id.length > 0) {
      map.set(id, loc);
    }
  }
  return map;
}

function findLocationInMap(
  locations: Map<string, ApiResourceLocationLike>,
  locationId: string,
  resourceName: string,
): ApiResourceLocationLike | undefined {
  const byId = locations.get(locationId.toLowerCase());
  if (byId) {
    return byId;
  }
  const lowerName = resourceName.toLowerCase();
  for (const entry of locations.values()) {
    if (entry.resourceName?.toLowerCase() === lowerName) {
      return entry;
    }
  }
  return undefined;
}

async function getCachedAreaLocations(
  vsoClient: VsoClientLike,
  baseUrl: string,
  area: string,
): Promise<Map<string, ApiResourceLocationLike> | null> {
  const restClient = vsoClient.restClient;
  if (!restClient || typeof restClient.options !== 'function') {
    return null;
  }

  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedArea = area.trim().toLowerCase();
  const cacheKey = `${normalizedBase.toLowerCase()}|${normalizedArea}`;
  const existing = areaLocationsCache.get(cacheKey);
  if (existing) {
    return await existing;
  }

  if (areaLocationsCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = areaLocationsCache.keys().next().value;
    if (oldestKey !== undefined) {
      areaLocationsCache.delete(oldestKey);
    }
  }

  const optionsUrl = `${normalizedBase}/_apis/${encodeURIComponent(normalizedArea)}`;
  const pending = Promise.resolve()
    .then(() => restClient.options?.(optionsUrl))
    .then((res) => {
      if (!res || res.statusCode !== 200) {
        areaLocationsCache.delete(cacheKey);
        return null;
      }
      const map = parseOptionsCatalog(res.result);
      if (map === null) {
        areaLocationsCache.delete(cacheKey);
        return null;
      }
      return map;
    })
    .catch(() => {
      areaLocationsCache.delete(cacheKey);
      return null;
    });

  areaLocationsCache.set(cacheKey, pending);
  return await pending;
}

async function getCachedSingleLocation(
  vsoClient: VsoClientLike,
  baseUrl: string,
  area: string,
  locationId: string,
): Promise<
  { ok: true; location: ApiResourceLocationLike | undefined } | { ok: false }
> {
  if (typeof vsoClient.beginGetLocation !== 'function') {
    return { ok: false };
  }

  const normalizedBase = baseUrl.replace(/\/+$/, '').toLowerCase();
  const cacheKey = `${normalizedBase}|${area.toLowerCase()}|${locationId.toLowerCase()}`;
  const existing = singleLocationCache.get(cacheKey);
  if (existing) {
    const resolved = await existing;
    return resolved === null ? { ok: false } : { ok: true, location: resolved };
  }

  if (singleLocationCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = singleLocationCache.keys().next().value;
    if (oldestKey !== undefined) {
      singleLocationCache.delete(oldestKey);
    }
  }

  const pending = Promise.resolve()
    .then(() => vsoClient.beginGetLocation?.(area, locationId))
    .catch(() => {
      singleLocationCache.delete(cacheKey);
      return null;
    });

  singleLocationCache.set(cacheKey, pending);
  const resolved = await pending;
  return resolved === null ? { ok: false } : { ok: true, location: resolved };
}

export interface NegotiatePipelineApiVersionOptions {
  readonly apiClient: ApiClientWithVsoClient;
  readonly baseUrl: string;
  readonly area: string;
  readonly locationId: string;
  readonly resourceName: string;
  readonly fallbackApiVersion: string;
  readonly missingLocationErrorMessage?: string;
}

/**
 * Negotiate an endpoint-specific `api-version` via `VsoClient` `OPTIONS /_apis/{area}`.
 * - Caches area catalogs per `(baseUrl, area)` so `OPTIONS` runs once per area.
 * - Throws `AzureDevOpsValidationError` when `OPTIONS` succeeds and the endpoint is absent
 *   (e.g., `_apis/pipelines` on Azure DevOps Server 2019).
 * - Gracefully falls back to `fallbackApiVersion` when `vsoClient` is absent (unit-test mocks)
 *   or `OPTIONS` fails transiently.
 */
export async function negotiatePipelineApiVersion(
  options: NegotiatePipelineApiVersionOptions,
): Promise<string> {
  const {
    apiClient,
    baseUrl,
    area,
    locationId,
    resourceName,
    fallbackApiVersion,
    missingLocationErrorMessage,
  } = options;

  const vsoClient = apiClient.vsoClient;
  if (!vsoClient) {
    return fallbackApiVersion;
  }

  if (
    vsoClient.restClient &&
    typeof vsoClient.restClient.options === 'function'
  ) {
    const locations = await getCachedAreaLocations(vsoClient, baseUrl, area);
    if (locations === null) {
      return fallbackApiVersion;
    }
    const location = findLocationInMap(locations, locationId, resourceName);
    if (!location) {
      if (missingLocationErrorMessage) {
        throw new AzureDevOpsValidationError(missingLocationErrorMessage);
      }
      return fallbackApiVersion;
    }
    return negotiateVersionFromLocation(location, fallbackApiVersion);
  }

  if (typeof vsoClient.beginGetLocation === 'function') {
    const lookup = await getCachedSingleLocation(
      vsoClient,
      baseUrl,
      area,
      locationId,
    );
    if (!lookup.ok) {
      return fallbackApiVersion;
    }
    if (!lookup.location) {
      if (missingLocationErrorMessage) {
        throw new AzureDevOpsValidationError(missingLocationErrorMessage);
      }
      return fallbackApiVersion;
    }
    return negotiateVersionFromLocation(lookup.location, fallbackApiVersion);
  }

  return fallbackApiVersion;
}

/**
 * Detect `VsoClient.getVersioningData` failures caused by `_apis/pipelines` being absent
 * on Azure DevOps Server 2019 (5.0).
 */
export function isUnsupportedPipelinesLocationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const msg = error.message;
  return (
    /failed to find api location.*area:\s*pipelines/i.test(msg) ||
    msg.toLowerCase().includes(PIPELINES_LOCATION_ID) ||
    msg.toLowerCase().includes(PIPELINE_RUNS_LOCATION_ID)
  );
}

export function clearPipelineApiVersionCache(): void {
  areaLocationsCache.clear();
  singleLocationCache.clear();
}
