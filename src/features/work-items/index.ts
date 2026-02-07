// Re-export schemas and types
export * from './schemas';
export * from './types';

// Re-export features
export * from './list-work-items';
export * from './get-work-item';
export * from './get-work-item-description';
export * from './create-work-item';
export * from './update-work-item';
export * from './manage-work-item-link';
export * from './execute-wiql';

// Export tool definitions
export * from './tool-definitions';

// New exports for request handling
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import {
  RequestIdentifier,
  RequestHandler,
} from '../../shared/types/request-handler';
import { defaultProject } from '../../utils/environment';
import {
  ListWorkItemsSchema,
  GetWorkItemSchema,
  GetWorkItemDescriptionSchema,
  CreateWorkItemSchema,
  UpdateWorkItemSchema,
  ManageWorkItemLinkSchema,
  ExecuteWiqlSchema,
  listWorkItems,
  getWorkItem,
  getWorkItemDescription,
  createWorkItem,
  updateWorkItem,
  manageWorkItemLink,
  executeWiql,
} from './';

// Define the response type based on observed usage
interface CallToolResponse {
  content: Array<{ type: string; text: string }>;
}

/**
 * Checks if the request is for the work items feature
 */
export const isWorkItemsRequest: RequestIdentifier = (
  request: CallToolRequest,
): boolean => {
  const toolName = request.params.name;
  return [
    'get_work_item',
    'get_workitem_description',
    'list_work_items',
    'create_work_item',
    'update_work_item',
    'manage_work_item_link',
    'execute_wiql',
  ].includes(toolName);
};

/**
 * Handles work items feature requests
 */
export const handleWorkItemsRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
): Promise<CallToolResponse> => {
  switch (request.params.name) {
    case 'get_work_item': {
      const args = GetWorkItemSchema.parse(request.params.arguments);
      const result = await getWorkItem(
        connection,
        args.workItemId,
        args.expand,
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'get_workitem_description': {
      const args = GetWorkItemDescriptionSchema.parse(request.params.arguments);
      const result = await getWorkItemDescription(connection, args.workItemId);
      return {
        content: [{ type: 'text', text: `\`\`\`html\n${result}\n\`\`\`` }],
      };
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
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
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
          additionalFields: args.additionalFields,
        },
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
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
        additionalFields: args.additionalFields,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
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
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'execute_wiql': {
      const args = ExecuteWiqlSchema.parse(request.params.arguments);
      const result = await executeWiql(connection, {
        query: args.query,
        projectId: args.projectId ?? defaultProject,
        teamId: args.teamId,
        top: args.top,
        timePrecision: args.timePrecision,
        expand: args.expand,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    default:
      throw new Error(`Unknown work items tool: ${request.params.name}`);
  }
};
