import type { WebApi } from 'azure-devops-node-api';
import type { TeamContext } from 'azure-devops-node-api/interfaces/CoreInterfaces.js';
import { DayOfWeek } from 'azure-devops-node-api/interfaces/common/System.js';
import { BugsBehavior } from 'azure-devops-node-api/interfaces/WorkInterfaces.js';
import type {
  TeamFieldValues,
  TeamSetting,
  TeamSettingsIteration,
} from 'azure-devops-node-api/interfaces/WorkInterfaces.js';
import { AzureDevOpsResourceNotFoundError } from '../../../shared/errors/index.ts';
import { mapWorkApiError } from '../errors.ts';
import type {
  GetTeamSettingsOptions,
  TeamAreaPaths,
  TeamSettingsIterationRef,
  TeamSettingsResult,
} from '../types.ts';

const DAY_OF_WEEK_NAMES: Readonly<Record<DayOfWeek, string>> = {
  [DayOfWeek.Sunday]: 'sunday',
  [DayOfWeek.Monday]: 'monday',
  [DayOfWeek.Tuesday]: 'tuesday',
  [DayOfWeek.Wednesday]: 'wednesday',
  [DayOfWeek.Thursday]: 'thursday',
  [DayOfWeek.Friday]: 'friday',
  [DayOfWeek.Saturday]: 'saturday',
};

function normalizeBugsBehavior(
  value: BugsBehavior | string | number | undefined,
): string | undefined {
  if (value === BugsBehavior.Off || value === 0) {
    return 'off';
  }
  if (value === BugsBehavior.AsRequirements || value === 1) {
    return 'asRequirements';
  }
  if (value === BugsBehavior.AsTasks || value === 2) {
    return 'asTasks';
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return undefined;
}

function normalizeWorkingDays(
  days: ReadonlyArray<DayOfWeek | string | number> | undefined,
): string[] | undefined {
  if (!Array.isArray(days)) {
    return undefined;
  }
  return days.map((day) => {
    if (typeof day === 'number' && day in DAY_OF_WEEK_NAMES) {
      return DAY_OF_WEEK_NAMES[day as DayOfWeek];
    }
    if (typeof day === 'string') {
      return day.trim().toLowerCase();
    }
    return String(day);
  });
}

function normalizeIterationRef(
  ref: TeamSettingsIteration | undefined,
): TeamSettingsIterationRef | undefined {
  if (!ref) {
    return undefined;
  }
  const normalized: TeamSettingsIterationRef = {};
  if (ref.id !== undefined) {
    normalized.id = ref.id;
  }
  if (ref.name !== undefined) {
    normalized.name = ref.name;
  }
  if (ref.path !== undefined) {
    normalized.path = ref.path;
  }
  if (ref.url !== undefined) {
    normalized.url = ref.url;
  }
  return normalized;
}

function normalizeTeamAreaPaths(fieldValues: TeamFieldValues): TeamAreaPaths {
  const areaPaths: TeamAreaPaths = {
    values: (fieldValues.values ?? []).map((entry) => ({
      value: entry.value,
      includeChildren: entry.includeChildren,
    })),
  };

  if (fieldValues.field) {
    areaPaths.field = {
      referenceName: fieldValues.field.referenceName,
      url: fieldValues.field.url,
    };
  }
  if (fieldValues.defaultValue !== undefined) {
    areaPaths.defaultValue = fieldValues.defaultValue;
  }
  if (fieldValues.url !== undefined) {
    areaPaths.url = fieldValues.url;
  }

  return areaPaths;
}

function normalizeTeamSettings(
  settings: TeamSetting,
  teamFieldValues?: TeamFieldValues,
): TeamSettingsResult {
  const result: TeamSettingsResult = {};

  const backlogIteration = normalizeIterationRef(settings.backlogIteration);
  if (backlogIteration !== undefined) {
    result.backlogIteration = backlogIteration;
  }

  const defaultIteration = normalizeIterationRef(settings.defaultIteration);
  if (defaultIteration !== undefined) {
    result.defaultIteration = defaultIteration;
  }

  if (settings.defaultIterationMacro !== undefined) {
    result.defaultIterationMacro = settings.defaultIterationMacro;
  }
  if (settings.backlogVisibilities !== undefined) {
    result.backlogVisibilities = settings.backlogVisibilities;
  }

  const bugsBehavior = normalizeBugsBehavior(settings.bugsBehavior);
  if (bugsBehavior !== undefined) {
    result.bugsBehavior = bugsBehavior;
  }

  const workingDays = normalizeWorkingDays(settings.workingDays);
  if (workingDays !== undefined) {
    result.workingDays = workingDays;
  }

  if (settings.url !== undefined) {
    result.url = settings.url;
  }

  if (teamFieldValues !== undefined) {
    result.areaPaths = normalizeTeamAreaPaths(teamFieldValues);
  }

  return result;
}

/**
 * Get a team's sprint/board settings and optionally include its default and
 * allowed area paths via `workApi.getTeamFieldValues`.
 */
export async function getTeamSettings(
  connection: WebApi,
  options: GetTeamSettingsOptions,
): Promise<TeamSettingsResult> {
  const { projectId, teamId, includeAreaPaths = false } = options;
  const teamContext: TeamContext = {
    project: projectId,
    team: teamId,
  };

  try {
    const workApi = await connection.getWorkApi();

    const [settings, fieldValues] = includeAreaPaths
      ? await Promise.all([
          workApi.getTeamSettings(teamContext),
          workApi.getTeamFieldValues(teamContext),
        ])
      : [await workApi.getTeamSettings(teamContext), undefined];

    if (!settings) {
      throw new AzureDevOpsResourceNotFoundError(
        teamId
          ? `Team settings not found for project '${projectId}' team '${teamId}'`
          : `Team settings not found for project '${projectId}'`,
      );
    }

    return normalizeTeamSettings(settings, fieldValues);
  } catch (error) {
    mapWorkApiError(
      error,
      teamId
        ? `getting team settings for project '${projectId}' team '${teamId}'`
        : `getting team settings for project '${projectId}'`,
    );
  }
}
