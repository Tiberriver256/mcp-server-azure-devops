import type { WebApi } from 'azure-devops-node-api';
import type {
  BuildArtifact,
  ArtifactResource,
} from 'azure-devops-node-api/interfaces/BuildInterfaces';
import type { FileContainerItem } from 'azure-devops-node-api/interfaces/FileContainerInterfaces';
import { ContainerItemType } from 'azure-devops-node-api/interfaces/FileContainerInterfaces';
import { GetArtifactExpandOptions } from 'azure-devops-node-api/interfaces/PipelinesInterfaces';
import { createHttpClient } from '../../shared/http/http-client';
import type { HttpClient } from '../../shared/http/http-client';
import type { ToolContext } from '../../shared/session/azure-devops-session';
import { readZipArchive } from '../../shared/utils/zip-reader';
import type { PipelineArtifactItem, PipelineRunArtifact } from './types';

export interface ArtifactContainerInfo {
  containerId?: number;
  rootPath?: string;
}

export const MAX_ITEMS_PER_ARTIFACT = 200;
export const MAX_ARTIFACT_ZIP_BYTES = 25 * 1024 * 1024; // 25 MiB cap to prevent OOM on large artifacts

function isSameOrigin(targetUrl: string, serverUrl?: string): boolean {
  if (!serverUrl) {
    return false;
  }
  try {
    return new URL(targetUrl).origin === new URL(serverUrl).origin;
  } catch {
    return false;
  }
}

export function extractContainerInfo(
  resource?: ArtifactResource,
): ArtifactContainerInfo {
  const data = resource?.data;
  if (typeof data !== 'string' || data.length === 0) {
    return {};
  }

  const segments = data.split('/').filter((segment) => segment.length > 0);
  if (segments.length < 2) {
    return {};
  }

  const containerId = Number.parseInt(segments[1] ?? '', 10);
  if (Number.isNaN(containerId)) {
    return {};
  }

  const rootPath = segments.slice(2).join('/');

  return {
    containerId,
    rootPath: rootPath.length > 0 ? rootPath : undefined,
  };
}

function mapBuildArtifact(artifact: BuildArtifact): PipelineRunArtifact {
  const resource = artifact.resource;
  const { containerId, rootPath } = extractContainerInfo(resource);

  return {
    name: artifact.name ?? 'unknown',
    type: resource?.type,
    source: artifact.source,
    downloadUrl: resource?.downloadUrl,
    resourceUrl: resource?.url,
    containerId,
    rootPath,
  };
}

function normalizePathSegment(segment: string): string {
  return segment.replace(/^[\\/]+|[\\/]+$/g, '');
}

function normalizeFullPath(filePath: string): string {
  return filePath.replace(/\\+/g, '/').replace(/^\/+/, '');
}

export function makeRelativePath(filePath: string, prefixes: string[]): string {
  const normalized = normalizeFullPath(filePath);
  const filteredPrefixes = prefixes
    .map((prefix) => normalizePathSegment(prefix))
    .filter((prefix) => prefix.length > 0)
    .sort((a, b) => b.length - a.length);

  for (const prefix of filteredPrefixes) {
    if (normalized === prefix) {
      return '';
    }
    if (normalized.startsWith(`${prefix}/`)) {
      return normalized.slice(prefix.length + 1);
    }
  }

  return normalized;
}

export function mapContainerItems(
  items: FileContainerItem[],
  artifact: PipelineRunArtifact,
): { items: PipelineArtifactItem[]; truncated: boolean } {
  const basePrefixes = [artifact.rootPath, artifact.name].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );

  const uniquePaths = new Set<string>();
  const mapped: PipelineArtifactItem[] = [];
  let truncated = false;

  for (const item of items) {
    const relative = makeRelativePath(item.path, basePrefixes);
    if (relative.length === 0 || uniquePaths.has(relative)) {
      continue;
    }
    uniquePaths.add(relative);

    mapped.push({
      path: relative,
      itemType: item.itemType === ContainerItemType.Folder ? 'folder' : 'file',
      size: item.fileLength,
    });

    if (mapped.length >= MAX_ITEMS_PER_ARTIFACT) {
      truncated = true;
      break;
    }
  }

  mapped.sort((a, b) => a.path.localeCompare(b.path));

  return {
    items: mapped,
    truncated,
  };
}

