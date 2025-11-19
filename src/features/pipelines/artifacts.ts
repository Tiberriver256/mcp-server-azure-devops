import axios from 'axios';
import JSZip from 'jszip';
import { WebApi } from 'azure-devops-node-api';
import {
  BuildArtifact,
  ArtifactResource,
} from 'azure-devops-node-api/interfaces/BuildInterfaces';
import {
  ContainerItemType,
  FileContainerItem,
} from 'azure-devops-node-api/interfaces/FileContainerInterfaces';
import { GetArtifactExpandOptions } from 'azure-devops-node-api/interfaces/PipelinesInterfaces';
import { PipelineArtifactItem, PipelineRunArtifact } from './types';

interface ArtifactContainerInfo {
  containerId?: number;
  rootPath?: string;
}

const MAX_ITEMS_PER_ARTIFACT = 200;

function extractContainerInfo(
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

function normalizeFullPath(path: string): string {
  return path.replace(/\\+/g, '/').replace(/^\/+/, '');
}

function makeRelativePath(path: string, prefixes: string[]): string {
  const normalized = normalizeFullPath(path);
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

function mapContainerItems(
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
    if (relative.length === 0) {
      continue;
    }

    if (uniquePaths.has(relative)) {
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
): Promise<{ items?: PipelineArtifactItem[]; truncated?: boolean }> {
  const downloadUrl =
    artifact.signedContentUrl || artifact.downloadUrl || artifact.resourceUrl;

  if (!downloadUrl) {
    return {};
  }

  try {
    const response = await axios.get<ArrayBuffer>(downloadUrl, {
      responseType: 'arraybuffer',
    });

    const zip = await JSZip.loadAsync(response.data);
    const basePrefixes = [artifact.name, artifact.rootPath].filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );

    const items: PipelineArtifactItem[] = [];
    const directories = new Set<string>();

    let hitLimit = false;

    zip.forEach((entryPath, entry) => {
      if (hitLimit) {
        return;
      }

      const relative = makeRelativePath(entryPath, basePrefixes);
      if (relative.length === 0) {
        return;
      }

      if (entry.dir) {
        const folderPath = relative.replace(/\/+$/, '');
        if (folderPath.length > 0) {
          directories.add(folderPath);
        }
        return;
      }

      // Ensure parent folders are recorded even when the archive omits explicit entries
      const segments = relative.split('/');
      if (segments.length > 1) {
        for (let i = 1; i < segments.length; i += 1) {
          const folder = segments.slice(0, i).join('/');
          directories.add(folder);
        }
      }

      items.push({
        path: relative,
        itemType: 'file',
      });

      if (items.length >= MAX_ITEMS_PER_ARTIFACT) {
        hitLimit = true;
      }
    });

    const folderItems: PipelineArtifactItem[] = Array.from(directories)
      .filter((folder) => folder.length > 0)
      .map((folder) => ({ path: folder, itemType: 'folder' }));

    const combined = [...folderItems, ...items]
      .filter((entry, index, array) => {
        const duplicateIndex = array.findIndex(
          (candidate) => candidate.path === entry.path,
        );
        return duplicateIndex === index;
      })
      .sort((a, b) => a.path.localeCompare(b.path));

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
          collectors.push(listPipelineArtifactItems(artifact));
        }

        if (collectors.length === 0) {
          return artifact;
        }

        let aggregatedItems: PipelineArtifactItem[] | undefined;
        let truncated = false;

        for (const collector of collectors) {
          try {
            const result = await collector;
            if (!result.items || result.items.length === 0) {
              continue;
            }

            aggregatedItems = aggregatedItems
              ? [...aggregatedItems, ...result.items]
              : result.items;
            truncated = truncated || Boolean(result.truncated);
          } catch {
            // Continue to next collector
          }
        }

        if (!aggregatedItems || aggregatedItems.length === 0) {
          return artifact;
        }

        const uniqueItems = Array.from(
          new Map(aggregatedItems.map((item) => [item.path, item])).values(),
        ).sort((a, b) => a.path.localeCompare(b.path));

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
