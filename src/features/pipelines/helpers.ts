import { WebApi } from 'azure-devops-node-api';
import { Build } from 'azure-devops-node-api/interfaces/BuildInterfaces';

export function coercePipelineId(id: unknown): number | undefined {
  if (typeof id === 'number') {
    return id;
  }

  if (typeof id === 'string') {
    const parsed = Number.parseInt(id, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
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