async function listContainerItems(
  connection: WebApi,
  projectId: string,
  artifact: PipelineRunArtifact,
): Promise<{ items?: PipelineArtifactItem[]; truncated?: boolean }> {
  if (typeof artifact.containerId !== 'number') {
    return {};
  }

  const fileContainerApi =
    typeof connection.getFileContainerApi === 'function'
      ? await connection.getFileContainerApi()
      : null;

  if (!fileContainerApi || typeof fileContainerApi.getItems !== 'function') {
    return {};
  }

  const scopeCandidates = [projectId, undefined].filter(
    (scope, index, array) => array.indexOf(scope) === index,
  );

  const itemPathCandidates = [
    artifact.rootPath,
    artifact.name,
    undefined,
  ].filter((value, index, arr) => arr.indexOf(value) === index);

  for (const scope of scopeCandidates) {
    for (const itemPath of itemPathCandidates) {
      try {
        const items = await fileContainerApi.getItems(
          artifact.containerId,
          scope,
          typeof itemPath === 'string' && itemPath.length > 0
            ? itemPath
            : undefined,
        );

        if (!Array.isArray(items) || items.length === 0) {
          continue;
        }

        const { items: mapped, truncated } = mapContainerItems(items, artifact);
        if (mapped.length === 0) {
          continue;
        }

        return {
          items: mapped,
          truncated,
        };
      } catch {
        // Swallow and try next combination.
      }
    }
  }

  return {};
}

async function listPipelineArtifactItems(
  artifact: PipelineRunArtifact,
  httpClient: HttpClient,
  serverUrl?: string,
  ctx?: ToolContext,
): Promise<{ items?: PipelineArtifactItem[]; truncated?: boolean }> {
  const downloadUrl =
    artifact.signedContentUrl || artifact.downloadUrl || artifact.resourceUrl;

  if (!downloadUrl) {
    return {};
  }

  try {
    const headers: Record<string, string> = {};
    if (
      ctx &&
      !artifact.signedContentUrl &&
      isSameOrigin(downloadUrl, serverUrl)
    ) {
      headers.Authorization = await ctx.getAuthHeader();
    }

    const response = await httpClient.get<ArrayBuffer>(downloadUrl, {
      headers,
      responseType: 'arraybuffer',
      maxResponseBytes: MAX_ARTIFACT_ZIP_BYTES,
    });

    const zip = readZipArchive(response.data);
    const basePrefixes = [artifact.name, artifact.rootPath].filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );

    const itemsByPath = new Map<string, PipelineArtifactItem>();
    let fileCount = 0;
    let hitLimit = false;

    for (const entry of zip.entries) {
      if (hitLimit) {
        break;
      }

      const relative = makeRelativePath(entry.name, basePrefixes);
      if (relative.length === 0) {
        continue;
      }

      if (entry.isDirectory) {
        const folderPath = relative.replace(/\/+$/, '');
        if (folderPath.length > 0 && !itemsByPath.has(folderPath)) {
          itemsByPath.set(folderPath, { path: folderPath, itemType: 'folder' });
        }
        continue;
      }

      // Ensure parent folders are recorded even when the archive omits explicit directory entries
      const segments = relative.split('/');
      for (let i = 1; i < segments.length; i += 1) {
        const folder = segments.slice(0, i).join('/');
        if (!itemsByPath.has(folder)) {
          itemsByPath.set(folder, { path: folder, itemType: 'folder' });
        }
      }

      itemsByPath.set(relative, {
        path: relative,
        itemType: 'file',
        size: entry.uncompressedSize,
      });
      fileCount += 1;

      if (fileCount >= MAX_ITEMS_PER_ARTIFACT) {
        hitLimit = true;
      }
    }

    const combined = Array.from(itemsByPath.values()).sort((a, b) =>
      a.path.localeCompare(b.path),
    );

    const truncated = hitLimit || combined.length > MAX_ITEMS_PER_ARTIFACT;
    return {
      items: truncated ? combined.slice(0, MAX_ITEMS_PER_ARTIFACT) : combined,
      truncated,
    };
  } catch {
    return {};
  }
}

