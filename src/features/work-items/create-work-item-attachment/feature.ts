import type { WebApi } from 'azure-devops-node-api';
import { WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { AzureDevOpsError } from '../../../shared/errors/index.ts';
import type { CreateWorkItemAttachmentOptions, WorkItem } from '../types.ts';

/**
 * Create an attachment on a work item by streaming directly from disk
 * (avoids buffering entire attachment files in RAM).
 */
export async function createWorkItemAttachment(
  connection: WebApi,
  workItemId: number,
  options: CreateWorkItemAttachmentOptions,
): Promise<WorkItem> {
  try {
    if (!options.filePath) {
      throw new Error('File path is required');
    }

    try {
      await fsp.access(options.filePath, fs.constants.R_OK);
    } catch {
      throw new Error(`File does not exist: ${options.filePath}`);
    }

    const witApi = await connection.getWorkItemTrackingApi();
    const fileName = options.fileName || path.basename(options.filePath);
    const fileStream = fs.createReadStream(options.filePath);

    let attachmentResult;
    try {
      attachmentResult = await witApi.createAttachment(
        {},
        fileStream,
        fileName,
        undefined,
        undefined,
      );
    } finally {
      if (!fileStream.destroyed) {
        fileStream.destroy();
      }
    }

    if (!attachmentResult || !attachmentResult.url) {
      throw new Error('Failed to upload attachment');
    }

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

    const updatedWorkItem = await witApi.updateWorkItem(
      {},
      document,
      workItemId,
      undefined,
      false,
      false,
      false,
      WorkItemExpand.All,
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
