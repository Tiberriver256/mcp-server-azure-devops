import { WebApi } from 'azure-devops-node-api';

/**
 * List artifacts for a build
 */
export async function listBuildArtifacts(
  connection: WebApi,
  options: {
    projectId?: string;
    buildId: number;
  },
): Promise<{
  artifacts: Array<{
    id: number;
    name: string;
    source?: string;
    size?: number;
    downloadUrl?: string;
  }>;
  count: number;
}> {
  const buildApi = await connection.getBuildApi();
  const projectId = options.projectId ?? 'CCTV';

  const artifacts = await buildApi.getArtifacts(projectId, options.buildId);

  return {
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id ?? 0,
      name: artifact.name ?? '',
      source: artifact.source,
      size: artifact.resource?.properties?.artifactsize
        ? parseInt(artifact.resource.properties.artifactsize)
        : undefined,
      downloadUrl: artifact.resource?.downloadUrl,
    })),
    count: artifacts.length,
  };
}

/**
 * Get specific artifact details
 */
export async function getBuildArtifact(
  connection: WebApi,
  options: {
    projectId?: string;
    buildId: number;
    artifactName: string;
  },
): Promise<{
  id: number;
  name: string;
  source?: string;
  downloadUrl?: string;
  size?: number;
  files?: Array<{
    path: string;
    size?: number;
  }>;
}> {
  const buildApi = await connection.getBuildApi();
  const projectId = options.projectId ?? 'CCTV';

  const artifact = await buildApi.getArtifact(
    projectId,
    options.buildId,
    options.artifactName,
  );

  // Get artifact file details if available
  let files: Array<{ path: string; size?: number }> = [];

  if (artifact.resource?.data) {
    // Parse the manifest if it's available
    try {
      const manifestUrl = artifact.resource.downloadUrl?.replace(
        '?format=zip',
        '?format=json',
      );
      if (manifestUrl) {
        const response = await fetch(manifestUrl);
        if (response.ok) {
          const manifest = await response.json();
          if (manifest.items) {
            files = manifest.items.map((item: any) => ({
              path: item.path,
              size: item.blob?.size,
            }));
          }
        }
      }
    } catch (error) {
      console.error('Failed to get artifact manifest:', error);
    }
  }

  return {
    id: artifact.id ?? 0,
    name: artifact.name ?? '',
    source: artifact.source,
    downloadUrl: artifact.resource?.downloadUrl,
    size: artifact.resource?.properties?.artifactsize
      ? parseInt(artifact.resource.properties.artifactsize)
      : undefined,
    files,
  };
}
