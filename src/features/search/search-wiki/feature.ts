import type { WebApi } from 'azure-devops-node-api';
import { AzureDevOpsValidationError } from '../../../shared/errors';
import { resolveAzureDevOpsBaseUrls } from '../../../shared/azure-devops-url';
import { createSessionFromEnv } from '../../../shared/session/azure-devops-session';
import type { ToolContext } from '../../../shared/session/azure-devops-session';
import type {
  SearchWikiOptions,
  WikiSearchRequest,
  WikiSearchResponse,
} from '../types';

/**
 * Search for wiki pages in Azure DevOps projects.
 */
export async function searchWiki(
  connectionOrContext: WebApi | ToolContext,
  options: SearchWikiOptions,
): Promise<WikiSearchResponse> {
  const isContext = 'requestAzureDevOps' in connectionOrContext;
  const serverUrl = isContext
    ? connectionOrContext.config.organizationUrl
    : connectionOrContext.serverUrl;
  const session = isContext
    ? connectionOrContext
    : createSessionFromEnv({ organizationUrl: serverUrl });

  const explicitProjectId = options.projectId?.trim() || undefined;
  const baseUrls = resolveAzureDevOpsBaseUrls(serverUrl, {
    organizationId: options.organizationId,
    projectId: explicitProjectId ?? session.config.defaultProject,
  });

  const effectiveProjectId =
    explicitProjectId ??
    (baseUrls.type === 'server'
      ? (session.config.defaultProject ?? baseUrls.projectFromUrl)
      : undefined);

  if (baseUrls.type === 'server' && !effectiveProjectId) {
    throw new AzureDevOpsValidationError(
      'Project ID is required for Azure DevOps Server wiki search',
    );
  }

  const searchRequest: WikiSearchRequest = {
    searchText: options.searchText,
    $skip: options.skip,
    $top: options.top,
    filters: effectiveProjectId ? { Project: [effectiveProjectId] } : {},
    includeFacets: options.includeFacets,
  };

  if (options.filters?.Project && options.filters.Project.length > 0) {
    searchRequest.filters = {
      ...searchRequest.filters,
      Project: [
        ...(searchRequest.filters?.Project ?? []),
        ...options.filters.Project,
      ],
    };
  }

  const searchUrl = effectiveProjectId
    ? `${baseUrls.searchBaseUrl}/${encodeURIComponent(effectiveProjectId)}/_apis/search/wikisearchresults`
    : `${baseUrls.searchBaseUrl}/_apis/search/wikisearchresults`;

  const response = await session.requestAzureDevOps<WikiSearchResponse>({
    method: 'POST',
    url: searchUrl,
    query: { 'api-version': session.config.apiVersion },
    body: searchRequest,
    context: 'searching wiki',
  });

  return response.data;
}
