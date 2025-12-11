import { WebApi } from 'azure-devops-node-api';
import { WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { AzureDevOpsError } from '../../../shared/errors';
import { CreateWorkItemAttachmentOptions, WorkItem } from '../types';

/**
 * Create an attachment on a work item
 *
 * @param connection The Azure DevOps WebApi connection
 * @param workItemId The ID of the work item to attach the file to
 * @param options Options for creating the attachment
 * @returns The updated work item with the attachment
 */
export async function createWorkItemAttachment(
  connection: WebApi,
  workItemId: number,
  options: CreateWorkItemAttachmentOptions,
): Promise<WorkItem> {
  try {
    // Validate required parameters
    if (!options.filePath) {
      throw new Error('File path is required');
    }

    // Check if file exists
    if (!fs.existsSync(options.filePath)) {
      throw new Error(`File does not exist: ${options.filePath}`);
    }

    const witApi = await connection.getWorkItemTrackingApi();

    // Read the file content and convert to a readable stream
    const fileBuffer = fs.readFileSync(options.filePath);
    const fileStream = Readable.from(fileBuffer);

    // Determine the file name
    const fileName = options.fileName || path.basename(options.filePath);

    // Upload the attachment
    // Signature: createAttachment(customHeaders, contentStream, fileName, uploadType, project, areaPath)
    const attachmentResult = await witApi.createAttachment(
      {},
      fileStream as unknown as NodeJS.ReadableStream,
      fileName,
      undefined, // uploadType (defaults to Simple)
      undefined, // project
    );

    if (!attachmentResult || !attachmentResult.url) {
      throw new Error('Failed to upload attachment');
    }

    // Create the JSON patch document to add the attachment relation
    const document = [
      {
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'AttachedFile',
          url: attachmentResult.url,
          attributes: {
            name: fileName,
            ...(options.comment ? { comment: options.comment } : {}),
          },
        },
      },
    ];

    // Update the work item to add the attachment relation
    const updatedWorkItem = await witApi.updateWorkItem(
      {}, // customHeaders
      document,
      workItemId,
      undefined, // project
      false, // validateOnly
      false, // bypassRules
      false, // suppressNotifications
      WorkItemExpand.All, // expand
    );

    if (!updatedWorkItem) {
      throw new Error('Failed to update work item with attachment');
    }

    return updatedWorkItem;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to create attachment: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
