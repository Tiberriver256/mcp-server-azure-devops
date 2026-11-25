import type { WebApi } from 'azure-devops-node-api';
import type { BuildArtifact } from 'azure-devops-node-api/interfaces/BuildInterfaces';
import { GetArtifactExpandOptions } from 'azure-devops-node-api/interfaces/PipelinesInterfaces';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import {
  createHttpClient,
  isHttpError,
  mapHttpErrorToAzureDevOpsError,
} from '../../../shared/http/http-client';
import type { ToolContext } from '../../../shared/session/azure-devops-session';
import { streamToBuffer } from '../../../shared/utils/stream';
import { readZipArchive } from '../../../shared/utils/zip-reader';
import type {
  ZipArchive,
  ZipEntryMeta,
} from '../../../shared/utils/zip-reader';
import { MAX_ARTIFACT_ZIP_BYTES, parseArtifactContainer } from '../artifacts';
import {
  isSameOrigin,
  resolvePipelineId,
  resolvePipelineProjectId,
} from '../helpers';
import type {
  DownloadPipelineArtifactOptions,
  PipelineArtifactContent,
} from '../types';

export function normalizeArtifactPath(artifactPath: string): {
  artifactName: string;
  relativePath: string;
} {
  const trimmed = artifactPath.trim();
  if (trimmed.length === 0) {
    throw new AzureDevOpsResourceNotFoundError(
      'Artifact path must include the artifact name and file path.',
    );
  }

  const sanitized = trimmed.replace(/^[\\/]+/, '').replace(/[\\/]+$/, '');
  const segments = sanitized
    .split(/[\\/]+/)
    .filter((segment) => segment.length > 0);

  const artifactName = segments.shift();
  if (!artifactName) {
    throw new AzureDevOpsResourceNotFoundError(
      'Artifact path must include the artifact name and file path.',
    );
  }

  if (segments.length === 0) {
    throw new AzureDevOpsResourceNotFoundError(
      'Please specify a file path inside the artifact (e.g. <artifact>/<path/to/file>).',
    );
  }

  return {
    artifactName,
    relativePath: segments.join('/'),
  };
}

function joinPaths(...parts: Array<string | undefined>): string {
  return parts
    .filter(
      (part): part is string => typeof part === 'string' && part.length > 0,
    )
    .map((part) => part.replace(/^[\\/]+|[\\/]+$/g, ''))
    .filter((part) => part.length > 0)
    .join('/');
}

export function buildContainerPathCandidates(
  artifactName: string,
  rootPath: string | undefined,
  relativePath: string,
): string[] {
  const normalizedRelative = relativePath.replace(/^[\\/]+/, '');
  const candidates = new Set<string>();

  candidates.add(normalizedRelative);
  candidates.add(joinPaths(rootPath, normalizedRelative));
  candidates.add(joinPaths(artifactName, normalizedRelative));
  candidates.add(joinPaths(rootPath, artifactName, normalizedRelative));
  candidates.add(joinPaths(artifactName, rootPath, normalizedRelative));

  return Array.from(candidates).filter((candidate) => candidate.length > 0);
}

async function getContainerItemStream(
  connection: WebApi,
  containerId: number,
  projectId: string,
  candidatePaths: string[],
): Promise<{ stream: NodeJS.ReadableStream; path: string } | null> {
  if (typeof connection.getFileContainerApi !== 'function') {
    return null;
  }

  const fileContainerApi = await connection.getFileContainerApi();
  if (!fileContainerApi || typeof fileContainerApi.getItem !== 'function') {
    return null;
  }

  const scopeCandidates = [projectId, undefined].filter(
    (scope, index, array) => array.indexOf(scope) === index,
  );

  for (const candidatePath of candidatePaths) {
    for (const scope of scopeCandidates) {
      try {
        const response = await fileContainerApi.getItem(
          containerId,
          scope,
          candidatePath,
        );

        if (response.statusCode === 404) {
          continue;
        }

        if (response.result) {
          return { stream: response.result, path: candidatePath };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/\b403\b|forbidden|access/i.test(message)) {
          throw new AzureDevOpsAuthenticationError(
            `Failed to access container ${containerId}: ${message}`,
          );
        }
        // Ignore other errors and try the next variation; the container API
        // returns 400 for invalid paths, which we treat as a miss.
      }
    }
  }

  return null;
}

