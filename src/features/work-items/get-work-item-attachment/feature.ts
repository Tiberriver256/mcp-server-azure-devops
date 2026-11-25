import type { WebApi } from 'azure-devops-node-api';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import type {
  GetWorkItemAttachmentOptions,
  GetWorkItemAttachmentResult,
} from '../types';

function isAzureDevOpsAttachmentErrorPayload(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return false;
  }

  // Detect structured Azure DevOps VSS JSON error envelopes (always include typeKey + message)
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed) &&
        'typeKey' in parsed &&
        typeof (parsed as { typeKey?: unknown }).typeKey === 'string' &&
        'message' in parsed &&
        typeof (parsed as { message?: unknown }).message === 'string'
      ) {
        return true;
      }
    } catch {
      // Not valid JSON; continue checking specific Azure DevOps error markers
    }
  }

  const lower = trimmed.toLowerCase();
  if (
    lower.includes('tf401232') ||
    lower.includes('vs402323') ||
    lower.includes('attachment does not exist')
  ) {
    return true;
  }

  // Detect Azure DevOps HTML sign-in / error pages without flagging legitimate HTML attachments
  if (lower.includes('<html') || lower.includes('<!doctype')) {
    return (
      lower.includes('azure devops services | sign in') ||
      lower.includes('azure devops server | sign in') ||
      lower.includes('vss.webplatform') ||
      lower.includes('vss-web-page-data') ||
      lower.includes('tfs-sign-in') ||
      lower.includes('microsoft.teamfoundation.')
    );
  }

  return false;
}

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

    // Azure DevOps may return a JSON/HTML error envelope for invalid attachment
    // IDs instead of throwing; detect genuine ADO error payloads only so valid
    // small HTML or stack-trace attachments are never discarded.
    const stats = await fsp.stat(options.outputPath);
    if (stats.size > 0 && stats.size < 4096) {
      const preview = await fsp.readFile(options.outputPath, 'utf8');
      if (isAzureDevOpsAttachmentErrorPayload(preview)) {
        await fsp.unlink(options.outputPath).catch(() => undefined);
        throw new AzureDevOpsResourceNotFoundError(
          `Attachment not found (${options.attachmentId})`,
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
