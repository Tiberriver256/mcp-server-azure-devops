import { WebApi } from 'azure-devops-node-api';
import * as PipelinesInterfaces from 'azure-devops-node-api/interfaces/PipelinesInterfaces';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { GetPipelineLogContentOptions } from '../types';

/**
 * Cache to store downloaded log paths for reuse
 * Key format: "projectId:pipelineId:runId"
 */
const downloadCache = new Map<string, { path: string; timestamp: number }>();

/**
 * Cache lifetime in milliseconds (15 minutes)
 */
const CACHE_LIFETIME = 15 * 60 * 1000;

/**
 * Gets pipeline log content directly, handling download and caching automatically
 * This is a streamlined alternative to the multi-step download/list/read process
 *
 * @param connection - The Azure DevOps connection
 * @param options - Options including pipeline, run, log ID, and pagination
 * @returns The log content with metadata
 */
export async function getPipelineLogContent(
  connection: WebApi,
  options: GetPipelineLogContentOptions,
): Promise<{
  logId: number;
  content: string;
  lineCount: number;
  totalLines: number;
  size: number;
  offset?: number;
  limit?: number;
  hasMore: boolean;
  cached: boolean;
  downloadPath?: string;
}> {
  const pipelinesApi = await connection.getPipelinesApi();
  const projectId = options.projectId ?? 'CCTV';

  // Create cache key
  const cacheKey = `${projectId}:${options.pipelineId}:${options.runId}`;

  // Check if we have a recent cached download
  let downloadPath: string = '';
  let cached = false;
  const cachedEntry = downloadCache.get(cacheKey);

  if (cachedEntry && Date.now() - cachedEntry.timestamp < CACHE_LIFETIME) {
    // Use cached download if it exists and is recent
    try {
      await fs.access(cachedEntry.path);
      downloadPath = cachedEntry.path;
      cached = true;
      console.log(`Using cached logs from: ${downloadPath}`);
    } catch {
      // Cached path no longer exists, remove from cache
      downloadCache.delete(cacheKey);
    }
  }

  if (!cached) {
    // Need to download the logs
    console.log(
      `Downloading logs for pipeline ${options.pipelineId}, run ${options.runId}...`,
    );

    // Create a temporary directory for this run's logs
    const tempDir = path.join(
      os.tmpdir(),
      'azure-devops-logs',
      `pipeline-${options.pipelineId}-run-${options.runId}`,
    );

    // Ensure directory exists
    await fs.mkdir(tempDir, { recursive: true });

    // Get logs list with signed URLs
    const logs = await pipelinesApi.listLogs(
      projectId,
      options.pipelineId,
      options.runId,
      PipelinesInterfaces.GetLogExpandOptions.SignedContent,
    );

    if (!logs.logs || logs.logs.length === 0) {
      throw new Error(
        `No logs found for pipeline ${options.pipelineId}, run ${options.runId}`,
      );
    }

    // Download each log
    for (const log of logs.logs) {
      if (!log.id) continue;

      const logUrl = log.signedContent?.url || log.url;
      if (!logUrl) continue;

      try {
        const response = await fetch(logUrl);
        if (response.ok) {
          const content = await response.text();
          const paddedId = log.id.toString().padStart(3, '0');
          const fileName = `log-${paddedId}.txt`;
          const filePath = path.join(tempDir, fileName);
          await fs.writeFile(filePath, content, 'utf-8');
        }
      } catch (error) {
        console.error(`Failed to download log ${log.id}:`, error);
      }
    }

    downloadPath = tempDir;

    // Cache the download path
    downloadCache.set(cacheKey, { path: downloadPath, timestamp: Date.now() });

    // Clean up old cache entries
    for (const [key, entry] of downloadCache.entries()) {
      if (Date.now() - entry.timestamp > CACHE_LIFETIME) {
        downloadCache.delete(key);
      }
    }
  }

  // Now read the specific log file
  const paddedId = options.logId.toString().padStart(3, '0');
  const fileName = `log-${paddedId}.txt`;
  const filePath = path.join(downloadPath, fileName);

  try {
    const stats = await fs.stat(filePath);
    const fullContent = await fs.readFile(filePath, 'utf-8');
    const lines = fullContent.split('\n');
    const totalLines = lines.length;

    // Apply offset and limit if specified
    let content: string;
    let lineCount: number;
    let hasMore = false;

    if (options.offset !== undefined || options.limit !== undefined) {
      const offset = options.offset || 0;
      const limit = options.limit || 1000;

      const selectedLines = lines.slice(offset, offset + limit);
      content = selectedLines.join('\n');
      lineCount = selectedLines.length;
      hasMore = offset + limit < totalLines;
    } else {
      content = fullContent;
      lineCount = totalLines;
    }

    return {
      logId: options.logId,
      content,
      lineCount,
      totalLines,
      size: stats.size,
      offset: options.offset,
      limit: options.limit,
      hasMore,
      cached,
      downloadPath: options.includeDownloadPath ? downloadPath : undefined,
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `Log ${options.logId} not found for pipeline ${options.pipelineId}, run ${options.runId}`,
      );
    }
    throw error;
  }
}
