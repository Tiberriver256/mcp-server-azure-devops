import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../shared/errors';
import { extractETag } from '../../shared/http/http-client';
import { createSessionFromEnv } from '../../shared/session/azure-devops-session';
import type { ToolContext } from '../../shared/session/azure-devops-session';

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
    const response = await this.session.requestAzureDevOps<{ id: string }>({
      method: 'GET',
      url: `${this.baseUrl}/_apis/projects/${projectNameOrId}`,
      query: { 'api-version': this.session.config.apiVersion },
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

    const response = await this.session.requestAzureDevOps<
      Record<string, unknown>
    >({
      method: 'POST',
      url: `${this.baseUrl}/${project}/_apis/wiki/wikis`,
      query: { 'api-version': this.session.config.apiVersion },
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

    const response = await this.session.requestAzureDevOps<string>({
      method: 'GET',
      url: `${this.baseUrl}/${project}/_apis/wiki/wikis/${wikiId}/pages`,
      query: {
        'api-version': this.session.config.apiVersion,
        path: normalizedPath,
      },
      headers: {
        Accept: 'text/plain',
      },
      responseType: 'text',
      context: `getting wiki page '${pagePath}' in wiki '${wikiId}'`,
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

    // Fetch current ETag when page already exists; 404 means we are creating a new page
    let currentETag: string | undefined;
    try {
      const currentPage = await this.getPage(project, wikiId, pagePath);
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

    // Pass raw pagePath: buildRequestUrl encodes query parameters once (avoids double-encoding)
    const response = await this.session.requestAzureDevOps<
      Record<string, unknown>
    >({
      method: 'PUT',
      url: `${this.baseUrl}/${project}/_apis/wiki/wikis/${wikiId}/pages`,
      query: {
        'api-version': this.session.config.apiVersion,
        path: pagePath,
        comment: options?.comment,
      },
      headers,
      body: { content: content.content },
      context: `updating wiki page '${pagePath}' in wiki '${wikiId}'`,
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
    const url = `${this.baseUrl}/${project}/_apis/wiki/wikis/${wikiId}/pagesbatch`;

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
          query: { 'api-version': this.session.config.apiVersion },
          body: {
            top: 100,
            ...(continuationToken ? { continuationToken } : {}),
          },
          context: `listing wiki pages in wiki '${wikiId}'`,
        });

      if (Array.isArray(response.data?.value)) {
        allPages.push(...response.data.value);
      }

      const nextToken = response.data?.continuationToken;
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
