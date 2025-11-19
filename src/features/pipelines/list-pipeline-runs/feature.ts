import { WebApi } from 'azure-devops-node-api';
import { TypeInfo } from 'azure-devops-node-api/interfaces/PipelinesInterfaces';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import { defaultProject } from '../../../utils/environment';
import { ListPipelineRunsOptions, ListPipelineRunsResult, Run } from '../types';

const API_VERSION = '7.1';

function normalizeBranch(branch?: string): string | undefined {
  if (!branch) {
    return undefined;
  }

  const trimmed = branch.trim();
  if (trimmed.startsWith('refs/')) {
    return trimmed;
  }

  return `refs/heads/${trimmed}`;
}

function extractContinuationToken(
  headers: Record<string, unknown>,
  result: unknown,
): string | undefined {
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === 'x-ms-continuationtoken') {
      if (Array.isArray(value)) {
        return value[0];
      }
      if (typeof value === 'string') {
        return value;
      }
    }
  }

  if (result && typeof result === 'object') {
    const continuationToken = (result as { continuationToken?: unknown })
      .continuationToken;
    if (typeof continuationToken === 'string' && continuationToken.length > 0) {
      return continuationToken;
    }
  }

  return undefined;
}

export async function listPipelineRuns(
  connection: WebApi,
  options: ListPipelineRunsOptions,
): Promise<ListPipelineRunsResult> {
  try {
    const pipelinesApi = await connection.getPipelinesApi();
    const projectId = options.projectId ?? defaultProject;
    const pipelineId = options.pipelineId;

    const baseUrl = connection.serverUrl.replace(/\/+$/, '');
    const route = `${encodeURIComponent(projectId)}/_apis/pipelines/${pipelineId}/runs`;
    const url = new URL(`${route}`, `${baseUrl}/`);

    url.searchParams.set('api-version', API_VERSION);

    const top = Math.min(Math.max(options.top ?? 50, 1), 100);
    url.searchParams.set('$top', top.toString());

    if (options.continuationToken) {
      url.searchParams.set('continuationToken', options.continuationToken);
    }

    const branch = normalizeBranch(options.branch);
    if (branch) {
      url.searchParams.set('branch', branch);
    }

    if (options.state) {
      url.searchParams.set('state', options.state);
    }

    if (options.result) {
      url.searchParams.set('result', options.result);
    }

    if (options.createdFrom) {
      url.searchParams.set('createdDate/min', options.createdFrom);
    }

    if (options.createdTo) {
      url.searchParams.set('createdDate/max', options.createdTo);
    }

    url.searchParams.set('orderBy', options.orderBy ?? 'createdDate desc');

    const requestOptions = pipelinesApi.createRequestOptions(
      'application/json',
      API_VERSION,
    );

    const response = await pipelinesApi.rest.get<{
      value?: Run[];
      continuationToken?: string;
    }>(url.toString(), requestOptions);

    if (response.statusCode === 404 || !response.result) {
      throw new AzureDevOpsResourceNotFoundError(
        `Pipeline ${pipelineId} or project ${projectId} not found`,
      );
    }

    const runs =
      (pipelinesApi.formatResponse(
        response.result,
        TypeInfo.Run,
        true,
      ) as Run[]) ?? [];

    const continuationToken = extractContinuationToken(
      response.headers as Record<string, unknown>,
      response.result,
    );

    return continuationToken ? { runs, continuationToken } : { runs };
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (
        message.includes('authentication') ||
        message.includes('unauthorized') ||
        message.includes('401')
      ) {
        throw new AzureDevOpsAuthenticationError(
          `Failed to authenticate: ${error.message}`,
        );
      }

      if (
        message.includes('not found') ||
        message.includes('does not exist') ||
        message.includes('404')
      ) {
        throw new AzureDevOpsResourceNotFoundError(
          `Pipeline or project not found: ${error.message}`,
        );
      }
    }

    throw new AzureDevOpsError(
      `Failed to list pipeline runs: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
