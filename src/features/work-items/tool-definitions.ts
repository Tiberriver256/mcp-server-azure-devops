import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import {
  ListWorkItemsSchema,
  CreateWorkItemSchema,
  UpdateWorkItemSchema,
  ManageWorkItemLinkSchema,
  GetWorkItemSchema,
  GetWorkItemCommentsSchema,
  AddWorkItemCommentSchema,
  UpdateWorkItemCommentSchema,
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
    description: 'Get details of a specific work item',
    inputSchema: zodToJsonSchema(GetWorkItemSchema),
  },
  {
    name: 'get_work_item_comments',
    description:
      'Get comments (discussion) on a specific work item. Returns the comment text, author, and timestamps. Use this when the work item has a CommentCount > 0 and you need to read the discussion.',
    inputSchema: zodToJsonSchema(GetWorkItemCommentsSchema),
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
    name: 'add_work_item_comment',
    description:
      'Add a comment to a work item discussion. The text supports HTML formatting.',
    inputSchema: zodToJsonSchema(AddWorkItemCommentSchema),
  },
  {
    name: 'update_work_item_comment',
    description: 'Update an existing comment on a work item.',
    inputSchema: zodToJsonSchema(UpdateWorkItemCommentSchema),
  },
];
