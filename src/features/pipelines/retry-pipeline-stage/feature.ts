import type { WebApi } from 'azure-devops-node-api';
import type { UpdateStageParameters } from 'azure-devops-node-api/interfaces/BuildInterfaces.js';
import { StageUpdateType } from 'azure-devops-node-api/interfaces/BuildInterfaces.js';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsPermissionError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import { resolvePipelineProjectId } from '../helpers.ts';
import type {
  RetryPipelineStageOptions,
  RetryPipelineStageResult,
  StageActionState,
} from '../types.ts';

const STAGE_UPDATE_TYPE_BY_STATE: Readonly<
  Record<StageActionState, StageUpdateType>
> = {
  cancel: StageUpdateType.Cancel,
  retry: StageUpdateType.Retry,
  run: StageUpdateType.Run,
};

const STAGE_UPDATE_LOCATION_ID = 'b8aac6c9-744b-46e1-88fc-3550969f9313';

function getErrorStatusCode(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const code = (error as { statusCode?: unknown }).statusCode;
    if (typeof code === 'number') {
      return code;
    }
  }
  return undefined;
}

function isUnsupportedStageEndpointError(
  message: string,
  statusCode?: number,
): boolean {
  if (
    /failed to find api location/i.test(message) ||
    message.toLowerCase().includes(STAGE_UPDATE_LOCATION_ID) ||
    /VssVersionNotSupportedException|VssVersionOutOfRangeException/i.test(
      message,
    ) ||
    /not supported on.*(?:2019|5\.0)|requires.*(?:2020|6\.0)/i.test(message)
  ) {
    return true;
  }

  if (
    statusCode === 404 &&
    /api location|controller|endpoint|resource.*not.*found|not supported/i.test(
      message,
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Retry, cancel, or run a specific stage in an Azure Pipelines build run.
 * Requires Azure DevOps Server 2020 (API version 6.0-preview.1) or later, or Azure DevOps Services.
 */
export async function retryPipelineStage(
  connection: WebApi,
  options: RetryPipelineStageOptions,
): Promise<RetryPipelineStageResult> {
  const projectId = resolvePipelineProjectId(options.projectId);
  const buildId = options.runId;
  const stageRefName = options.stageRefName.trim();

  if (stageRefName.length === 0) {
    throw new AzureDevOpsValidationError(
      'stageRefName must be a non-empty string.',
    );
  }

  const state: StageActionState = options.state ?? 'retry';
  const stageUpdateType = STAGE_UPDATE_TYPE_BY_STATE[state];
  if (stageUpdateType === undefined) {
    throw new AzureDevOpsValidationError(
      `Invalid stage state "${String(state)}". Expected one of: retry, cancel, run.`,
    );
  }

  const forceRetryAllJobs = options.forceRetryAllJobs ?? false;
  const updateParameters: UpdateStageParameters = {
    state: stageUpdateType,
    forceRetryAllJobs,
  };
  if (options.retryDependencies !== undefined) {
    updateParameters.retryDependencies = options.retryDependencies;
  }

  try {
    const buildApi = await connection.getBuildApi();
    if (
      buildApi.vsoClient &&
      typeof buildApi.vsoClient.getVersioningData === 'function' &&
      buildApi.rest &&
      typeof buildApi.rest.update === 'function'
    ) {
      const verData = await buildApi.vsoClient.getVersioningData(
        '7.2-preview.1',
        'build',
        'b8aac6c9-744b-46e1-88fc-3550969f9313',
        { project: projectId, buildId, stageRefName },
      );
      if (!verData?.requestUrl) {
        throw new AzureDevOpsValidationError(
          'Retrying or updating pipeline stages is not supported by this Azure DevOps server (for example Azure DevOps Server 2019 / API version 5.0). Stage updates require Azure DevOps Server 2020 (API version 6.0-preview.1) or later, or Azure DevOps Services.',
        );
      }
      const optionsWithHeaders = verData.apiVersion
        ? {
            acceptHeader: buildApi.createAcceptHeader(
              'application/json',
              verData.apiVersion,
            ),
          }
        : undefined;
      const res = await buildApi.rest.update(
        verData.requestUrl,
        updateParameters,
        optionsWithHeaders,
      );
      if (res.statusCode === 404) {
        throw new AzureDevOpsResourceNotFoundError(
          `Build ${buildId} or stage '${stageRefName}' not found in project '${projectId}' (HTTP 404)`,
        );
      }
      if (res.statusCode >= 400) {
        throw new AzureDevOpsError(
          `Failed to update stage '${stageRefName}' on build ${buildId} (HTTP ${res.statusCode})`,
        );
      }
    } else {
      // Fallback for unit-test mocks exposing only buildApi.updateStage
      await buildApi.updateStage(
        updateParameters,
        buildId,
        stageRefName,
        projectId,
      );
    }

    const confirmation: RetryPipelineStageResult = {
      buildId,
      stageRefName,
      state,
      forceRetryAllJobs,
      status: 'accepted',
    };
    if (options.retryDependencies !== undefined) {
      confirmation.retryDependencies = options.retryDependencies;
    }
    return confirmation;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    const statusCode = getErrorStatusCode(error);
    const message = error instanceof Error ? error.message : String(error);

    if (isUnsupportedStageEndpointError(message, statusCode)) {
      throw new AzureDevOpsValidationError(
        'Retrying or updating pipeline stages is not supported by this Azure DevOps server (for example Azure DevOps Server 2019 / API version 5.0). Stage updates require Azure DevOps Server 2020 (API version 6.0-preview.1) or later, or Azure DevOps Services.',
        undefined,
        { cause: error },
      );
    }

    if (statusCode === 401 || /unauthorized|authentication/i.test(message)) {
      throw new AzureDevOpsAuthenticationError(
        `Failed to authenticate when updating stage '${stageRefName}' on build ${buildId}: ${message}`,
        { cause: error },
      );
    }

    if (statusCode === 403 || /forbidden|access denied/i.test(message)) {
      throw new AzureDevOpsPermissionError(
        `Permission denied when updating stage '${stageRefName}' on build ${buildId}: ${message}`,
        { cause: error },
      );
    }

    if (statusCode === 404) {
      throw new AzureDevOpsResourceNotFoundError(
        `Build ${buildId} or stage '${stageRefName}' not found in project '${projectId}': ${message}`,
        { cause: error },
      );
    }

    if (statusCode === 400) {
      throw new AzureDevOpsValidationError(message, undefined, {
        cause: error,
      });
    }

    throw new AzureDevOpsError(
      `Failed to update stage '${stageRefName}' on build ${buildId}: ${message}`,
      { cause: error },
    );
  }
}
