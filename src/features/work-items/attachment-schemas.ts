import { z } from 'zod';

/**
 * Schema for creating an attachment on a work item
 */
export const CreateWorkItemAttachmentSchema = z.object({
  workItemId: z
    .number()
    .describe('The ID of the work item to attach the file to'),
  filePath: z
    .string()
    .describe('The absolute path to the file to upload as an attachment'),
  fileName: z
    .string()
    .optional()
    .describe(
      'The name to use for the attachment. If not provided, the name will be extracted from the file path.',
    ),
  comment: z
    .string()
    .optional()
    .describe('Optional comment for the attachment'),
});

/**
 * Schema for getting an attachment from a work item
 */
export const GetWorkItemAttachmentSchema = z.object({
  attachmentId: z
    .string()
    .describe(
      'The ID (GUID) of the attachment to download. Can be obtained from the work item relations.',
    ),
  outputPath: z
    .string()
    .describe('The absolute path where the attachment will be saved'),
});

/**
 * Schema for deleting an attachment from a work item
 */
export const DeleteWorkItemAttachmentSchema = z.object({
  workItemId: z
    .number()
    .describe('The ID of the work item to delete the attachment from'),
  attachmentId: z
    .string()
    .describe(
      'The ID (GUID) of the attachment to delete. Can be obtained from the work item relations.',
    ),
});
