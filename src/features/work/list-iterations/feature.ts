import { types } from 'node:util';
import type { WebApi } from 'azure-devops-node-api';
import {
  TreeNodeStructureType,
  TreeStructureGroup,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import type { WorkItemClassificationNode } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import { mapWorkApiError } from '../errors.ts';
import type {
  IterationNode,
  IterationNodeAttributes,
  ListIterationsOptions,
} from '../types.ts';

export const DEFAULT_ITERATION_DEPTH = 5;
export const MIN_ITERATION_DEPTH = 0;
export const MAX_ITERATION_DEPTH = 10;

function toIsoDateString(value: unknown): string | undefined {
  if (types.isDate(value)) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return undefined;
}

function normalizeStructureType(
  value: TreeNodeStructureType | string | undefined,
): string | undefined {
  if (value === TreeNodeStructureType.Area) {
    return 'area';
  }
  if (value === TreeNodeStructureType.Iteration) {
    return 'iteration';
  }
  if (typeof value === 'string' && value.length > 0) {
    return value.toLowerCase();
  }
  return undefined;
}

function normalizeAttributes(
  raw: Record<string, unknown> | undefined,
): IterationNodeAttributes | undefined {
  if (!raw) {
    return undefined;
  }
  const startDate = toIsoDateString(raw.startDate);
  const finishDate = toIsoDateString(raw.finishDate);
  if (startDate === undefined && finishDate === undefined) {
    return undefined;
  }
  const attributes: IterationNodeAttributes = {};
  if (startDate !== undefined) {
    attributes.startDate = startDate;
  }
  if (finishDate !== undefined) {
    attributes.finishDate = finishDate;
  }
  return attributes;
}

function normalizeIterationNode(
  node: WorkItemClassificationNode,
): IterationNode {
  const result: IterationNode = {
    hasChildren: Boolean(node.hasChildren),
  };

  if (node.id !== undefined) {
    result.id = node.id;
  }
  if (node.identifier !== undefined) {
    result.identifier = node.identifier;
  }
  if (node.name !== undefined) {
    result.name = node.name;
  }
  const structureType = normalizeStructureType(node.structureType);
  if (structureType !== undefined) {
    result.structureType = structureType;
  }
  if (node.path !== undefined) {
    result.path = node.path;
  }
  const attributes = normalizeAttributes(node.attributes);
  if (attributes !== undefined) {
    result.attributes = attributes;
  }
  if (Array.isArray(node.children)) {
    result.children = node.children.map(normalizeIterationNode);
  }
  if (node.url !== undefined) {
    result.url = node.url;
  }

  return result;
}

function normalizePath(path: string | undefined): string | undefined {
  if (path === undefined) {
    return undefined;
  }
  const trimmed = path.trim().replace(/^[/\\]+|[/\\]+$/g, '');
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * List the project iteration hierarchy tree (classification nodes).
 *
 * Defaults `depth` to 5 because Azure DevOps defaults `$depth` to 0 (omitting child sprints).
 * Preserves both integer `id` and UUID `identifier` (required by `get_iteration_work_items`).
 */
export async function listIterations(
  connection: WebApi,
  options: ListIterationsOptions,
): Promise<IterationNode> {
  const { projectId, path, depth = DEFAULT_ITERATION_DEPTH } = options;

  if (
    typeof depth !== 'number' ||
    !Number.isInteger(depth) ||
    depth < MIN_ITERATION_DEPTH ||
    depth > MAX_ITERATION_DEPTH
  ) {
    throw new AzureDevOpsValidationError(
      `Invalid depth '${String(depth)}': must be an integer between ${MIN_ITERATION_DEPTH} and ${MAX_ITERATION_DEPTH}.`,
    );
  }

  const normalizedPath = normalizePath(path);

  try {
    const witApi = await connection.getWorkItemTrackingApi();
    const rootNode = await witApi.getClassificationNode(
      projectId,
      TreeStructureGroup.Iterations,
      normalizedPath,
      depth,
    );

    if (!rootNode) {
      throw new AzureDevOpsResourceNotFoundError(
        normalizedPath
          ? `Iteration node '${normalizedPath}' not found in project '${projectId}'`
          : `Iteration root node not found in project '${projectId}'`,
      );
    }

    return normalizeIterationNode(rootNode);
  } catch (error) {
    mapWorkApiError(error, `listing iterations for project '${projectId}'`);
  }
}
