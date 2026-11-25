import type { WebApi } from 'azure-devops-node-api';
import { GitVersionType } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzureDevOpsValidationError } from '../../../shared/errors';
import { resolveAzureDevOpsBaseUrls } from '../../../shared/azure-devops-url';
import { logError } from '../../../shared/logging';
import { mapWithConcurrency } from '../../../shared/utils/concurrency';
import { streamToString } from '../../../shared/utils/stream';
import { createSessionFromEnv } from '../../../shared/session/azure-devops-session';
import type { ToolContext } from '../../../shared/session/azure-devops-session';
import type {
  CodeSearchRequest,
  CodeSearchResponse,
  CodeSearchResult,
  SearchCodeOptions,
} from '../types';

const MAX_ENRICHED_FILE_BYTES = 1024 * 1024; // 1 MiB per file when enriching code search

/**
 * Search for code in Azure DevOps repositories.
 */
export async function searchCode(
  connection: WebApi,
  options: SearchCodeOptions,
  ctx?: ToolContext,
): Promise<CodeSearchResponse> {
  const session =
    ctx ?? createSessionFromEnv({ organizationUrl: connection.serverUrl });

  const top = options.includeContent
    ? Math.min(options.top || 10, 10)
    : options.top;

  const projectId = session.resolveOptionalProjectId(options.projectId);
  if (!projectId) {
    throw new AzureDevOpsValidationError(
      'Project ID is required. Either provide a projectId or set the AZURE_DEVOPS_DEFAULT_PROJECT environment variable.',
    );
  }

  const searchRequest: CodeSearchRequest = {
    searchText: options.searchText,
    $skip: options.skip,
    $top: top,
    filters: {
      Project: [projectId],
      ...(options.filters || {}),
    },
    includeFacets: true,
    includeSnippet: options.includeSnippet,
  };

  const baseUrls = resolveAzureDevOpsBaseUrls(connection.serverUrl, {
    organizationId: options.organizationId,
    projectId,
  });

  const searchUrl = `${baseUrls.searchBaseUrl}/${projectId}/_apis/search/codesearchresults`;
  const searchResponse = await session.requestAzureDevOps<CodeSearchResponse>({
    method: 'POST',
    url: searchUrl,
    query: { 'api-version': session.config.apiVersion },
    body: searchRequest,
    context: 'searching code',
  });

  const results = searchResponse.data;

  if (options.includeContent && results.results.length > 0) {
    await enrichResultsWithContent(connection, results.results);
  }

  return results;
}

async function enrichResultsWithContent(
  connection: WebApi,
  results: CodeSearchResult[],
): Promise<void> {
  try {
    const gitApi = await connection.getGitApi();

    await mapWithConcurrency(results, 5, async (result) => {
      try {
        const contentStream = await gitApi.getItemContent(
          result.repository.id,
          result.path,
          result.project.name,
          undefined,
          undefined,
          undefined,
          undefined,
          false,
          {
            version: result.versions[0]?.changeId,
            versionType: GitVersionType.Commit,
          },
          true,
        );

        if (contentStream) {
          result.content = await streamToString(
            contentStream,
            MAX_ENRICHED_FILE_BYTES,
          );
        }
      } catch (error) {
        logError(
          `Failed to fetch content for ${result.path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  } catch (error) {
    logError(
      `Failed to enrich results with content: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
