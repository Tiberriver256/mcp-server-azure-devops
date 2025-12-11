import { WebApi } from 'azure-devops-node-api';
import * as fs from 'fs';
import * as path from 'path';
import { AzureDevOpsError } from '../../../shared/errors';
import {
  GetWorkItemAttachmentOptions,
  GetWorkItemAttachmentResult,
} from '../types';

/**
 * Get an attachment from a work item and save it to the local filesystem
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options for getting the attachment
 * @returns The result of the operation including file path and size
 */
export async function getWorkItemAttachment(
  connection: WebApi,
  options: GetWorkItemAttachmentOptions,
): Promise<GetWorkItemAttachmentResult> {
  try {
    // Validate required parameters
    if (!options.attachmentId) {
      throw new Error('Attachment ID is required');
    }

    if (!options.outputPath) {
      throw new Error('Output path is required');
    }

    const witApi = await connection.getWorkItemTrackingApi();

    // Download the attachment content
    const attachmentStream = await witApi.getAttachmentContent(
      options.attachmentId,
    );

    if (!attachmentStream) {
      throw new Error('Failed to download attachment: No content received');
    }

    // Ensure the output directory exists
    const outputDir = path.dirname(options.outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write the attachment to the output file
    const writeStream = fs.createWriteStream(options.outputPath);

    await new Promise<void>((resolve, reject) => {
      attachmentStream.pipe(writeStream);
      attachmentStream.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);
    });

    // Get the file size
    const stats = fs.statSync(options.outputPath);

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
