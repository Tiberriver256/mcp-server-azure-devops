import { WebApi } from 'azure-devops-node-api';
import * as PipelinesInterfaces from 'azure-devops-node-api/interfaces/PipelinesInterfaces';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SearchPipelineLogsOptions } from '../types';

/**
 * Cache to store downloaded log paths for reuse (shared with get-pipeline-log-content)
 * Key format: "projectId:pipelineId:runId"
 */
const downloadCache = new Map<string, { path: string; timestamp: number }>();

/**
 * Cache lifetime in milliseconds (15 minutes)
 */
const CACHE_LIFETIME = 15 * 60 * 1000;

/**
 * Search for text across pipeline logs with grep-like functionality
 * Automatically downloads logs if not cached
 *
 * @param connection - The Azure DevOps connection
 * @param options - Search options including pattern, case sensitivity, context
 * @returns Search results with matching lines and context
 */
export async function searchPipelineLogs(
  connection: WebApi,
  options: SearchPipelineLogsOptions,
): Promise<{
  matches: Array<{
    logId: number;
    fileName: string;
    matches: Array<{
      lineNumber: number;
      line: string;
      beforeContext?: string[];
      afterContext?: string[];
    }>;
    totalMatches: number;
  }>;
  pattern: string;
  totalMatches: number;
  cached: boolean;
}> {
  const pipelinesApi = await connection.getPipelinesApi();
  const projectId = options.projectId ?? 'CCTV';

  // Create cache key
  const cacheKey = `${projectId}:${options.pipelineId}:${options.runId}`;

  // Check if we have a recent cached download
  let downloadPath: string;
  let cached = false;
  const cachedEntry = downloadCache.get(cacheKey);

  if (cachedEntry && Date.now() - cachedEntry.timestamp < CACHE_LIFETIME) {
    try {
      await fs.access(cachedEntry.path);
      downloadPath = cachedEntry.path;
      cached = true;
      console.log(`Using cached logs from: ${downloadPath}`);
    } catch {
      downloadCache.delete(cacheKey);
    }
  }

  if (!cached) {
    // Download logs if not cached
    console.log(
      `Downloading logs for search in pipeline ${options.pipelineId}, run ${options.runId}...`,
    );

    const tempDir = path.join(
      os.tmpdir(),
      'azure-devops-logs',
      `pipeline-${options.pipelineId}-run-${options.runId}`,
    );

    await fs.mkdir(tempDir, { recursive: true });

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
    downloadCache.set(cacheKey, { path: downloadPath, timestamp: Date.now() });
  }

  // Now search the logs
  const searchPattern = options.ignoreCase
    ? new RegExp(options.pattern, 'gi')
    : new RegExp(options.pattern, 'g');

  const results: Array<{
    logId: number;
    fileName: string;
    matches: Array<{
      lineNumber: number;
      line: string;
      beforeContext?: string[];
      afterContext?: string[];
    }>;
    totalMatches: number;
  }> = [];

  let totalMatches = 0;

  // Determine which logs to search
  const logsToSearch = options.logIds || [];

  if (logsToSearch.length === 0) {
    // Search all logs
    const files = await fs.readdir(downloadPath);
    for (const file of files) {
      if (file.startsWith('log-') && file.endsWith('.txt')) {
        const logId = parseInt(file.substring(4, 7), 10);
        logsToSearch.push(logId);
      }
    }
  }

  // Search each log
  for (const logId of logsToSearch) {
    const paddedId = logId.toString().padStart(3, '0');
    const fileName = `log-${paddedId}.txt`;
    const filePath = path.join(downloadPath, fileName);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      const logMatches: Array<{
        lineNumber: number;
        line: string;
        beforeContext?: string[];
        afterContext?: string[];
      }> = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (options.invertMatch) {
          // Show lines that don't match
          if (!searchPattern.test(line)) {
            // Check if we've hit the max matches
            if (options.maxMatches && totalMatches >= options.maxMatches) {
              break;
            }

            const match: any = {
              lineNumber: i + 1,
              line,
            };

            // Add context if requested
            if (options.beforeContext && options.beforeContext > 0) {
              const start = Math.max(0, i - options.beforeContext);
              match.beforeContext = lines.slice(start, i);
            }

            if (options.afterContext && options.afterContext > 0) {
              const end = Math.min(lines.length, i + 1 + options.afterContext);
              match.afterContext = lines.slice(i + 1, end);
            }

            logMatches.push(match);
            totalMatches++;
          }
        } else {
          // Show lines that match
          if (searchPattern.test(line)) {
            // Check if we've hit the max matches
            if (options.maxMatches && totalMatches >= options.maxMatches) {
              break;
            }

            const match: any = {
              lineNumber: i + 1,
              line,
            };

            // Add context if requested
            if (options.beforeContext && options.beforeContext > 0) {
              const start = Math.max(0, i - options.beforeContext);
              match.beforeContext = lines.slice(start, i);
            }

            if (options.afterContext && options.afterContext > 0) {
              const end = Math.min(lines.length, i + 1 + options.afterContext);
              match.afterContext = lines.slice(i + 1, end);
            }

            logMatches.push(match);
            totalMatches++;
          }
        }

        // Reset the regex for next line (important for global flag)
        searchPattern.lastIndex = 0;
      }

      if (logMatches.length > 0) {
        results.push({
          logId,
          fileName,
          matches: logMatches,
          totalMatches: logMatches.length,
        });
      }

      // Break if we've hit max matches
      if (options.maxMatches && totalMatches >= options.maxMatches) {
        break;
      }
    } catch (error) {
      console.error(`Failed to search log ${logId}:`, error);
    }
  }

  return {
    matches: results,
    pattern: options.pattern,
    totalMatches,
    cached,
  };
}
