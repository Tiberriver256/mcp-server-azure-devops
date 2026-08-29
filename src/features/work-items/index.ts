// Re-export schemas and types
export * from './schemas';
export * from './types';

// Re-export features
export * from './list-work-items';
export * from './get-work-item';
export * from './create-work-item';
export * from './update-work-item';
export * from './manage-work-item-link';
export * from './get-work-item-comments';

// Export tool definitions
export * from './tool-definitions';

// New exports for request handling
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import { RequestHandler } from '../../shared/types/request-handler';
import { createRequestIdentifier, jsonResponse } from '../../shared/handlers';
import { defaultProject } from '../../utils/environment';
import {
  ListWorkItemsSchema,
  GetWorkItemSchema,
  CreateWorkItemSchema,
  UpdateWorkItemSchema,
  ManageWorkItemLinkSchema,
  GetWorkItemCommentsSchema,
  listWorkItems,
  getWorkItem,
  createWorkItem,
  updateWorkItem,
  manageWorkItemLink,
  getWorkItemComments,
} from './';

/**
 * Checks if the request is for the work items feature
 */
export const isWorkItemsRequest = createRequestIdentifier([
  'get_work_item',
  'list_work_items',
  'create_work_item',
  'update_work_item',
  'manage_work_item_link',
  'get_work_item_comments',
]);

/**
 * Handles work items feature requests
 */
export const handleWorkItemsRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
): Promise<{ content: Array<{ type: string; text: string }> }> => {
  switch (request.params.name) {
    case 'get_work_item': {
      const args = GetWorkItemSchema.parse(request.params.arguments);
      const result = await getWorkItem(
        connection,
        args.workItemId,
        args.expand,
      );
      return jsonResponse(result);
    }
    case 'list_work_items': {
      const args = ListWorkItemsSchema.parse(request.params.arguments);
      const result = await listWorkItems(connection, {
        projectId: args.projectId ?? defaultProject,
        teamId: args.teamId,
        queryId: args.queryId,
        wiql: args.wiql,
        top: args.top,
        skip: args.skip,
      });
      return jsonResponse(result);
    }
    case 'create_work_item': {
      const args = CreateWorkItemSchema.parse(request.params.arguments);
      const result = await createWorkItem(
        connection,
        args.projectId ?? defaultProject,
        args.workItemType,
        {
          title: args.title,
          description: args.description,
          assignedTo: args.assignedTo,
          areaPath: args.areaPath,
          iterationPath: args.iterationPath,
          priority: args.priority,
          parentId: args.parentId,
          tags: args.tags,
          additionalFields: args.additionalFields,
        },
      );
      return jsonResponse(result);
    }
    case 'update_work_item': {
      const args = UpdateWorkItemSchema.parse(request.params.arguments);
      const result = await updateWorkItem(connection, args.workItemId, {
        title: args.title,
        description: args.description,
        assignedTo: args.assignedTo,
        areaPath: args.areaPath,
        iterationPath: args.iterationPath,
        priority: args.priority,
        state: args.state,
        tags: args.tags,
        tagsToAdd: args.tagsToAdd,
        tagsToRemove: args.tagsToRemove,
        additionalFields: args.additionalFields,
      });
      return jsonResponse(result);
    }
    case 'manage_work_item_link': {
      const args = ManageWorkItemLinkSchema.parse(request.params.arguments);
      const result = await manageWorkItemLink(
        connection,
        args.projectId ?? defaultProject,
        {
          sourceWorkItemId: args.sourceWorkItemId,
          targetWorkItemId: args.targetWorkItemId,
          operation: args.operation,
          relationType: args.relationType,
          newRelationType: args.newRelationType,
          comment: args.comment,
        },
      );
      return jsonResponse(result);
    }
    case 'get_work_item_comments': {
      const args = GetWorkItemCommentsSchema.parse(request.params.arguments);
      const result = await getWorkItemComments(connection, {
        workItemId: args.workItemId,
        projectId: args.projectId,
        top: args.top,
        continuationToken: args.continuationToken,
        includeDeleted: args.includeDeleted,
        expand: args.expand,
        order: args.order,
      });
      return jsonResponse(result);
    }
    default:
      throw new Error(`Unknown work items tool: ${request.params.name}`);
  }
};
