import type { WebApi } from 'azure-devops-node-api';
import type { TeamContext } from 'azure-devops-node-api/interfaces/CoreInterfaces.js';
import type { WorkItem } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import { UUID_REGEX } from '../../../shared/session/identity-resolver.ts';
import { mapWorkApiError } from '../errors.ts';
import type {
  GetIterationWorkItemsOptions,
  IterationWorkItemsResult,
} from '../types.ts';

export const MAX_WORK_ITEM_HYDRATION_BATCH_SIZE = 200;

/**
 * Validate that an iterationId is a canonical UUID (GUID), failing fast with
 * AzureDevOpsValidationError before any network or authentication work occurs.
 */
export function assertValidIterationId(iterationId: string): string {
  const normalized = typeof iterationId === 'string' ? iterationId.trim() : '';
  if (!UUID_REGEX.test(normalized)) {
    throw new AzureDevOpsValidationError(
      `Invalid iterationId '${String(iterationId)}': must be a valid UUID (GUID). Use the 'identifier' field from list_iterations or 'id' from list_team_iterations, not an integer ID.`,
    );
  }
  return normalized;
}

/**
 * Fetch work item relations assigned to a team iteration by iteration UUID,
 * optionally hydrating full work item details in batches of up to 200 items.
 */
export async function getIterationWorkItems(
  connection: WebApi,
  options: GetIterationWorkItemsOptions,
): Promise<IterationWorkItemsResult> {
  const {
    projectId,
    teamId,
    iterationId,
    includeWorkItemDetails = false,
    fields,
  } = options;

  const normalizedIterationId = assertValidIterationId(iterationId);

  const teamContext: TeamContext = {
    project: projectId,
    team: teamId,
  };

  try {
    const workApi = await connection.getWorkApi();
    const iterationWorkItems = await workApi.getIterationWorkItems(
      teamContext,
      normalizedIterationId,
    );

    if (!iterationWorkItems) {
      throw new AzureDevOpsResourceNotFoundError(
        `Iteration '${normalizedIterationId}' not found in project '${projectId}'`,
      );
    }

    const workItemRelations = iterationWorkItems.workItemRelations ?? [];
    const seenIds = new Set<number>();
    const workItemIds: number[] = [];

    for (const relation of workItemRelations) {
      const targetId = relation.target?.id;
      if (
        typeof targetId === 'number' &&
        Number.isInteger(targetId) &&
        !seenIds.has(targetId)
      ) {
        seenIds.add(targetId);
        workItemIds.push(targetId);
      }
    }

    let hydratedWorkItems: WorkItem[] | undefined;
    if (includeWorkItemDetails) {
      hydratedWorkItems = [];
      if (workItemIds.length > 0) {
        const witApi = await connection.getWorkItemTrackingApi();
        const requestedFields =
          fields && fields.length > 0 ? fields : undefined;

        for (
          let offset = 0;
          offset < workItemIds.length;
          offset += MAX_WORK_ITEM_HYDRATION_BATCH_SIZE
        ) {
          const batchIds = workItemIds.slice(
            offset,
            offset + MAX_WORK_ITEM_HYDRATION_BATCH_SIZE,
          );
          const batchItems = await witApi.getWorkItems(
            batchIds,
            requestedFields,
            undefined,
            undefined,
            undefined,
            projectId,
          );
          if (Array.isArray(batchItems)) {
            for (const item of batchItems) {
              if (item !== undefined) {
                hydratedWorkItems.push(item);
              }
            }
          }
        }
      }
    }

    const result: IterationWorkItemsResult = {
      iterationId: normalizedIterationId,
      projectId,
      count: workItemIds.length,
      workItemIds,
      workItemRelations,
    };

    if (teamId !== undefined) {
      result.teamId = teamId;
    }
    if (hydratedWorkItems !== undefined) {
      result.workItems = hydratedWorkItems;
    }
    if (iterationWorkItems.url !== undefined) {
      result.url = iterationWorkItems.url;
    }

    return result;
  } catch (error) {
    mapWorkApiError(
      error,
      `getting work items for iteration '${normalizedIterationId}' in project '${projectId}'`,
    );
  }
}
