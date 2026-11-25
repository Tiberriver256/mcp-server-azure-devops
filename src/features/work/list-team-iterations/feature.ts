import { types } from 'node:util';
import type { WebApi } from 'azure-devops-node-api';
import type { TeamContext } from 'azure-devops-node-api/interfaces/CoreInterfaces.js';
import { TimeFrame } from 'azure-devops-node-api/interfaces/WorkInterfaces.js';
import type { TeamSettingsIteration } from 'azure-devops-node-api/interfaces/WorkInterfaces.js';
import { AzureDevOpsResourceNotFoundError } from '../../../shared/errors/index.ts';
import { mapWorkApiError } from '../errors.ts';
import type {
  IterationTimeFrame,
  ListTeamIterationsOptions,
  TeamIteration,
  TeamIterationAttributes,
} from '../types.ts';

function toIsoDateString(value: unknown): string | undefined {
  if (types.isDate(value)) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return undefined;
}

/**
 * Normalize Azure DevOps iteration timeFrame values across both numeric enum
 * (TimeFrame.Past = 0, Current = 1, Future = 2) and raw string representations.
 */
export function normalizeTimeFrame(
  value: TimeFrame | string | number | undefined,
): IterationTimeFrame | undefined {
  if (value === TimeFrame.Past || value === 0) {
    return 'past';
  }
  if (value === TimeFrame.Current || value === 1) {
    return 'current';
  }
  if (value === TimeFrame.Future || value === 2) {
    return 'future';
  }
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'past' || lower === 'current' || lower === 'future') {
      return lower;
    }
  }
  return undefined;
}

function normalizeTeamIteration(
  iteration: TeamSettingsIteration,
): TeamIteration {
  const result: TeamIteration = {};

  if (iteration.id !== undefined) {
    result.id = iteration.id;
  }
  if (iteration.name !== undefined) {
    result.name = iteration.name;
  }
  if (iteration.path !== undefined) {
    result.path = iteration.path;
  }

  if (iteration.attributes) {
    const attributes: TeamIterationAttributes = {};
    const startDate = toIsoDateString(iteration.attributes.startDate);
    const finishDate = toIsoDateString(iteration.attributes.finishDate);
    const timeFrame = normalizeTimeFrame(iteration.attributes.timeFrame);

    if (startDate !== undefined) {
      attributes.startDate = startDate;
    }
    if (finishDate !== undefined) {
      attributes.finishDate = finishDate;
    }
    if (timeFrame !== undefined) {
      attributes.timeFrame = timeFrame;
    }

    if (
      attributes.startDate !== undefined ||
      attributes.finishDate !== undefined ||
      attributes.timeFrame !== undefined
    ) {
      result.attributes = attributes;
    }
  }

  if (iteration.url !== undefined) {
    result.url = iteration.url;
  }

  return result;
}

/**
 * List a team's configured iterations (sprints).
 *
 * Azure DevOps REST `$timeframe` ONLY supports `'current'`; passing `'past'` or `'future'`
 * on the wire returns HTTP 400 on both Cloud and Server. For `'past'` and `'future'`,
 * omit `$timeframe` on the wire and filter client-side by `attributes.timeFrame`.
 */
export async function listTeamIterations(
  connection: WebApi,
  options: ListTeamIterationsOptions,
): Promise<TeamIteration[]> {
  const { projectId, teamId, timeframe } = options;
  const teamContext: TeamContext = {
    project: projectId,
    team: teamId,
  };

  // Only 'current' is valid for Azure DevOps REST $timeframe query parameter
  const wireTimeframe = timeframe === 'current' ? 'current' : undefined;

  try {
    const workApi = await connection.getWorkApi();
    const rawIterations = await workApi.getTeamIterations(
      teamContext,
      wireTimeframe,
    );
    if (rawIterations === null || rawIterations === undefined) {
      throw new AzureDevOpsResourceNotFoundError(
        teamId
          ? `Team '${teamId}' or project '${projectId}' was not found`
          : `Project '${projectId}' was not found`,
      );
    }

    const normalized = rawIterations.map(normalizeTeamIteration);

    if (timeframe === 'past' || timeframe === 'future') {
      return normalized.filter(
        (iter) => iter.attributes?.timeFrame === timeframe,
      );
    }

    return normalized;
  } catch (error) {
    mapWorkApiError(
      error,
      teamId
        ? `listing team iterations for project '${projectId}' team '${teamId}'`
        : `listing team iterations for project '${projectId}'`,
    );
  }
}
