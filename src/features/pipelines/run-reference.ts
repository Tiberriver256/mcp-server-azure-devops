import { WebApi } from 'azure-devops-node-api';
import {
  Build,
  BuildDefinitionReference,
  BuildQueryOrder,
} from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { z } from 'zod';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../shared/errors';

/**
 * Human-friendly ways to reference a pipeline and one of its runs.
 * Exactly one of `pipelineId` / `pipelineName` may identify the pipeline and
 * exactly one of `runId` / `buildNumber` identifies the run.
 */
export interface RunReferenceInput {
  pipelineId?: number;
  pipelineName?: string;
  runId?: number;
  buildNumber?: string;
}

export interface ResolvedRunReference {
  runId: number;
  pipelineId?: number;
}

const MAX_CANDIDATES_SHOWN = 10;

export const pipelineNameField = z
  .string()
  .trim()
  .min(1)
  .optional()
  .describe(
    'Pipeline (build definition) name, as shown in the Azure DevOps UI. Alternative to pipelineId. ' +
      'Prefix it with its folder path to disambiguate pipelines that share a name (e.g. "Backend/Deploy").',
  );

export const buildNumberField = z
  .string()
  .trim()
  .min(1)
  .optional()
  .describe(
    'Build number / run name as shown in the Azure DevOps UI (e.g. "20240115.3"). Alternative to runId; ' +
      'combine with pipelineName or pipelineId to make it unambiguous.',
  );

/**
 * Validation shared by all schemas that accept a run reference.
 */
export function refineRunReference(
  data: RunReferenceInput,
  ctx: z.RefinementCtx,
): void {
  if (data.pipelineId !== undefined && data.pipelineName !== undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'Provide either pipelineId or pipelineName, not both',
      path: ['pipelineName'],
    });
  }

  if (data.runId !== undefined && data.buildNumber !== undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'Provide either runId or buildNumber, not both',
      path: ['buildNumber'],
    });
  }

  if (data.runId === undefined && data.buildNumber === undefined) {
    ctx.addIssue({
      code: 'custom',
      message:
        'Either runId or buildNumber (ideally together with pipelineName or pipelineId) is required',
      path: ['runId'],
    });
  }
}

/**
 * Validation for schemas that need a pipeline but no run.
 */
export function refinePipelineReference(
  data: Pick<RunReferenceInput, 'pipelineId' | 'pipelineName'>,
  ctx: z.RefinementCtx,
): void {
  if (data.pipelineId !== undefined && data.pipelineName !== undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'Provide either pipelineId or pipelineName, not both',
      path: ['pipelineName'],
    });
  }

  if (data.pipelineId === undefined && data.pipelineName === undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'Either pipelineId or pipelineName is required',
      path: ['pipelineId'],
    });
  }
}

/**
 * Splits an optional folder prefix from a pipeline name.
 * "\\Backend\\Deploy" or "Backend/Deploy" -> { folder: "\\Backend", name: "Deploy" }
 */
export function parsePipelineName(input: string): {
  name: string;
  folder?: string;
} {
  const segments = input
    .trim()
    .split(/[\\/]+/)
    .filter((segment) => segment.length > 0);

  const name = segments.pop() ?? input.trim();
  if (segments.length === 0) {
    return { name };
  }

  return { name, folder: `\\${segments.join('\\')}` };
}

function normalizeFolder(path: string | undefined): string {
  const segments = (path ?? '')
    .split(/[\\/]+/)
    .filter((segment) => segment.length > 0);
  return `\\${segments.join('\\')}`.toLowerCase();
}

function describeDefinition(definition: BuildDefinitionReference): string {
  const folder = (definition.path ?? '')
    .split(/[\\/]+/)
    .filter((segment) => segment.length > 0)
    .join('/');
  const fullName = folder ? `${folder}/${definition.name}` : definition.name;
  return `${fullName} (id ${definition.id})`;
}

function describeCandidates(lines: string[]): string {
  const shown = lines.slice(0, MAX_CANDIDATES_SHOWN).map((line) => `- ${line}`);
  if (lines.length > MAX_CANDIDATES_SHOWN) {
    shown.push(`- ... and ${lines.length - MAX_CANDIDATES_SHOWN} more`);
  }
  return shown.join('\n');
}

/**
 * Resolves a pipeline (build definition) name to its numeric ID.
 */
