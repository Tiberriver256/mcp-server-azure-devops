import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../shared/errors/index.ts';
import {
  extractContinuationToken,
  extractETag,
} from '../../shared/http/http-client.ts';
import { createSessionFromEnv } from '../../shared/session/azure-devops-session.ts';
import type { ToolContext } from '../../shared/session/azure-devops-session.ts';
import {
  CORE_AREA,
  CORE_PROJECTS_LOCATION_ID,
  WIKI_AREA,
  WIKI_PAGES_BATCH_LOCATION_ID,
  WIKI_PAGES_BATCH_UNSUPPORTED_MESSAGE,
  WIKI_PAGES_LOCATION_ID,
  WIKI_WIKIS_LOCATION_ID,
  negotiateWikiApiVersion,
} from './api-version.ts';

const MAX_WIKI_BATCH_PAGES = 100;

export interface WikiCreateParameters {
  name: string;
  projectId: string;
  type: 'projectWiki' | 'codeWiki';
  repositoryId?: string;
  mappedPath?: string;
  version?: {
    version: string;
    versionType?: 'branch' | 'tag' | 'commit';
  };
}

export interface WikiPageContent {
  content: string;
}

export interface WikiPageSummary {
  id: number;
  path: string;
  url?: string;
  order?: number;
}

interface WikiPagesBatchResponse {
  value: WikiPageSummary[];
  continuationToken?: string;
}

export interface PageUpdateOptions {
  comment?: string;
}

export interface WikiClientOptions {
  organizationId?: string;
  projectId?: string;
}

/**
 * Cohesive REST client for Azure DevOps Wiki endpoints, backed by ToolContext's
 * unified native-fetch HTTP transport and auth provider.
 */
export class WikiClient {
  private readonly session: ToolContext;
  private readonly baseUrl: string;

  constructor(session: ToolContext, options: WikiClientOptions = {}) {
    this.session = session;
    const baseUrls = session.resolveBaseUrls({
      organizationId: options.organizationId,
      projectId: options.projectId,
    });
    this.baseUrl = baseUrls.coreBaseUrl;
  }

  private async getProjectId(projectNameOrId: string): Promise<string> {
    const apiVersion = await negotiateWikiApiVersion(
      this.session,
      this.baseUrl,
      {
        area: CORE_AREA,
        locationId: CORE_PROJECTS_LOCATION_ID,
        resourceName: 'projects',
      },
    );
    const response = await this.session.requestAzureDevOps<{ id: string }>({
      method: 'GET',
      url: `${this.baseUrl}/_apis/projects/${encodeURIComponent(projectNameOrId)}`,
      query: { 'api-version': apiVersion },
      headers: { 'Content-Type': 'application/json' },
      context: `getting project details for '${projectNameOrId}'`,
    });
    return response.data.id;
  }

  async createWiki(
    projectId: string,
    params: WikiCreateParameters,
  ): Promise<Record<string, unknown>> {
    const project = this.session.resolveProjectId(projectId);
    const actualProjectId = await this.getProjectId(project);
    const apiVersion = await negotiateWikiApiVersion(
      this.session,
      this.baseUrl,
      {
        area: WIKI_AREA,
        locationId: WIKI_WIKIS_LOCATION_ID,
        resourceName: 'wikis',
      },
    );

    const response = await this.session.requestAzureDevOps<
      Record<string, unknown>
    >({
      method: 'POST',
      url: `${this.baseUrl}/${encodeURIComponent(project)}/_apis/wiki/wikis`,
      query: { 'api-version': apiVersion },
      body: {
        name: params.name,
        type: params.type,
        projectId: actualProjectId,
        ...(params.type === 'codeWiki' && {
          repositoryId: params.repositoryId,
          mappedPath: params.mappedPath,
          version: params.version,
        }),
      },
      context: `creating wiki '${params.name}' in project '${project}'`,
    });

    return response.data;
  }

  async getPage(
    projectId: string,
    wikiId: string,
    pagePath: string,
  ): Promise<{ content: string; eTag?: string }> {
    const project = this.session.resolveProjectId(projectId);
    const normalizedPath = pagePath.startsWith('/') ? pagePath : `/${pagePath}`;
    const apiVersion = await negotiateWikiApiVersion(
      this.session,
      this.baseUrl,
      {
        area: WIKI_AREA,
        locationId: WIKI_PAGES_LOCATION_ID,
        resourceName: 'pages',
      },
    );

    const response = await this.session.requestAzureDevOps<string>({
      method: 'GET',
      url: `${this.baseUrl}/${encodeURIComponent(project)}/_apis/wiki/wikis/${encodeURIComponent(wikiId)}/pages`,
      query: {
        'api-version': apiVersion,
        path: normalizedPath,
      },
      headers: {
        Accept: 'text/plain',
      },
      responseType: 'text',
      context: `getting wiki page '${normalizedPath}' in wiki '${wikiId}'`,
    });

    return {
      content: response.data,
      eTag: extractETag(response.headers),
    };
  }

