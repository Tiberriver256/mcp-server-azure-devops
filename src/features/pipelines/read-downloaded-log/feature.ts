import * as fs from 'fs/promises';
import * as path from 'path';
import { ReadDownloadedLogOptions } from '../types';

/**
 * Reads a previously downloaded log file from the MCP server's filesystem
 * For large files, use offset and limit to read in chunks
 *
 * @param options - Options including the download path, file name, and optional offset/limit
 * @returns The content of the requested file (or portion thereof)
 */
export async function readDownloadedLog(
  options: ReadDownloadedLogOptions,
): Promise<{
  fileName: string;
  content: string;
  size: number;
  lineCount: number;
  offset?: number;
  limit?: number;
  totalLines: number;
  hasMore: boolean;
}> {
  // Construct the full file path
  const filePath = path.join(options.downloadPath, options.fileName);

  try {
    // Check if file exists
    const stats = await fs.stat(filePath);

    if (!stats.isFile()) {
      throw new Error(`Path exists but is not a file: ${filePath}`);
    }

    // Read the file content
    const fullContent = await fs.readFile(filePath, 'utf-8');
    const lines = fullContent.split('\n');
    const totalLines = lines.length;

    // Apply offset and limit if specified
    let content: string;
    let lineCount: number;
    let hasMore = false;

    if (options.offset !== undefined || options.limit !== undefined) {
      const offset = options.offset || 0;
      const limit = options.limit || 1000; // Default to 1000 lines

      const selectedLines = lines.slice(offset, offset + limit);
      content = selectedLines.join('\n');
      lineCount = selectedLines.length;
      hasMore = offset + limit < totalLines;
    } else {
      // Return full content if no pagination specified
      content = fullContent;
      lineCount = totalLines;
    }

    return {
      fileName: options.fileName,
      content,
      size: stats.size,
      lineCount,
      offset: options.offset,
      limit: options.limit,
      totalLines,
      hasMore,
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    }
    throw error;
  }
}

/**
 * Lists available files in a download directory
 *
 * @param options - Options including the download path
 * @returns List of available files with metadata
 */
export async function listDownloadedLogs(options: {
  downloadPath: string;
}): Promise<{
  downloadPath: string;
  files: Array<{
    fileName: string;
    size: number;
    modifiedTime: string;
  }>;
  summary?: {
    pipelineId: number;
    runId: number;
    projectId: string;
    downloadedAt: string;
    logsCount: number;
    totalSize: number;
  };
}> {
  try {
    // Check if directory exists
    const dirStats = await fs.stat(options.downloadPath);

    if (!dirStats.isDirectory()) {
      throw new Error(
        `Path exists but is not a directory: ${options.downloadPath}`,
      );
    }

    // Read directory contents
    const entries = await fs.readdir(options.downloadPath);

    // Get file stats for each entry
    const files: Array<{
      fileName: string;
      size: number;
      modifiedTime: string;
    }> = [];

    for (const entry of entries) {
      const entryPath = path.join(options.downloadPath, entry);
      const stats = await fs.stat(entryPath);

      if (stats.isFile() && entry !== 'summary.json') {
        files.push({
          fileName: entry,
          size: stats.size,
          modifiedTime: stats.mtime.toISOString(),
        });
      }
    }

    // Sort files by name (which will sort log-001.txt, log-002.txt correctly)
    files.sort((a, b) => a.fileName.localeCompare(b.fileName));

    // Try to read summary if it exists
    let summary;
    const summaryPath = path.join(options.downloadPath, 'summary.json');
    try {
      const summaryContent = await fs.readFile(summaryPath, 'utf-8');
      summary = JSON.parse(summaryContent);
    } catch {
      // Summary file doesn't exist or can't be parsed, that's okay
    }

    return {
      downloadPath: options.downloadPath,
      files,
      summary,
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`Directory not found: ${options.downloadPath}`);
    }
    throw error;
  }
}
