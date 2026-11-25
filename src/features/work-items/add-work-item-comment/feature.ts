import type { WebApi } from 'azure-devops-node-api';
import type { ApiResourceLocation } from 'azure-devops-node-api/interfaces/common/VsoBaseInterfaces.js';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import type {
  AddWorkItemCommentOptions,
  AddWorkItemCommentResult,
  Comment,
} from '../types.ts';

const WIT_AREA = 'wit';
const COMMENTS_LOCATION_ID = '608aac0a-32e1-4493-a863-b9cf4566d257';
const COMMENTS_API_VERSION_V4 = '7.1-preview.4';
const COMMENTS_API_VERSION_V3 = '7.0-preview.3';

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const errorObj = error as {
    statusCode?: number;
    response?: { status?: number };
  };

  return errorObj.statusCode === 404 || errorObj.response?.status === 404;
}

/**
 * Add a comment to a work item.
 *
 * Automatically resolves `projectId` from the work item when omitted, probes the
 * WIT comments resource location to negotiate `?format=markdown|html` on servers
 * supporting `resourceVersion >= 4` (`7.1-preview.4`+), omits `?format` on
 * `resourceVersion <= 3` (Server 2019 U1 / 2020 / 2022), and falls back to
 * patching `/fields/System.History` when the Comments API is unavailable
 * (Azure DevOps Server 2019 RTM `5.0`).
 */
export async function addWorkItemComment(
  connection: WebApi,
  options: AddWorkItemCommentOptions,
): Promise<AddWorkItemCommentResult> {
  const { workItemId, projectId, format } = options;

  if (!Number.isInteger(workItemId) || workItemId <= 0) {
    throw new AzureDevOpsValidationError(
      'workItemId must be a positive integer',
    );
  }

  const trimmedText =
    typeof options.text === 'string' ? options.text.trim() : '';
  if (!trimmedText) {
    throw new AzureDevOpsValidationError('Comment text must not be empty');
  }

  try {
    const witApi = await connection.getWorkItemTrackingApi();

    let resolvedProjectId = projectId?.trim() || undefined;
    if (!resolvedProjectId) {
      try {
        const workItem = await witApi.getWorkItem(workItemId, [
          'System.TeamProject',
        ]);
        const teamProject: unknown = workItem?.fields?.['System.TeamProject'];
        if (typeof teamProject !== 'string' || !teamProject) {
          throw new AzureDevOpsResourceNotFoundError(
            `Work item '${workItemId}' not found`,
          );
        }
        resolvedProjectId = teamProject;
      } catch (error) {
        if (error instanceof AzureDevOpsError) {
          throw error;
        }
        if (isNotFoundError(error)) {
          throw new AzureDevOpsResourceNotFoundError(
            `Work item '${workItemId}' not found`,
          );
        }
        throw error;
      }
    }

    let location: ApiResourceLocation | undefined;
    try {
      location = await witApi.vsoClient.beginGetLocation(
        WIT_AREA,
        COMMENTS_LOCATION_ID,
      );
    } catch {
      // Treat missing or failed location probe as Comments API unavailable
      location = undefined;
    }

    if (!location) {
      const updated = await witApi.updateWorkItem(
        null,
        [
          {
            op: 'add',
            path: '/fields/System.History',
            value: trimmedText,
          },
        ],
        workItemId,
        resolvedProjectId,
      );

      if (!updated) {
        throw new AzureDevOpsResourceNotFoundError(
          `Work item '${workItemId}' not found`,
        );
      }

      return {
        workItemId: updated.id ?? workItemId,
        text: trimmedText,
        version: updated.rev,
        url: updated.url,
        fallback: true,
        fallbackMethod: 'System.History',
      };
    }

    const resourceVersion = Number(location.resourceVersion ?? 0);
    const supportsFormat =
      Number.isFinite(resourceVersion) && resourceVersion >= 4;
    const requestedVersion = supportsFormat
      ? COMMENTS_API_VERSION_V4
      : COMMENTS_API_VERSION_V3;
    const queryParams = supportsFormat && format ? { format } : undefined;

    const verData = await witApi.vsoClient.getVersioningData(
      requestedVersion,
      WIT_AREA,
      COMMENTS_LOCATION_ID,
      {
        project: resolvedProjectId,
        workItemId,
      },
      queryParams,
    );

    if (!verData.requestUrl) {
      throw new AzureDevOpsError(
        `Failed to resolve comment endpoint URL for work item '${workItemId}'`,
      );
    }

    const requestOptions = witApi.createRequestOptions(
      'application/json',
      verData.apiVersion,
    );
    const response = await witApi.rest.create<Comment>(
      verData.requestUrl,
      { text: trimmedText },
      requestOptions,
    );

    if (response.statusCode === 404 || !response.result) {
      throw new AzureDevOpsResourceNotFoundError(
        `Work item '${workItemId}' not found`,
      );
    }

    return response.result;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    if (isNotFoundError(error)) {
      throw new AzureDevOpsResourceNotFoundError(
        `Work item '${workItemId}' not found`,
      );
    }
    throw new AzureDevOpsError(
      `Failed to add work item comment: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
