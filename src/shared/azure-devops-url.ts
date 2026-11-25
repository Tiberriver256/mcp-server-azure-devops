import { AzureDevOpsValidationError } from './errors';

export type AzureDevOpsUrlType = 'services' | 'server';

export interface AzureDevOpsBaseUrls {
  type: AzureDevOpsUrlType;
  organization?: string;
  collection?: string;
  instanceBaseUrl?: string;
  coreBaseUrl: string;
  searchBaseUrl: string;
  projectFromUrl?: string;
}

export interface AzureDevOpsUrlOptions {
  organizationId?: string;
  projectId?: string;
}

const DEV_AZURE_HOST = 'dev.azure.com';
const SEARCH_HOST = 'almsearch.dev.azure.com';
const VSTS_HOST_SUFFIX = '.visualstudio.com';

export function resolveAzureDevOpsBaseUrls(
  serverUrl: string,
  options: AzureDevOpsUrlOptions = {},
): AzureDevOpsBaseUrls {
  const url = parseUrl(serverUrl);
  const hostname = url.hostname.toLowerCase();

  if (isServicesHost(hostname)) {
    const organization =
      options.organizationId ?? extractServicesOrganization(url);

    if (!organization) {
      throw new AzureDevOpsValidationError(
        'Could not extract organization from Azure DevOps Services URL',
      );
    }

    return {
      type: 'services',
      organization,
      coreBaseUrl: `https://${DEV_AZURE_HOST}/${organization}`,
      searchBaseUrl: `https://${SEARCH_HOST}/${organization}`,
    };
  }

  const serverInfo = extractServerInfo(url, options.projectId);
  const collection = serverInfo.collection ?? options.organizationId;

  if (!collection) {
    throw new AzureDevOpsValidationError(
      'Azure DevOps Server URL must include a collection',
    );
  }

  const instanceBaseUrl = buildBaseUrl(url.origin, serverInfo.instanceSegments);
  const coreBaseUrl = joinUrl(instanceBaseUrl, collection);

  return {
    type: 'server',
    collection,
    instanceBaseUrl,
    coreBaseUrl,
    searchBaseUrl: coreBaseUrl,
    projectFromUrl: serverInfo.projectFromUrl,
  };
}

export function isAzureDevOpsServicesUrl(serverUrl: string): boolean {
  try {
    const url = new URL(serverUrl);
    return isServicesHost(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Format an Azure DevOps organization URL safely for logs:
 * host + pathname only, stripping any embedded userinfo credentials, query string, or hash.
 */
export function formatOrgUrlForLog(organizationUrl: string): string {
  if (!organizationUrl) {
    return '(not set)';
  }
  try {
    const url = new URL(organizationUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '(invalid org URL)';
    }
    const pathname = url.pathname.replace(/\/+$/, '');
    return `${url.host}${pathname}` || url.host;
  } catch {
    return '(invalid org URL)';
  }
}

/**
 * Extract the organization (Services) or collection (Server) name from an
 * Azure DevOps URL, returning undefined when extraction fails.
 */
export function getOrgNameFromUrl(url?: string): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const resolved = resolveAzureDevOpsBaseUrls(url);
    return resolved.organization ?? resolved.collection;
  } catch {
    return undefined;
  }
}

function parseUrl(input: string): URL {
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new AzureDevOpsValidationError(
        'Organization URL must start with http:// or https://',
      );
    }
    return url;
  } catch (error) {
    if (error instanceof AzureDevOpsValidationError) {
      throw error;
    }
    throw new AzureDevOpsValidationError(
      'Organization URL must include a valid http or https scheme',
    );
  }
}

function isServicesHost(hostname: string): boolean {
  return hostname === DEV_AZURE_HOST || hostname.endsWith(VSTS_HOST_SUFFIX);
}

function extractServicesOrganization(url: URL): string {
  if (url.hostname.toLowerCase() === DEV_AZURE_HOST) {
    const segments = getPathSegments(url);
    return segments[0] ?? '';
  }

  const hostParts = url.hostname.split('.');
  return hostParts[0] ?? '';
}

function safeDecodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new AzureDevOpsValidationError(
      `Organization URL contains malformed percent-encoding in segment '${segment}'`,
    );
  }
}

function getPathSegments(url: URL): string[] {
  return url.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => safeDecodeSegment(segment));
}

function extractServerInfo(
  url: URL,
  projectId?: string,
): {
  instanceSegments: string[];
  collection?: string;
  projectFromUrl?: string;
} {
  const segments = getPathSegments(url);
  const normalizedProject = projectId?.toLowerCase();

  if (segments.length === 0) {
    return { instanceSegments: [] };
  }

  if (segments.length === 1) {
    const [segment] = segments;
    if (segment.toLowerCase() === 'tfs') {
      return { instanceSegments: [segment] };
    }
    return { instanceSegments: [], collection: segment };
  }

  const lastSegment = segments[segments.length - 1];
  if (normalizedProject && lastSegment.toLowerCase() === normalizedProject) {
    const collection = segments[segments.length - 2];
    const instanceSegments = segments.slice(0, -2);
    return {
      instanceSegments,
      collection,
      projectFromUrl: lastSegment,
    };
  }

  return {
    instanceSegments: segments.slice(0, -1),
    collection: lastSegment,
  };
}

function buildBaseUrl(origin: string, segments: string[]): string {
  if (segments.length === 0) {
    return origin.replace(/\/+$/, '');
  }

  const url = new URL(origin);
  url.pathname = `/${segments.join('/')}`;
  return url.toString().replace(/\/+$/, '');
}

function joinUrl(base: string, segment: string): string {
  return `${base.replace(/\/+$/, '')}/${segment}`;
}
