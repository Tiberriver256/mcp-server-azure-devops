import { WebApi } from 'azure-devops-node-api';
import * as PipelinesInterfaces from 'azure-devops-node-api/interfaces/PipelinesInterfaces';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DownloadPipelineRunLogsOptions } from '../types';

/**
 * Downloads pipeline run logs to local files
 *
 * @param connection - The Azure DevOps connection
 * @param options - Download options including project, pipeline, run, and output directory
 * @returns Information about downloaded files
 */
export async function downloadPipelineRunLogs(
  connection: WebApi,
  options: DownloadPipelineRunLogsOptions,
): Promise<{
  downloadPath: string;
  files: Array<{
    logId: number;
    fileName: string;
    lineCount: number;
    size: number;
  }>;
  totalSize: number;
}> {
  const pipelinesApi = await connection.getPipelinesApi();
  const projectId = options.projectId ?? 'CCTV';

  // Default output directory to current working directory
  const outputDir = options.outputDir ?? process.cwd();

  // Create subdirectory for this run's logs
  const runDir = path.join(
    outputDir,
    `pipeline-${options.pipelineId}-run-${options.runId}-logs`,
  );

  // Ensure directory exists
  await fs.mkdir(runDir, { recursive: true });

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

  const downloadedFiles: Array<{
    logId: number;
    fileName: string;
    lineCount: number;
    size: number;
  }> = [];

  let totalSize = 0;

  // Download each log
  for (const log of logs.logs) {
    if (!log.id) continue;

    // Use signedContent.url if available, otherwise fall back to regular URL
    const logUrl = log.signedContent?.url || log.url;

    if (!logUrl) {
      console.warn(`Log ${log.id} has no URL available, skipping`);
      continue;
    }

    try {
      // Fetch log content
      const response = await fetch(logUrl);

      if (!response.ok) {
        console.error(
          `Failed to download log ${log.id}: ${response.status} ${response.statusText}`,
        );
        continue;
      }

      const content = await response.text();

      // Generate filename with zero-padded ID for proper sorting
      const paddedId = log.id.toString().padStart(3, '0');
      const fileName = `log-${paddedId}.txt`;
      const filePath = path.join(runDir, fileName);

      // Write to file
      await fs.writeFile(filePath, content, 'utf-8');

      const stats = await fs.stat(filePath);

      downloadedFiles.push({
        logId: log.id,
        fileName,
        lineCount: log.lineCount || 0,
        size: stats.size,
      });

      totalSize += stats.size;

      console.log(
        `Downloaded log ${log.id} to ${fileName} (${log.lineCount || 0} lines, ${stats.size} bytes)`,
      );
    } catch (error) {
      console.error(`Failed to download log ${log.id}:`, error);
    }
  }

  // Create a summary file
  const summaryPath = path.join(runDir, 'summary.json');
  const summary = {
    pipelineId: options.pipelineId,
    runId: options.runId,
    projectId,
    downloadedAt: new Date().toISOString(),
    logsCount: downloadedFiles.length,
    totalSize,
    files: downloadedFiles,
  };

  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

  console.log(
    `Downloaded ${downloadedFiles.length} logs to ${runDir} (total: ${totalSize} bytes)`,
  );

  return {
    downloadPath: runDir,
    files: downloadedFiles,
    totalSize,
  };
}