function normalizeZipPath(filePath: string): string {
  return filePath.replace(/^[\\/]+|[\\/]+$/g, '').replace(/\\+/g, '/');
}

export function selectZipEntry(
  zip: ZipArchive,
  relativePath: string,
  artifactName: string,
  rootPath?: string,
): ZipEntryMeta | null {
  const normalized = normalizeZipPath(relativePath);
  const normalizedArtifactName = artifactName
    ? normalizeZipPath(artifactName)
    : '';
  const normalizedRootPath = rootPath ? normalizeZipPath(rootPath) : '';
  const candidates = [normalized];

  if (normalizedArtifactName) {
    candidates.push(`${normalizedArtifactName}/${normalized}`);
  }

  if (normalizedRootPath) {
    candidates.push(`${normalizedRootPath}/${normalized}`);
    if (normalizedArtifactName) {
      candidates.push(
        `${normalizedArtifactName}/${normalizedRootPath}/${normalized}`,
      );
    }
  }

  const fileEntries = (zip.entries ?? [])
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({
      entry,
      normalizedName: normalizeZipPath(entry.name),
    }));

  for (const candidate of candidates) {
    const exact = zip.findEntry(candidate);
    if (exact && !exact.isDirectory) {
      return exact;
    }
    const normalizedMatch = fileEntries.find(
      (item) => item.normalizedName === candidate,
    );
    if (normalizedMatch) {
      return normalizedMatch.entry;
    }
  }

  const suffix = `/${normalized}`;
  const fallbackMatches = fileEntries.filter(
    (item) =>
      item.normalizedName === normalized ||
      item.normalizedName.endsWith(suffix),
  );

  if (fallbackMatches.length > 0) {
    fallbackMatches.sort(
      (a, b) => a.normalizedName.length - b.normalizedName.length,
    );
    return fallbackMatches[0]?.entry ?? null;
  }

  return null;
}

async function downloadFromContainer(
  connection: WebApi,
  projectId: string,
  artifactName: string,
  artifact: BuildArtifact,
  relativePath: string,
): Promise<PipelineArtifactContent | null> {
  const { containerId, rootPath } = parseArtifactContainer(artifact.resource);
  if (typeof containerId !== 'number') {
    return null;
  }
  const pathCandidates = buildContainerPathCandidates(
    artifactName,
    rootPath,
    relativePath,
  );

  const resolved = await getContainerItemStream(
    connection,
    containerId,
    projectId,
    pathCandidates,
  );

  if (!resolved) {
    throw new AzureDevOpsResourceNotFoundError(
      `File ${relativePath} not found in artifact ${artifactName}.`,
    );
  }

  const buffer = await streamToBuffer(resolved.stream, MAX_ARTIFACT_ZIP_BYTES);
  return {
    artifact: artifactName,
    path: resolved.path,
    content: buffer.toString('utf8'),
  };
}

