import type { WebApi } from 'azure-devops-node-api';
import { TypeInfo } from 'azure-devops-node-api/interfaces/PipelinesInterfaces.js';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors/index.ts';
import type { ToolContext } from '../../../shared/session/azure-devops-session.ts';
import {
  PIPELINES_AREA,
  PIPELINES_UNSUPPORTED_ERROR_MESSAGE,
  PIPELINE_RUNS_LOCATION_ID,
  negotiatePipelineApiVersion,
} from '../api-version.ts';
import { fetchRunArtifacts } from '../artifacts.ts';
import {
  coercePipelineId,
  resolvePipelineApiVersion,
  resolvePipelineId,
  resolvePipelineProjectId,
} from '../helpers.ts';
import type { GetPipelineRunOptions, PipelineRunDetails } from '../types.ts';

function isPipelineRunDetails(value: unknown): value is PipelineRunDetails {
  return typeof value === 'object' && value !== null;
}

export async function getPipelineRun(
  connection: WebApi,
  options: GetPipelineRunOptions,
  ctx?: ToolContext,
): Promise<PipelineRunDetails> {
  try {
    const pipelinesApi = await connection.getPipelinesApi();
    const projectId = ctx
      ? ctx.resolveProjectId(options.projectId)
      : resolvePipelineProjectId(options.projectId);
    const baseUrl = connection.serverUrl.replace(/\/+$/, '');
    const apiVersion = await negotiatePipelineApiVersion({
      apiClient: pipelinesApi,
      baseUrl,
      area: PIPELINES_AREA,
      locationId: PIPELINE_RUNS_LOCATION_ID,
      resourceName: 'runs',
      fallbackApiVersion: resolvePipelineApiVersion(ctx?.config.apiVersion),
      missingLocationErrorMessage: PIPELINES_UNSUPPORTED_ERROR_MESSAGE,
    });
    const runId = options.runId;
    const resolvedPipelineId = await resolvePipelineId(
      connection,
      projectId,
      runId,
      options.pipelineId,
    );

    const encodedProject = encodeURIComponent(projectId);

    const requestOptions = pipelinesApi.createRequestOptions(
      'application/json',
      apiVersion,
    );

    const buildRunUrl = (pipelineId?: number) => {
      const route =
        typeof pipelineId === 'number'
          ? `${encodedProject}/_apis/pipelines/${pipelineId}/runs/${runId}`
          : `${encodedProject}/_apis/pipelines/runs/${runId}`;
      const url = new URL(`${route}`, `${baseUrl}/`);
      url.searchParams.set('api-version', apiVersion);
      return url;
    };

    const urlsToTry: URL[] = [];
    if (typeof resolvedPipelineId === 'number') {
      urlsToTry.push(buildRunUrl(resolvedPipelineId));
    }
    urlsToTry.push(buildRunUrl());

    let response: {
      statusCode: number;
      result: PipelineRunDetails | null;
    } | null = null;

    for (const url of urlsToTry) {
      const attempt = await pipelinesApi.rest.get<PipelineRunDetails | null>(
        url.toString(),
        requestOptions,
      );

      if (attempt.statusCode !== 404 && attempt.result) {
        response = attempt;
        break;
      }
    }

    if (!response || !response.result) {
      throw new AzureDevOpsResourceNotFoundError(
        `Pipeline run ${runId} not found in project ${projectId}`,
      );
    }

    const formatted: unknown = pipelinesApi.formatResponse(
      response.result,
      TypeInfo.Run,
      false,
    );

    if (!isPipelineRunDetails(formatted)) {
      throw new AzureDevOpsResourceNotFoundError(
        `Pipeline run ${runId} not found in project ${projectId}`,
      );
    }
    const run = formatted;

    const artifacts = await fetchRunArtifacts(
      connection,
      projectId,
      runId,
      resolvedPipelineId,
      ctx,
    );

    if (typeof options.pipelineId === 'number') {
      const runPipelineId = coercePipelineId(run.pipeline?.id);
      if (runPipelineId !== options.pipelineId) {
        throw new AzureDevOpsResourceNotFoundError(
          `Run ${runId} does not belong to pipeline ${options.pipelineId}`,
        );
      }
    }

    return artifacts.length > 0 ? { ...run, artifacts } : run;
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
          `Pipeline run or project not found: ${error.message}`,
        );
      }
    }

    throw new AzureDevOpsError(
      `Failed to get pipeline run: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
