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
      'Get comments from a work item. Supports pagination and sorting.',
    inputSchema: zodToJsonSchema(GetWorkItemCommentsSchema),
  },
  {
    name: 'add_work_item_comment',
    description: 'Add a comment to a work item (markdown supported)',
    inputSchema: zodToJsonSchema(AddWorkItemCommentSchema),
  },
];