async function downloadFromPipelineArtifact(
  connection: WebApi,
  projectId: string,
  runId: number,
  artifactName: string,
  artifact: BuildArtifact,
  relativePath: string,
  pipelineId?: number,
  ctx?: ToolContext,
): Promise<PipelineArtifactContent> {
  const resolvedPipelineId = await resolvePipelineId(
    connection,
    projectId,
    runId,
    pipelineId,
  );

  if (typeof resolvedPipelineId !== 'number') {
    throw new AzureDevOpsResourceNotFoundError(
      `Unable to resolve pipeline identifier for artifact ${artifactName}.`,
    );
  }

  const pipelinesApi = await connection.getPipelinesApi();
  const artifactDetails = await pipelinesApi.getArtifact(
    projectId,
    resolvedPipelineId,
    runId,
    artifactName,
    GetArtifactExpandOptions.SignedContent,
  );

  const signedContentUrl = artifactDetails?.signedContent?.url;
  const downloadUrl =
    signedContentUrl || artifact.resource?.downloadUrl || artifactDetails?.url;

  if (!downloadUrl) {
    throw new AzureDevOpsResourceNotFoundError(
      `Artifact ${artifactName} does not expose downloadable content.`,
    );
  }

  const httpClient = ctx?.http ?? createHttpClient();
  const headers: Record<string, string> = {};
  if (
    ctx &&
    !signedContentUrl &&
    isSameOrigin(downloadUrl, connection.serverUrl)
  ) {
    headers.Authorization = await ctx.getAuthHeader();
  }

  const response = await httpClient.get<ArrayBuffer>(downloadUrl, {
    headers,
    responseType: 'arraybuffer',
    maxResponseBytes: MAX_ARTIFACT_ZIP_BYTES,
  });

  const zip = readZipArchive(response.data);
  const file = selectZipEntry(
    zip,
    relativePath,
    artifactName,
    parseArtifactContainer(artifact.resource).rootPath,
  );

  if (!file) {
    throw new AzureDevOpsResourceNotFoundError(
      `File ${relativePath} not found in artifact ${artifactName}.`,
    );
  }

  const content = zip.readEntryText(file, MAX_ARTIFACT_ZIP_BYTES);
  return {
    artifact: artifactName,
    path: file.name,
    content,
  };
}

export async function downloadPipelineArtifact(
  connection: WebApi,
  options: DownloadPipelineArtifactOptions,
  ctx?: ToolContext,
): Promise<PipelineArtifactContent> {
  try {
    const projectId = ctx
      ? ctx.resolveProjectId(options.projectId)
      : resolvePipelineProjectId(options.projectId);
    const runId = options.runId;
    const { artifactName, relativePath } = normalizeArtifactPath(
      options.artifactPath,
    );

    const buildApi = await connection.getBuildApi();

    let artifacts: BuildArtifact[];
    try {
      artifacts = await buildApi.getArtifacts(projectId, runId);
    } catch (error) {
      throw new AzureDevOpsResourceNotFoundError(
        `Pipeline run ${runId} not found in project ${projectId}: ${String(error)}`,
      );
    }

    const artifact = artifacts.find((item) => item.name === artifactName);
    if (!artifact) {
      throw new AzureDevOpsResourceNotFoundError(
        `Artifact ${artifactName} not found for run ${runId} in project ${projectId}.`,
      );
    }

    const containerResult = await downloadFromContainer(
      connection,
      projectId,
      artifactName,
      artifact,
      relativePath,
    );

    if (containerResult) {
      return containerResult;
    }

    return await downloadFromPipelineArtifact(
      connection,
      projectId,
      runId,
      artifactName,
      artifact,
      relativePath,
      options.pipelineId,
      ctx,
    );
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    if (isHttpError(error)) {
      throw mapHttpErrorToAzureDevOpsError(
        error,
        'downloading pipeline artifact',
      );
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (
        message.includes('authentication') ||
        message.includes('unauthorized') ||
        message.includes('401')
      ) {
        throw new AzureDevOpsAuthenticationError(
          `Failed to authenticate: ${error.message}`,
        );
      }

      if (
        message.includes('not found') ||
        message.includes('does not exist') ||
        message.includes('404')
      ) {
        throw new AzureDevOpsResourceNotFoundError(
          `Pipeline artifact or project not found: ${error.message}`,
        );
      }
    }

    throw new AzureDevOpsError(
      `Failed to download pipeline artifact: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
