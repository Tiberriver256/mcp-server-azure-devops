import { WebApi } from 'azure-devops-node-api';
import { TypeInfo } from 'azure-devops-node-api/interfaces/PipelinesInterfaces';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import { defaultProject } from '../../../utils/environment';
import { fetchRunArtifacts } from '../artifacts';
import { coercePipelineId, resolvePipelineId } from '../helpers';
import { GetPipelineRunOptions, PipelineRunDetails } from '../types';

const API_VERSION = '7.1';

export async function getPipelineRun(
  connection: WebApi,
  options: GetPipelineRunOptions,
): Promise<PipelineRunDetails> {
  try {
    const pipelinesApi = await connection.getPipelinesApi();
    const projectId = options.projectId ?? defaultProject;
    const runId = options.runId;
    const resolvedPipelineId = await resolvePipelineId(
      connection,
      projectId,
      runId,
      options.pipelineId,
    );

    const baseUrl = connection.serverUrl.replace(/\/+$/, '');
    const encodedProject = encodeURIComponent(projectId);

    const requestOptions = pipelinesApi.createRequestOptions(
      'application/json',
      API_VERSION,
    );

    const buildRunUrl = (pipelineId?: number) => {
      const route =
        typeof pipelineId === 'number'
          ? `${encodedProject}/_apis/pipelines/${pipelineId}/runs/${runId}`
          : `${encodedProject}/_apis/pipelines/runs/${runId}`;
      const url = new URL(`${route}`, `${baseUrl}/`);
      url.searchParams.set('api-version', API_VERSION);
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

    const run = pipelinesApi.formatResponse(
      response.result,
      TypeInfo.Run,
      false,
    ) as PipelineRunDetails;

    if (!run) {
      throw new AzureDevOpsResourceNotFoundError(
        `Pipeline run ${runId} not found in project ${projectId}`,
      );
    }

    const artifacts = await fetchRunArtifacts(
      connection,
      projectId,
      runId,
      resolvedPipelineId,
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
