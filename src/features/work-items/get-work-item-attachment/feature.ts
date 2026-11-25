import type { WebApi } from 'azure-devops-node-api';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { AzureDevOpsError } from '../../../shared/errors';
import type {
  GetWorkItemAttachmentOptions,
  GetWorkItemAttachmentResult,
} from '../types';

/**
 * Download an attachment from a work item and save it to disk using
 * backpressure-aware stream pipelining with automatic partial-file cleanup.
 */
export async function getWorkItemAttachment(
  connection: WebApi,
  options: GetWorkItemAttachmentOptions,
): Promise<GetWorkItemAttachmentResult> {
  try {
    if (!options.attachmentId) {
      throw new Error('Attachment ID is required');
    }

    if (!options.outputPath) {
      throw new Error('Output path is required');
    }

    const witApi = await connection.getWorkItemTrackingApi();
    const attachmentStream = await witApi.getAttachmentContent(
      options.attachmentId,
    );

    if (!attachmentStream) {
      throw new Error('Failed to download attachment: No content received');
    }

    const outputDir = path.dirname(options.outputPath);
    await fsp.mkdir(outputDir, { recursive: true });

    const writeStream = fs.createWriteStream(options.outputPath);
    try {
      await pipeline(attachmentStream, writeStream);
    } catch (streamError) {
      await fsp.unlink(options.outputPath).catch(() => undefined);
      throw streamError;
    }

    // Azure DevOps may return an HTML/JSON error body for invalid attachment
    // IDs instead of throwing; detect that and surface a not-found error.
    const stats = await fsp.stat(options.outputPath);
    if (stats.size > 0 && stats.size < 4096) {
      const preview = (
        await fsp.readFile(options.outputPath, 'utf8')
      ).toLowerCase();
      if (
        preview.includes('<!doctype') ||
        preview.includes('<html') ||
        preview.includes('tf401232') ||
        preview.includes('attachment does not exist') ||
        preview.includes('"typekey"') ||
        preview.includes('exception')
      ) {
        await fsp.unlink(options.outputPath).catch(() => undefined);
        throw new Error(
          `Failed to get attachment: Attachment not found (${options.attachmentId})`,
        );
      }
    }

    return {
      filePath: options.outputPath,
      fileName: path.basename(options.outputPath),
      size: stats.size,
    };
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to get attachment: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
