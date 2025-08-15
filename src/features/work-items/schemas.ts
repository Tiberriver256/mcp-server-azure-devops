import { z } from 'zod';
import { defaultProject, defaultOrg } from '../../utils/environment';

/**
 * Schema for getting a work item
 */
export const GetWorkItemSchema = z.object({
  workItemId: z.number().describe('The ID of the work item'),
  expand: z
    .enum(['none', 'relations', 'fields', 'links', 'all'])
    .optional()
    .describe(
      'The level of detail to include in the response. Defaults to "all" if not specified.',
    ),
});

/**
 * Schema for listing work items
 */
export const ListWorkItemsSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  organizationId: z
    .string()
    .optional()
    .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
  teamId: z.string().optional().describe('The ID of the team'),
  queryId: z.string().optional().describe('ID of a saved work item query'),
  wiql: z.string().optional().describe('Work Item Query Language (WIQL) query'),
  top: z.number().optional().describe('Maximum number of work items to return'),
  skip: z.number().optional().describe('Number of work items to skip'),
});

/**
 * Schema for creating a work item
 */
export const CreateWorkItemSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  organizationId: z
    .string()
    .optional()
    .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
  workItemType: z
    .string()
    .describe(
      'The type of work item to create (e.g., "Task", "Bug", "User Story")',
    ),
  title: z.string().describe('The title of the work item'),
  description: z
    .string()
    .optional()
    .describe(
      'Work item description in HTML format. Multi-line text fields (i.e., System.History, AcceptanceCriteria, etc.) must use HTML format. Do not use CDATA tags.',
    ),
  assignedTo: z
    .string()
    .optional()
    .describe('The email or name of the user to assign the work item to'),
  areaPath: z.string().optional().describe('The area path for the work item'),
  iterationPath: z
    .string()
    .optional()
    .describe('The iteration path for the work item'),
  priority: z.number().optional().describe('The priority of the work item'),
  parentId: z
    .number()
    .optional()
    .describe('The ID of the parent work item to create a relationship with'),
  additionalFields: z
    .record(z.string(), z.any())
    .optional()
    .describe(
      'Additional fields to set on the work item. Multi-line text fields (i.e., System.History, AcceptanceCriteria, etc.) must use HTML format. Do not use CDATA tags.',
    ),
});

/**
 * Schema for updating a work item
 */
export const UpdateWorkItemSchema = z.object({
  workItemId: z.number().describe('The ID of the work item to update'),
  title: z.string().optional().describe('The updated title of the work item'),
  description: z
    .string()
    .optional()
    .describe(
      'Work item description in HTML format. Multi-line text fields (i.e., System.History, AcceptanceCriteria, etc.) must use HTML format. Do not use CDATA tags.',
    ),
  assignedTo: z
    .string()
    .optional()
    .describe('The email or name of the user to assign the work item to'),
  areaPath: z
    .string()
    .optional()
    .describe('The updated area path for the work item'),
  iterationPath: z
    .string()
    .optional()
    .describe('The updated iteration path for the work item'),
  priority: z
    .number()
    .optional()
    .describe('The updated priority of the work item'),
  state: z.string().optional().describe('The updated state of the work item'),
  additionalFields: z
    .record(z.string(), z.any())
    .optional()
    .describe(
      'Additional fields to update on the work item. Multi-line text fields (i.e., System.History, AcceptanceCriteria, etc.) must use HTML format. Do not use CDATA tags.',
    ),
});

/**
 * Schema for managing work item links
 */
export const ManageWorkItemLinkSchema = z.object({
  sourceWorkItemId: z.number().describe('The ID of the source work item'),
  targetWorkItemId: z.number().describe('The ID of the target work item'),
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  organizationId: z
    .string()
    .optional()
    .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
  operation: z
    .enum(['add', 'remove', 'update'])
    .describe('The operation to perform on the link'),
  relationType: z
    .string()
    .describe(
      'The reference name of the relation type (e.g., "System.LinkTypes.Hierarchy-Forward")',
    ),
  newRelationType: z
    .string()
    .optional()
    .describe('The new relation type to use when updating a link'),
  comment: z
    .string()
    .optional()
    .describe('Optional comment explaining the link'),
});

/**
 * Schema for getting work item comments
 */
export const GetWorkItemCommentsSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  workItemId: z.number().describe('The work item ID'),
  top: z
    .number()
    .optional()
    .default(100)
    .describe('Maximum number of comments to return'),
  continuationToken: z
    .string()
    .optional()
    .describe('Continuation token for pagination'),
  includeDeleted: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include deleted comments'),
  order: z
    .enum(['asc', 'desc'])
    .optional()
    .default('asc')
    .describe('Sort order for comments'),
  expand: z
    .enum(['none', 'reactions'])
    .optional()
    .default('none')
    .describe('Additional data to include'),
  processImages: z
    .boolean()
    .optional()
    .default(true)
    .describe('Process images in comments and convert to base64 data URLs'),
  maxImageSize: z
    .number()
    .optional()
    .default(2097152)
    .describe('Maximum image size in bytes (default: 2MB)'),
  timeoutMs: z
    .number()
    .optional()
    .default(30000)
    .describe('Image download timeout in milliseconds'),
  imagePreviewMode: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Replace images with descriptive previews instead of full base64 to reduce token usage',
    ),
  separateImages: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'Return images as separate MCP content blocks (like copy-paste screenshots) instead of embedded HTML',
    ),
});

/**
 * Schema for getting work item attachments
 */
export const GetWorkItemAttachmentsSchema = z.object({
  workItemId: z.number().describe('The work item ID'),
  projectId: z.string().optional().describe('The project ID or name'),
  includeContent: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to download attachment content'),
  maxAttachmentSize: z
    .number()
    .optional()
    .default(10 * 1024 * 1024)
    .describe('Maximum attachment size in bytes (default 10MB)'),
  imageFormats: z
    .array(z.string())
    .optional()
    .default([
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/bmp',
      'image/webp',
    ])
    .describe('Supported image MIME types'),
  convertImagesToBase64: z
    .boolean()
    .optional()
    .default(true)
    .describe('Convert images to base64 data URLs'),
  includeImageMetadata: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include image metadata in response'),
  filterByType: z
    .enum(['images', 'documents', 'all'])
    .optional()
    .default('all')
    .describe('Filter attachments by type'),
  concurrentDownloads: z
    .number()
    .optional()
    .default(3)
    .describe('Maximum concurrent downloads'),
  timeoutMs: z
    .number()
    .optional()
    .default(30000)
    .describe('Request timeout in milliseconds'),
});

/**
 * Schema for getting work item attachment summary
 */
export const GetWorkItemAttachmentSummarySchema = z.object({
  workItemId: z.number().describe('The work item ID'),
});

/**
 * Schema for getting work item attachment by ID
 */
export const GetWorkItemAttachmentByIdSchema = z.object({
  workItemId: z.number().describe('The work item ID'),
  attachmentId: z.string().describe('The attachment ID'),
  includeContent: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to download attachment content'),
});
