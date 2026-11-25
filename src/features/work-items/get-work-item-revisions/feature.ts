import type { WebApi } from 'azure-devops-node-api';
import { WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import type {
  GetWorkItemRevisionsOptions,
  WorkItem,
  WorkItemExpandOption,
} from '../types.ts';

const DEFAULT_TOP = 50;
const MAX_TOP = 200;

const expandMap: Record<WorkItemExpandOption, WorkItemExpand> = {
  none: WorkItemExpand.None,
  relations: WorkItemExpand.Relations,
  fields: WorkItemExpand.Fields,
  links: WorkItemExpand.Links,
  all: WorkItemExpand.All,
};

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
 * Get revision history for a work item, or a single specific revision when
 * `revisionNumber` is provided.
 */
export async function getWorkItemRevisions(
  connection: WebApi,
  options: GetWorkItemRevisionsOptions,
): Promise<WorkItem | WorkItem[]> {
  const {
    workItemId,
    projectId,
    revisionNumber,
    top = DEFAULT_TOP,
    skip,
    expand = 'none',
  } = options;

  if (!Number.isInteger(workItemId) || workItemId <= 0) {
    throw new AzureDevOpsValidationError(
      'workItemId must be a positive integer',
    );
  }

  if (
    revisionNumber !== undefined &&
    (!Number.isInteger(revisionNumber) || revisionNumber <= 0)
  ) {
    throw new AzureDevOpsValidationError(
      'revisionNumber must be a positive integer',
    );
  }

  if (
    revisionNumber === undefined &&
    (!Number.isInteger(top) || top < 1 || top > MAX_TOP)
  ) {
    throw new AzureDevOpsValidationError(
      `top must be an integer between 1 and ${MAX_TOP}`,
    );
  }

  if (skip !== undefined && (!Number.isInteger(skip) || skip < 0)) {
    throw new AzureDevOpsValidationError('skip must be a non-negative integer');
  }

  const expandVal = expandMap[expand] ?? WorkItemExpand.None;

  try {
    const witApi = await connection.getWorkItemTrackingApi();

    if (revisionNumber !== undefined) {
      const revision = await witApi.getRevision(
        workItemId,
        revisionNumber,
        expandVal,
        projectId,
      );

      if (!revision) {
        throw new AzureDevOpsResourceNotFoundError(
          `Revision ${revisionNumber} for work item '${workItemId}' not found`,
        );
      }

      return revision;
    }

    const revisions = await witApi.getRevisions(
      workItemId,
      top,
      skip,
      expandVal,
      projectId,
    );

    if (!revisions) {
      throw new AzureDevOpsResourceNotFoundError(
        `Work item '${workItemId}' not found`,
      );
    }

    return revisions;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    if (isNotFoundError(error)) {
      if (revisionNumber !== undefined) {
        throw new AzureDevOpsResourceNotFoundError(
          `Revision ${revisionNumber} for work item '${workItemId}' not found`,
        );
      }
      throw new AzureDevOpsResourceNotFoundError(
        `Work item '${workItemId}' not found`,
      );
    }
    throw new AzureDevOpsError(
      `Failed to get work item revisions: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
