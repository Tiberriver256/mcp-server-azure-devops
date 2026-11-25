import { AzureDevOpsResourceNotFoundError } from '../errors';

export type AdoResourceRef =
  | { kind: 'default' }
  | { kind: 'branch'; branch: string }
  | { kind: 'commit'; commit: string }
  | { kind: 'tag'; tag: string }
  | { kind: 'pullrequest'; pullRequestId: number };

export interface ParsedAdoResourceUri {
  readonly organization: string;
  readonly project: string;
  readonly repository: string;
  readonly path: string;
  readonly ref: AdoResourceRef;
}

export interface AdoResourceTemplate {
  readonly uriTemplate: string;
  readonly name: string;
  readonly description: string;
}

export const ADO_RESOURCE_TEMPLATES: readonly AdoResourceTemplate[] = [
  {
    uriTemplate: 'ado://{organization}/{project}/{repo}/contents{/path*}',
    name: 'Repository Content',
    description: 'Content from the default branch of a repository',
  },
  {
    uriTemplate:
      'ado://{organization}/{project}/{repo}/branches/{branch}/contents{/path*}',
    name: 'Branch Content',
    description: 'Content from a specific branch of a repository',
  },
  {
    uriTemplate:
      'ado://{organization}/{project}/{repo}/commits/{commit}/contents{/path*}',
    name: 'Commit Content',
    description: 'Content from a specific commit in a repository',
  },
  {
    uriTemplate:
      'ado://{organization}/{project}/{repo}/tags/{tag}/contents{/path*}',
    name: 'Tag Content',
    description: 'Content from a specific tag in a repository',
  },
  {
    uriTemplate:
      'ado://{organization}/{project}/{repo}/pullrequests/{prId}/contents{/path*}',
    name: 'Pull Request Content',
    description: 'Content from a specific pull request in a repository',
  },
];

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new AzureDevOpsResourceNotFoundError(
      `Invalid percent-encoding in resource URI segment '${segment}'`,
    );
  }
}

/**
 * Parse an `ado://` MCP resource URI into structured components.
 *
 * Correctly extracts `organization` from `uri.host` (and handles `ado:///org/...`
 * triple-slash URIs gracefully) so `{project}` and `{repo}` align with the
 * advertised URI templates. Also supports branch/tag names containing slashes
 * (everything between `branches/` or `tags/` and `/contents`).
 */
export function parseAdoResourceUri(uriString: string): ParsedAdoResourceUri {
  let uri: URL;
  try {
    uri = new URL(uriString);
  } catch {
    throw new AzureDevOpsResourceNotFoundError(
      `Invalid resource URI: ${uriString}`,
    );
  }

  if (uri.protocol !== 'ado:') {
    throw new AzureDevOpsResourceNotFoundError(
      `Unsupported protocol: ${uri.protocol}`,
    );
  }

  const pathSegments = uri.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => safeDecode(segment));

  const hostOrg = uri.host ? safeDecode(uri.host) : undefined;
  const allSegments = hostOrg ? [hostOrg, ...pathSegments] : pathSegments;

  if (allSegments.length < 3) {
    throw new AzureDevOpsResourceNotFoundError(
      `Resource URI must include organization, project, and repository: ${uriString}`,
    );
  }

  const [organization, project, repository, ...rest] = allSegments;

  if (rest.length === 0) {
    return {
      organization,
      project,
      repository,
      path: '/',
      ref: { kind: 'default' },
    };
  }

  const selector = rest[0];
  if (selector === 'contents') {
    const filePath = rest.length > 1 ? `/${rest.slice(1).join('/')}` : '/';
    return {
      organization,
      project,
      repository,
      path: filePath,
      ref: { kind: 'default' },
    };
  }

  if (
    selector === 'branches' ||
    selector === 'commits' ||
    selector === 'tags' ||
    selector === 'pullrequests'
  ) {
    const afterSelector = rest.slice(1);
    if (afterSelector.length === 0) {
      throw new AzureDevOpsResourceNotFoundError(
        `Missing identifier after '${selector}' in resource URI: ${uriString}`,
      );
    }

    const contentsIndex = afterSelector.indexOf('contents');
    const refSegments =
      contentsIndex === -1
        ? afterSelector
        : afterSelector.slice(0, contentsIndex);
    const fileSegments =
      contentsIndex === -1 ? [] : afterSelector.slice(contentsIndex + 1);

    if (refSegments.length === 0) {
      throw new AzureDevOpsResourceNotFoundError(
        `Missing identifier after '${selector}' in resource URI: ${uriString}`,
      );
    }

    const refValue = refSegments.join('/');
    const filePath =
      fileSegments.length > 0 ? `/${fileSegments.join('/')}` : '/';

    switch (selector) {
      case 'branches':
        return {
          organization,
          project,
          repository,
          path: filePath,
          ref: { kind: 'branch', branch: refValue },
        };
      case 'commits':
        return {
          organization,
          project,
          repository,
          path: filePath,
          ref: { kind: 'commit', commit: refValue },
        };
      case 'tags':
        return {
          organization,
          project,
          repository,
          path: filePath,
          ref: { kind: 'tag', tag: refValue },
        };
      case 'pullrequests': {
        if (!/^\d+$/.test(refValue)) {
          throw new AzureDevOpsResourceNotFoundError(
            `Invalid pull request ID '${refValue}' in resource URI: ${uriString}`,
          );
        }
        const prId = Number.parseInt(refValue, 10);
        if (!Number.isSafeInteger(prId) || prId <= 0) {
          throw new AzureDevOpsResourceNotFoundError(
            `Invalid pull request ID '${refValue}' in resource URI: ${uriString}`,
          );
        }
        return {
          organization,
          project,
          repository,
          path: filePath,
          ref: { kind: 'pullrequest', pullRequestId: prId },
        };
      }
    }
  }

  throw new AzureDevOpsResourceNotFoundError(
    `Unsupported resource path segment '${selector}' in URI: ${uriString}`,
  );
}

