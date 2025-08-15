import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import {
  ListWorkItemsSchema,
  CreateWorkItemSchema,
  UpdateWorkItemSchema,
  ManageWorkItemLinkSchema,
  GetWorkItemSchema,
  GetWorkItemCommentsSchema,
  GetWorkItemAttachmentsSchema,
  GetWorkItemAttachmentSummarySchema,
  GetWorkItemAttachmentByIdSchema,
} from './schemas';

/**
 * List of work items tools
 */
export const workItemsTools: ToolDefinition[] = [
  {
    name: 'list_work_items',
    description: 'List work items in a project',
    inputSchema: zodToJsonSchema(ListWorkItemsSchema),
  },
  {
    name: 'get_work_item',
    description:
      'Get details of a specific work item by ID. Use this when user asks for details about a specific work item number (e.g., "Bug 2055788", "work item 12345", "details for item 9999")',
    inputSchema: zodToJsonSchema(GetWorkItemSchema),
  },
  {
    name: 'create_work_item',
    description: 'Create a new work item',
    inputSchema: zodToJsonSchema(CreateWorkItemSchema),
  },
  {
    name: 'update_work_item',
    description: 'Update an existing work item',
    inputSchema: zodToJsonSchema(UpdateWorkItemSchema),
  },
  {
    name: 'manage_work_item_link',
    description: 'Add or remove links between work items',
    inputSchema: zodToJsonSchema(ManageWorkItemLinkSchema),
  },
  {
    name: 'get_work_item_comments',
    description:
      'Get all comments for a specific work item with user info, mentions, and reactions. Use this when user asks about comments, discussions, conversation history, or images in work item comments. Supports image extraction.',
    inputSchema: zodToJsonSchema(GetWorkItemCommentsSchema),
  },
  {
    name: 'get_work_item_attachments',
    description:
      'Get all attachments for a specific work item with optional content download and image processing',
    inputSchema: zodToJsonSchema(GetWorkItemAttachmentsSchema),
  },
  {
    name: 'get_work_item_attachment_summary',
    description:
      'Get attachment summary for a work item without downloading content',
    inputSchema: zodToJsonSchema(GetWorkItemAttachmentSummarySchema),
  },
  {
    name: 'get_work_item_attachment_by_id',
    description: 'Get a specific attachment by ID from a work item',
    inputSchema: zodToJsonSchema(GetWorkItemAttachmentByIdSchema),
  },
];
