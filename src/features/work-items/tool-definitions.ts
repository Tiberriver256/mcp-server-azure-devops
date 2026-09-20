import { toJsonSchema } from '../../shared/utils/to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import {
  ListWorkItemsSchema,
  CreateWorkItemSchema,
  UpdateWorkItemSchema,
  ManageWorkItemLinkSchema,
  GetWorkItemSchema,
  GetWorkItemCommentsSchema,
  CreateWorkItemAttachmentSchema,
  GetWorkItemAttachmentSchema,
  DeleteWorkItemAttachmentSchema,
} from './schemas';

/**
 * List of work items tools
 */
export const workItemsTools: ToolDefinition[] = [
  {
    name: 'list_work_items',
    description: 'List work items in a project',
    inputSchema: toJsonSchema(ListWorkItemsSchema),
  },
  {
    name: 'get_work_item',
    description: 'Get details of a specific work item',
    inputSchema: toJsonSchema(GetWorkItemSchema),
  },
  {
    name: 'create_work_item',
    description: 'Create a new work item',
    inputSchema: toJsonSchema(CreateWorkItemSchema),
  },
  {
    name: 'update_work_item',
    description: 'Update an existing work item',
    inputSchema: toJsonSchema(UpdateWorkItemSchema),
  },
  {
    name: 'manage_work_item_link',
    description: 'Add or remove links between work items',
    inputSchema: toJsonSchema(ManageWorkItemLinkSchema),
  },
  {
    name: 'get_work_item_comments',
    description: 'Get comments and discussion history for a specific work item',
    inputSchema: toJsonSchema(GetWorkItemCommentsSchema),
  },
  {
    name: 'create_work_item_attachment',
    description:
      'Upload a file and attach it to a work item. The file is read from the local filesystem, uploaded to Azure DevOps, and linked to the specified work item.',
    inputSchema: toJsonSchema(CreateWorkItemAttachmentSchema),
  },
  {
    name: 'get_work_item_attachment',
    description:
      'Download an attachment from Azure DevOps and save it to the local filesystem. The attachment ID can be obtained from the work item relations.',
    inputSchema: toJsonSchema(GetWorkItemAttachmentSchema),
  },
  {
    name: 'delete_work_item_attachment',
    description:
      'Delete an attachment from a work item. The attachment ID can be obtained from the work item relations.',
    inputSchema: toJsonSchema(DeleteWorkItemAttachmentSchema),
  },
];