export async function fetchRunArtifacts(
  connection: WebApi,
  projectId: string,
  runId: number,
  pipelineId?: number,
  ctx?: ToolContext,
): Promise<PipelineRunArtifact[]> {
  try {
    const buildApi = await connection.getBuildApi();
    if (!buildApi || typeof buildApi.getArtifacts !== 'function') {
      return [];
    }

    const artifacts = await buildApi.getArtifacts(projectId, runId);
    if (!artifacts || artifacts.length === 0) {
      return [];
    }

    const summaries = artifacts.map(mapBuildArtifact);
    const httpClient = ctx?.http ?? createHttpClient();

    if (typeof pipelineId === 'number') {
      const pipelinesApi = await connection.getPipelinesApi();
      await Promise.all(
        summaries.map(async (summary) => {
          try {
            const artifactDetails = await pipelinesApi.getArtifact(
              projectId,
              pipelineId,
              runId,
              summary.name,
              GetArtifactExpandOptions.SignedContent,
            );

            const signedContentUrl = artifactDetails?.signedContent?.url;
            if (signedContentUrl) {
              summary.signedContentUrl = signedContentUrl;
            }
          } catch {
            // Ignore failures fetching signed content; best-effort enrichment.
          }
        }),
      );
    }

    const enriched = await Promise.all(
      summaries.map(async (artifact) => {
        const collectors: Array<
          Promise<{ items?: PipelineArtifactItem[]; truncated?: boolean }>
        > = [];

        const artifactType = artifact.type?.toLowerCase();

        if (
          artifactType === 'container' ||
          typeof artifact.containerId === 'number'
        ) {
          collectors.push(listContainerItems(connection, projectId, artifact));
        }

        if (artifactType?.includes('pipelineartifact')) {
          collectors.push(
            listPipelineArtifactItems(
              artifact,
              httpClient,
              connection.serverUrl,
              ctx,
            ),
          );
        }

        if (collectors.length === 0) {
          return artifact;
        }

        const merged = new Map<string, PipelineArtifactItem>();
        let truncated = false;

        for (const collector of collectors) {
          try {
            const result = await collector;
            if (!result.items || result.items.length === 0) {
              continue;
            }
            for (const item of result.items) {
              merged.set(item.path, item);
            }
            truncated = truncated || Boolean(result.truncated);
          } catch {
            // Continue to next collector
          }
        }

        if (merged.size === 0) {
          return artifact;
        }

        const uniqueItems = Array.from(merged.values()).sort((a, b) =>
          a.path.localeCompare(b.path),
        );

        return {
          ...artifact,
          items:
            uniqueItems.length > MAX_ITEMS_PER_ARTIFACT
              ? uniqueItems.slice(0, MAX_ITEMS_PER_ARTIFACT)
              : uniqueItems,
          itemsTruncated:
            truncated ||
            uniqueItems.length > MAX_ITEMS_PER_ARTIFACT ||
            undefined,
        };
      }),
    );

    return enriched;
  } catch {
    return [];
  }
}

export function getArtifactContainerInfo(
  artifact: PipelineRunArtifact,
): ArtifactContainerInfo {
  return {
    containerId: artifact.containerId,
    rootPath: artifact.rootPath,
  };
}

export function parseArtifactContainer(
  resource?: ArtifactResource,
): ArtifactContainerInfo {
  return extractContainerInfo(resource);
}
