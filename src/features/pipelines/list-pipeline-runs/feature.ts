import type { WebApi } from 'azure-devops-node-api';
import { TypeInfo } from 'azure-devops-node-api/interfaces/PipelinesInterfaces';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import { extractContinuationToken as extractHeaderContinuationToken } from '../../../shared/http/http-client';
import type { ToolContext } from '../../../shared/session/azure-devops-session';
import {
  resolvePipelineApiVersion,
  resolvePipelineProjectId,
} from '../helpers';
import type {
  ListPipelineRunsOptions,
  ListPipelineRunsResult,
  Run,
} from '../types';

export function normalizeBranch(branch?: string): string | undefined {
  if (!branch) {
    return undefined;
  }

  const trimmed = branch.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.startsWith('refs/')) {
    return trimmed;
  }

  return `refs/heads/${trimmed}`;
}

function isRunArray(value: unknown): value is Run[] {
  return Array.isArray(value);
}

function extractContinuationToken(
  headers: unknown,
  result: unknown,
): string | undefined {
  const headerToken = extractHeaderContinuationToken(headers);
  if (headerToken) {
    return headerToken;
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
  ctx?: ToolContext,
): Promise<ListPipelineRunsResult> {
  try {
    const pipelinesApi = await connection.getPipelinesApi();
    const projectId = ctx
      ? ctx.resolveProjectId(options.projectId)
      : resolvePipelineProjectId(options.projectId);
    const apiVersion = resolvePipelineApiVersion(ctx?.config.apiVersion);
    const pipelineId = options.pipelineId;

    const baseUrl = connection.serverUrl.replace(/\/+$/, '');
    const route = `${encodeURIComponent(projectId)}/_apis/pipelines/${pipelineId}/runs`;
    const url = new URL(`${route}`, `${baseUrl}/`);

    url.searchParams.set('api-version', apiVersion);

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
      apiVersion,
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

    const formatted: unknown = pipelinesApi.formatResponse(
      response.result,
      TypeInfo.Run,
      true,
    );
    const runs: Run[] = isRunArray(formatted) ? formatted : [];

    const continuationToken = extractContinuationToken(
      response.headers,
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
