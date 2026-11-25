export * from './schemas';
export * from './types';
export { listWorkItems } from './list-work-items/feature';
export { getWorkItem } from './get-work-item/feature';
export { createWorkItem } from './create-work-item/feature';
export { updateWorkItem } from './update-work-item/feature';
export { manageWorkItemLink } from './manage-work-item-link/feature';
export { getWorkItemComments } from './get-work-item-comments/feature';
export { createWorkItemAttachment } from './create-work-item-attachment/feature';
export { getWorkItemAttachment } from './get-work-item-attachment/feature';
export { deleteWorkItemAttachment } from './delete-work-item-attachment/feature';

import { defineTool } from '../../shared/registry/tool-registry';
import type { FeatureModule } from '../../shared/registry/tool-registry';
import {
  CreateWorkItemAttachmentSchema,
  CreateWorkItemSchema,
  DeleteWorkItemAttachmentSchema,
  GetWorkItemAttachmentSchema,
  GetWorkItemCommentsSchema,
  GetWorkItemSchema,
  ListWorkItemsSchema,
  ManageWorkItemLinkSchema,
  UpdateWorkItemSchema,
} from './schemas';
import { listWorkItems } from './list-work-items/feature';
import { getWorkItem } from './get-work-item/feature';
import { createWorkItem } from './create-work-item/feature';
import { updateWorkItem } from './update-work-item/feature';
import { manageWorkItemLink } from './manage-work-item-link/feature';
import { getWorkItemComments } from './get-work-item-comments/feature';
import { createWorkItemAttachment } from './create-work-item-attachment/feature';
import { getWorkItemAttachment } from './get-work-item-attachment/feature';
import { deleteWorkItemAttachment } from './delete-work-item-attachment/feature';

export const workItemsFeature: FeatureModule = {
  toolset: 'work-items',
  tools: [
    defineTool({
      name: 'list_work_items',
      description: 'List work items in a project',
      schema: ListWorkItemsSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        return await listWorkItems(connection, {
          projectId: ctx.resolveProjectId(args.projectId),
          teamId: args.teamId,
          queryId: args.queryId,
          wiql: args.wiql,
          top: args.top,
          skip: args.skip,
          fields: args.fields,
        });
      },
    }),
    defineTool({
      name: 'get_work_item',
      description: 'Get details of a specific work item',
      schema: GetWorkItemSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi();
        return await getWorkItem(connection, args.workItemId, args.expand);
      },
    }),
    defineTool({
      name: 'create_work_item',
      description: 'Create a new work item',
      schema: CreateWorkItemSchema,
      readOnly: false,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        return await createWorkItem(
          connection,
          ctx.resolveProjectId(args.projectId),
          args.workItemType,
          {
            title: args.title,
            description: args.description,
            descriptionFormat: args.descriptionFormat,
            assignedTo: args.assignedTo,
            areaPath: args.areaPath,
            iterationPath: args.iterationPath,
            priority: args.priority,
            parentId: args.parentId,
            tags: args.tags,
            additionalFields: args.additionalFields,
          },
        );
      },
    }),
    defineTool({
      name: 'update_work_item',
      description: 'Update an existing work item',
      schema: UpdateWorkItemSchema,
      readOnly: false,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi();
        return await updateWorkItem(connection, args.workItemId, {
          title: args.title,
          description: args.description,
          descriptionFormat: args.descriptionFormat,
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
      },
    }),
    defineTool({
      name: 'manage_work_item_link',
      description: 'Add or remove links between work items',
      schema: ManageWorkItemLinkSchema,
      readOnly: false,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        return await manageWorkItemLink(
          connection,
          ctx.resolveProjectId(args.projectId),
          {
            sourceWorkItemId: args.sourceWorkItemId,
            targetWorkItemId: args.targetWorkItemId,
            operation: args.operation,
            relationType: args.relationType,
            newRelationType: args.newRelationType,
            comment: args.comment,
          },
        );
      },
    }),
    defineTool({
      name: 'get_work_item_comments',
      description:
        'Get comments and discussion history for a specific work item',
      schema: GetWorkItemCommentsSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi();
        return await getWorkItemComments(connection, {
          workItemId: args.workItemId,
          projectId: ctx.resolveOptionalProjectId(args.projectId),
          top: args.top,
          continuationToken: args.continuationToken,
          includeDeleted: args.includeDeleted,
          expand: args.expand,
          order: args.order,
        });
      },
    }),
    defineTool({
      name: 'create_work_item_attachment',
      description:
        'Upload a file and attach it to a work item. The file is read from the local filesystem, uploaded to Azure DevOps, and linked to the specified work item.',
      schema: CreateWorkItemAttachmentSchema,
      readOnly: false,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi();
        return await createWorkItemAttachment(connection, args.workItemId, {
          filePath: args.filePath,
          fileName: args.fileName,
          comment: args.comment,
        });
      },
    }),
    defineTool({
      name: 'get_work_item_attachment',
      description:
        'Download an attachment from Azure DevOps and save it to the local filesystem. The attachment ID can be obtained from the work item relations.',
      schema: GetWorkItemAttachmentSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi();
        return await getWorkItemAttachment(connection, {
          attachmentId: args.attachmentId,
          outputPath: args.outputPath,
        });
      },
    }),
    defineTool({
      name: 'delete_work_item_attachment',
      description:
        'Delete an attachment from a work item. The attachment ID can be obtained from the work item relations.',
      schema: DeleteWorkItemAttachmentSchema,
      readOnly: false,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi();
        return await deleteWorkItemAttachment(connection, {
          workItemId: args.workItemId,
          attachmentId: args.attachmentId,
        });
      },
    }),
  ],
};
