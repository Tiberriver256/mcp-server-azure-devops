import type { WebApi } from 'azure-devops-node-api';
import type { ICoreApi } from 'azure-devops-node-api/CoreApi.js';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import type { ListTeamsOptions, WebApiTeam } from '../types.ts';

const CORE_AREA = 'core';
const PROJECT_TEAMS_LOCATION_ID = 'd30a3dd1-f8ba-442a-b86a-bd0c0c383e59';
const ALL_TEAMS_LOCATION_ID = '7a4d9ee9-3433-4347-b47a-7a80f1cf307e';
const DEFAULT_TOP = 100;
const MAX_TOP = 1000;

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
 * Determine whether `$expandIdentity` should be sent on the wire.
 *
 * Azure DevOps Server 2019 (`5.0`) rejects `$expandIdentity` with HTTP 400
 * regardless of value, so we:
 * 1. Never send it when `expandIdentity` is `undefined` or `false` (pass `undefined`).
 * 2. When `expandIdentity === true`, probe the target `core` location's `maxVersion`
 *    and omit it on servers reporting `< 6.0`.
 */
async function resolveExpandIdentityParam(
  coreApi: ICoreApi,
  expandIdentity: boolean | undefined,
  locationId: string,
): Promise<boolean | undefined> {
  if (!expandIdentity) {
    return undefined;
  }

  if (!coreApi.vsoClient) {
    return true;
  }

  try {
    const location = await coreApi.vsoClient.beginGetLocation(
      CORE_AREA,
      locationId,
    );
    if (location?.maxVersion) {
      const parsedMax = Number.parseFloat(location.maxVersion);
      if (Number.isFinite(parsedMax) && parsedMax < 6) {
        return undefined;
      }
    }
  } catch {
    // If location lookup fails, let the main API call proceed with expandIdentity=true
  }

  return true;
}

/**
 * List teams in a specific project or across the entire organization/collection.
 *
 * When `allProjects` is `true` or no `projectId` is supplied, calls the
 * organization/collection-wide `/_apis/teams` endpoint (`coreApi.getAllTeams`).
 * Otherwise calls the project-scoped `/_apis/projects/{projectId}/teams`
 * endpoint (`coreApi.getTeams`).
 */
export async function listTeams(
  connection: WebApi,
  options: ListTeamsOptions = {},
): Promise<WebApiTeam[]> {
  const {
    projectId,
    allProjects = false,
    mine,
    top = DEFAULT_TOP,
    skip,
    expandIdentity,
  } = options;

  if (!Number.isInteger(top) || top < 1 || top > MAX_TOP) {
    throw new AzureDevOpsValidationError(
      `top must be an integer between 1 and ${MAX_TOP}`,
    );
  }

  if (skip !== undefined && (!Number.isInteger(skip) || skip < 0)) {
    throw new AzureDevOpsValidationError('skip must be a non-negative integer');
  }

  const trimmedProjectId = allProjects
    ? undefined
    : projectId?.trim() || undefined;

  try {
    const coreApi = await connection.getCoreApi();

    if (!trimmedProjectId) {
      const expandIdentityParam = await resolveExpandIdentityParam(
        coreApi,
        expandIdentity,
        ALL_TEAMS_LOCATION_ID,
      );
      const teams = await coreApi.getAllTeams(
        mine,
        top,
        skip,
        expandIdentityParam,
      );
      return teams ?? [];
    }

    const expandIdentityParam = await resolveExpandIdentityParam(
      coreApi,
      expandIdentity,
      PROJECT_TEAMS_LOCATION_ID,
    );
    const teams = await coreApi.getTeams(
      trimmedProjectId,
      mine,
      top,
      skip,
      expandIdentityParam,
    );

    if (!teams) {
      throw new AzureDevOpsResourceNotFoundError(
        `Project '${trimmedProjectId}' not found`,
      );
    }

    return teams;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    if (trimmedProjectId && isNotFoundError(error)) {
      throw new AzureDevOpsResourceNotFoundError(
        `Project '${trimmedProjectId}' not found`,
      );
    }
    throw new AzureDevOpsError(
      `Failed to list teams: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
