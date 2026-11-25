import type { WebApi } from 'azure-devops-node-api';
import { AzureDevOpsValidationError } from '../../../shared/errors/index.ts';
import { resolveAzureDevOpsBaseUrls } from '../../../shared/azure-devops-url.ts';
import { createSessionFromEnv } from '../../../shared/session/azure-devops-session.ts';
import type { ToolContext } from '../../../shared/session/azure-devops-session.ts';
import {
  WORK_ITEM_SEARCH_LOCATION_ID,
  negotiateSearchApiVersion,
} from '../api-version.ts';
import type {
  SearchWorkItemsOptions,
  WorkItemSearchRequest,
  WorkItemSearchResponse,
} from '../types.ts';

/**
 * Search for work items in Azure DevOps projects.
 */
export async function searchWorkItems(
  connectionOrContext: WebApi | ToolContext,
  options: SearchWorkItemsOptions,
): Promise<WorkItemSearchResponse> {
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
      'Project ID is required for Azure DevOps Server work item search',
    );
  }

  const searchRequest: WorkItemSearchRequest = {
    searchText: options.searchText,
    $skip: options.skip,
    $top: options.top,
    filters: {
      ...(effectiveProjectId
        ? { 'System.TeamProject': [effectiveProjectId] }
        : {}),
      ...options.filters,
    },
    includeFacets: options.includeFacets,
    $orderBy: options.orderBy,
  };

  const apiVersion = await negotiateSearchApiVersion(
    session,
    baseUrls.searchBaseUrl,
    WORK_ITEM_SEARCH_LOCATION_ID,
    'workItemSearchResults',
  );

  const searchUrl = effectiveProjectId
    ? `${baseUrls.searchBaseUrl}/${encodeURIComponent(effectiveProjectId)}/_apis/search/workitemsearchresults`
    : `${baseUrls.searchBaseUrl}/_apis/search/workitemsearchresults`;

  const response = await session.requestAzureDevOps<WorkItemSearchResponse>({
    method: 'POST',
    url: searchUrl,
    query: { 'api-version': apiVersion },
    body: searchRequest,
    context: 'searching work items',
  });

  return response.data;
}