  async updatePage(
    content: WikiPageContent,
    projectId: string,
    wikiId: string,
    pagePath: string,
    options?: PageUpdateOptions,
  ): Promise<Record<string, unknown>> {
    const project = this.session.resolveProjectId(projectId);
    const normalizedPath = pagePath.startsWith('/') ? pagePath : `/${pagePath}`;

    // Fetch current ETag when page already exists; 404 means we are creating a new page
    let currentETag: string | undefined;
    try {
      const currentPage = await this.getPage(project, wikiId, normalizedPath);
      currentETag = currentPage.eTag;
    } catch (error) {
      if (!(error instanceof AzureDevOpsResourceNotFoundError)) {
        throw error;
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (currentETag) {
      headers['If-Match'] = `"${currentETag}"`;
    }

    const apiVersion = await negotiateWikiApiVersion(
      this.session,
      this.baseUrl,
      {
        area: WIKI_AREA,
        locationId: WIKI_PAGES_LOCATION_ID,
        resourceName: 'pages',
      },
    );

    // Pass normalizedPath raw: buildRequestUrl encodes query parameters once (avoids double-encoding)
    const response = await this.session.requestAzureDevOps<
      Record<string, unknown>
    >({
      method: 'PUT',
      url: `${this.baseUrl}/${encodeURIComponent(project)}/_apis/wiki/wikis/${encodeURIComponent(wikiId)}/pages`,
      query: {
        'api-version': apiVersion,
        path: normalizedPath,
        comment: options?.comment,
      },
      headers,
      body: { content: content.content },
      context: `updating wiki page '${normalizedPath}' in wiki '${wikiId}'`,
    });

    return {
      ...response.data,
      version: extractETag(response.headers),
      message:
        response.status === 201
          ? 'Page created successfully'
          : 'Page updated successfully',
    };
  }

  async listWikiPages(
    projectId: string,
    wikiId: string,
  ): Promise<WikiPageSummary[]> {
    const project = this.session.resolveProjectId(projectId);
    const apiVersion = await negotiateWikiApiVersion(
      this.session,
      this.baseUrl,
      {
        area: WIKI_AREA,
        locationId: WIKI_PAGES_BATCH_LOCATION_ID,
        resourceName: 'pagesBatch',
        missingLocationErrorMessage: WIKI_PAGES_BATCH_UNSUPPORTED_MESSAGE,
      },
    );
    const url = `${this.baseUrl}/${encodeURIComponent(project)}/_apis/wiki/wikis/${encodeURIComponent(wikiId)}/pagesbatch`;

    const allPages: WikiPageSummary[] = [];
    const seenTokens = new Set<string>();
    let continuationToken: string | undefined;
    let pageCount = 0;

    do {
      if (pageCount >= MAX_WIKI_BATCH_PAGES) {
        break;
      }
      pageCount += 1;

      const response =
        await this.session.requestAzureDevOps<WikiPagesBatchResponse>({
          method: 'POST',
          url,
          query: { 'api-version': apiVersion },
          body: {
            top: 100,
            ...(continuationToken ? { continuationToken } : {}),
          },
          context: `listing wiki pages in wiki '${wikiId}'`,
        });

      if (Array.isArray(response.data?.value)) {
        allPages.push(...response.data.value);
      }

      const nextToken =
        extractContinuationToken(response.headers) ??
        response.data?.continuationToken;
      if (nextToken && seenTokens.has(nextToken)) {
        throw new AzureDevOpsError(
          `Detected repeated continuation token while listing wiki pages in '${wikiId}'`,
        );
      }
      if (nextToken) {
        seenTokens.add(nextToken);
      }
      continuationToken = nextToken;
    } while (continuationToken);

    return allPages.sort((a, b) => {
      const aOrder = a.order ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.order ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return a.path.localeCompare(b.path);
    });
  }
}

export function createWikiClient(
  ctx?: ToolContext,
  options: WikiClientOptions = {},
): WikiClient {
  const session =
    ctx ??
    createSessionFromEnv({
      defaultProject: options.projectId,
    });
  if (!session.config.organizationUrl && !options.organizationId) {
    throw new AzureDevOpsValidationError('Organization URL is required');
  }
  return new WikiClient(session, options);
}
