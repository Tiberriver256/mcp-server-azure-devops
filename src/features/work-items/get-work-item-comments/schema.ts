import { z } from 'zod';
import { defaultProject } from '../../../utils/environment';

/**
 * Schema for getting work item comments request
 */
export const GetWorkItemCommentsRequestSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(`The project ID or name (Default: ${defaultProject})`),
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
    .default(5242880)
    .describe('Maximum image size in bytes (default: 5MB)'),
  timeoutMs: z
    .number()
    .optional()
    .default(30000)
    .describe('Image download timeout in milliseconds'),
  separateImageContent: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Return images as separate MCP content blocks instead of embedded HTML',
    ),
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
    .default(false)
    .describe(
      'Return images as separate MCP content blocks (like copy-paste screenshots) instead of embedded HTML',
    ),
});

/**
 * Schema for work item comment user
 */
const WorkItemCommentUserSchema = z.object({
  displayName: z.string(),
  uniqueName: z.string(),
  imageUrl: z.string().optional(),
  id: z.string(),
});

/**
 * Schema for work item comment mention
 */
const WorkItemCommentMentionSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  uniqueName: z.string(),
});

/**
 * Schema for work item comment reaction
 */
const WorkItemCommentReactionSchema = z.object({
  type: z.string(),
  count: z.number(),
  users: z.array(WorkItemCommentUserSchema),
});

/**
 * Schema for enhanced work item comment
 */
const EnhancedWorkItemCommentSchema = z.object({
  id: z.number(),
  workItemId: z.number(),
  text: z.string(),
  createdBy: WorkItemCommentUserSchema,
  createdDate: z.string(),
  modifiedDate: z.string().optional(),
  url: z.string(),
  format: z.string().optional(),
  mentions: z.array(WorkItemCommentMentionSchema).optional(),
  reactions: z.array(WorkItemCommentReactionSchema).optional(),
});

/**
 * Schema for get work item comments response
 */
export const GetWorkItemCommentsResponseSchema = z.object({
  comments: z.array(EnhancedWorkItemCommentSchema),
  continuationToken: z.string().optional(),
  totalCount: z.number().optional(),
});

export type GetWorkItemCommentsRequest = z.infer<
  typeof GetWorkItemCommentsRequestSchema
>;
export type GetWorkItemCommentsResponse = z.infer<
  typeof GetWorkItemCommentsResponseSchema
>;