export async function resolvePipelineIdByName(
  connection: WebApi,
  projectId: string,
  pipelineName: string,
): Promise<number> {
  const { name, folder } = parsePipelineName(pipelineName);
  const buildApi = await connection.getBuildApi();

  const definitions = ((await buildApi.getDefinitions(projectId, name)) ??
    []) as BuildDefinitionReference[];

  const matches = definitions.filter(
    (definition) =>
      typeof definition.id === 'number' &&
      definition.name?.toLowerCase() === name.toLowerCase() &&
      (folder === undefined ||
        normalizeFolder(definition.path) === normalizeFolder(folder)),
  );

  if (matches.length === 1) {
    return matches[0].id as number;
  }

  if (matches.length > 1) {
    throw new AzureDevOpsValidationError(
      `Pipeline name "${pipelineName}" is ambiguous in project ${projectId}. ` +
        `Prefix it with its folder path (e.g. "Folder/${name}") or use pipelineId:\n` +
        describeCandidates(matches.map(describeDefinition)),
    );
  }

  // No exact match: look for similar names to give the caller something to work with.
  let suggestions: BuildDefinitionReference[] = [];
  try {
    suggestions = ((await buildApi.getDefinitions(projectId, `*${name}*`)) ??
      []) as BuildDefinitionReference[];
  } catch {
    suggestions = [];
  }

  const hint =
    suggestions.length > 0
      ? `\nDid you mean one of:\n${describeCandidates(suggestions.map(describeDefinition))}`
      : '';

  throw new AzureDevOpsResourceNotFoundError(
    `Pipeline "${pipelineName}" not found in project ${projectId}.${hint}`,
  );
}

function describeBuild(build: Build): string {
  const parts = [`runId ${build.id}`];
  if (build.definition?.name) {
    parts.push(
      `pipeline "${build.definition.name}" (id ${build.definition.id})`,
    );
  }
  if (build.queueTime) {
    parts.push(`queued ${new Date(build.queueTime).toISOString()}`);
  }
  return parts.join(', ');
}

/**
 * Resolves a build number (run name) to the numeric run ID.
 */
export async function resolveRunIdByBuildNumber(
  connection: WebApi,
  projectId: string,
  buildNumber: string,
  pipelineId?: number,
): Promise<{ runId: number; pipelineId?: number }> {
  const buildApi = await connection.getBuildApi();

  const builds = ((await buildApi.getBuilds(
    projectId,
    typeof pipelineId === 'number' ? [pipelineId] : undefined,
    undefined,
    buildNumber,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    MAX_CANDIDATES_SHOWN + 1,
    undefined,
    undefined,
    undefined,
    BuildQueryOrder.QueueTimeDescending,
  )) ?? []) as Build[];

  const matches = builds.filter((build) => typeof build.id === 'number');
  const scope =
    typeof pipelineId === 'number'
      ? `pipeline ${pipelineId} in project ${projectId}`
      : `project ${projectId}`;

  if (matches.length === 0) {
    throw new AzureDevOpsResourceNotFoundError(
      `No run with build number "${buildNumber}" found for ${scope}. ` +
        'It may have been deleted by retention policies.',
    );
  }

  if (matches.length > 1) {
    const advice =
      typeof pipelineId === 'number'
        ? 'Use runId to pick one'
        : 'Add pipelineName or pipelineId, or use runId';
    throw new AzureDevOpsValidationError(
      `Build number "${buildNumber}" matches ${matches.length > MAX_CANDIDATES_SHOWN ? 'more than ' + MAX_CANDIDATES_SHOWN : matches.length} runs for ${scope}. ${advice}:\n` +
        describeCandidates(matches.map(describeBuild)),
    );
  }

  const [build] = matches;
  return {
    runId: build.id as number,
    pipelineId:
      typeof build.definition?.id === 'number'
        ? build.definition.id
        : pipelineId,
  };
}

/**
 * Resolves a pipeline reference (ID or name) to a numeric pipeline ID.
 */
export async function resolvePipelineReference(
  connection: WebApi,
  projectId: string,
  input: Pick<RunReferenceInput, 'pipelineId' | 'pipelineName'>,
): Promise<number | undefined> {
  if (typeof input.pipelineId === 'number') {
    return input.pipelineId;
  }

  if (input.pipelineName) {
    return resolvePipelineIdByName(connection, projectId, input.pipelineName);
  }

  return undefined;
}

/**
 * Resolves any supported combination of pipeline/run identifiers to numeric IDs.
 */
export async function resolveRunReference(
  connection: WebApi,
  projectId: string,
  input: RunReferenceInput,
): Promise<ResolvedRunReference> {
  const pipelineId = await resolvePipelineReference(
    connection,
    projectId,
    input,
  );

  if (typeof input.runId === 'number') {
    return { runId: input.runId, pipelineId };
  }

  if (input.buildNumber) {
    return resolveRunIdByBuildNumber(
      connection,
      projectId,
      input.buildNumber,
      pipelineId,
    );
  }

  throw new AzureDevOpsValidationError(
    'Either runId or buildNumber is required to identify a pipeline run',
  );
}
