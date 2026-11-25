import type { WebApi } from 'azure-devops-node-api';
import type { Build } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { DEFAULT_API_VERSION } from '../../shared/session/azure-devops-session';

const NO_DEFAULT_PROJECT = 'no default project';

/**
 * Strictly coerce a pipeline/definition identifier to a positive integer.
 * Rejects NaN, Infinity, non-integers, and trailing-garbage strings like "123abc".
 */
export function coercePipelineId(id: unknown): number | undefined {
  if (typeof id === 'number') {
    return Number.isSafeInteger(id) && id > 0 ? id : undefined;
  }

  if (typeof id === 'string') {
    const trimmed = id.trim();
    if (!/^\d+$/.test(trimmed)) {
      return undefined;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  return undefined;
}

export function resolvePipelineApiVersion(explicit?: string): string {
  const candidate = (explicit ?? process.env.AZURE_DEVOPS_API_VERSION)?.trim();
  return candidate && candidate.length > 0 ? candidate : DEFAULT_API_VERSION;
}

export function resolvePipelineProjectId(explicit?: string): string {
  const candidate = (
    explicit ?? process.env.AZURE_DEVOPS_DEFAULT_PROJECT
  )?.trim();
  if (candidate && candidate.length > 0 && candidate !== NO_DEFAULT_PROJECT) {
    return candidate;
  }
  return '';
}

export async function resolvePipelineId(
  connection: WebApi,
  projectId: string,
  runId: number,
  providedPipelineId?: number,
): Promise<number | undefined> {
  if (typeof providedPipelineId === 'number') {
    return providedPipelineId;
  }

  try {
    const buildApi = await connection.getBuildApi();
    const build = (await buildApi.getBuild(projectId, runId)) as
      | Build
      | undefined;
    return coercePipelineId(build?.definition?.id);
  } catch {
    // Swallow errors here; we'll handle not-found later when the main request fails
    return undefined;
  }
}