/**
 * Construct a canonical `ado://` resource URI from parsed components.
 */
export function buildAdoResourceUri(parsed: ParsedAdoResourceUri): string {
  const org = encodeURIComponent(parsed.organization);
  const project = encodeURIComponent(parsed.project);
  const repo = encodeURIComponent(parsed.repository);
  const normalizedPath = parsed.path
    .split('/')
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join('/');
  const contentsSuffix = normalizedPath
    ? `contents/${normalizedPath}`
    : 'contents';

  switch (parsed.ref.kind) {
    case 'default':
      return `ado://${org}/${project}/${repo}/${contentsSuffix}`;
    case 'branch': {
      const encodedBranch = parsed.ref.branch
        .split('/')
        .map((s) => encodeURIComponent(s))
        .join('/');
      return `ado://${org}/${project}/${repo}/branches/${encodedBranch}/${contentsSuffix}`;
    }
    case 'commit':
      return `ado://${org}/${project}/${repo}/commits/${encodeURIComponent(parsed.ref.commit)}/${contentsSuffix}`;
    case 'tag': {
      const encodedTag = parsed.ref.tag
        .split('/')
        .map((s) => encodeURIComponent(s))
        .join('/');
      return `ado://${org}/${project}/${repo}/tags/${encodedTag}/${contentsSuffix}`;
    }
    case 'pullrequest':
      return `ado://${org}/${project}/${repo}/pullrequests/${parsed.ref.pullRequestId}/${contentsSuffix}`;
  }
}

const MIME_TYPES = new Map<string, string>([
  ['txt', 'text/plain'],
  ['html', 'text/html'],
  ['htm', 'text/html'],
  ['css', 'text/css'],
  ['js', 'application/javascript'],
  ['json', 'application/json'],
  ['xml', 'application/xml'],
  ['md', 'text/markdown'],
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
  ['svg', 'image/svg+xml'],
  ['pdf', 'application/pdf'],
  ['ts', 'application/typescript'],
  ['tsx', 'application/typescript'],
  ['py', 'text/x-python'],
  ['cs', 'text/x-csharp'],
  ['java', 'text/x-java'],
  ['c', 'text/x-c'],
  ['cpp', 'text/x-c++'],
  ['cc', 'text/x-c++'],
  ['go', 'text/x-go'],
  ['rs', 'text/x-rust'],
  ['rb', 'text/x-ruby'],
  ['sh', 'text/x-sh'],
  ['yaml', 'text/yaml'],
  ['yml', 'text/yaml'],
]);

/**
 * Determine MIME type for a repository file path based on extension.
 */
export function getMimeType(filePath: string): string {
  const lastSegment = filePath.split('/').pop() ?? '';
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === lastSegment.length - 1) {
    return 'text/plain';
  }
  const extension = lastSegment.slice(dotIndex + 1).toLowerCase();
  return MIME_TYPES.get(extension) ?? 'text/plain';
}
