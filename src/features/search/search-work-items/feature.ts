import type { WebApi } from 'azure-devops-node-api';
import { AzureDevOpsValidationError } from '../../../shared/errors';
import { resolveAzureDevOpsBaseUrls } from '../../../shared/azure-devops-url';
import { createSessionFromEnv } from '../../../shared/session/azure-devops-session';
import type { ToolContext } from '../../../shared/session/azure-devops-session';
import type {
  SearchWorkItemsOptions,
  WorkItemSearchRequest,
  WorkItemSearchResponse,
} from '../types';

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

  const searchRequest: WorkItemSearchRequest = {
    searchText: options.searchText,
    $skip: options.skip,
    $top: options.top,
    filters: {
      ...(options.projectId
        ? { 'System.TeamProject': [options.projectId] }
        : {}),
      ...options.filters,
    },
    includeFacets: options.includeFacets,
    $orderBy: options.orderBy,
  };

  const baseUrls = resolveAzureDevOpsBaseUrls(serverUrl, {
    organizationId: options.organizationId,
    projectId: options.projectId,
  });

  if (baseUrls.type === 'server' && !options.projectId) {
    throw new AzureDevOpsValidationError(
      'Project ID is required for Azure DevOps Server work item search',
    );
  }

  const searchUrl = options.projectId
    ? `${baseUrls.searchBaseUrl}/${options.projectId}/_apis/search/workitemsearchresults`
    : `${baseUrls.searchBaseUrl}/_apis/search/workitemsearchresults`;

  const response = await session.requestAzureDevOps<WorkItemSearchResponse>({
    method: 'POST',
    url: searchUrl,
    query: { 'api-version': session.config.apiVersion },
    body: searchRequest,
    context: 'searching work items',
  });

  return response.data;
}
