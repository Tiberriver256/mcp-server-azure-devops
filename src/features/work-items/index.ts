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
export * from './get-work-item-attachments';

// Export tool definitions
export * from './tool-definitions';

// New exports for request handling
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import {
  CommentSortOrder,
  CommentExpandOptions,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {
  RequestIdentifier,
  RequestHandler,
} from '../../shared/types/request-handler';
import { defaultProject } from '../../utils/environment';
import {
  ListWorkItemsSchema,
  GetWorkItemSchema,
  CreateWorkItemSchema,
  UpdateWorkItemSchema,
  ManageWorkItemLinkSchema,
  GetWorkItemCommentsSchema,
  GetWorkItemAttachmentsSchema,
  GetWorkItemAttachmentSummarySchema,
  GetWorkItemAttachmentByIdSchema,
  listWorkItems,
  getWorkItem,
  createWorkItem,
  updateWorkItem,
  manageWorkItemLink,
  getWorkItemComments,
} from './';
import {
  getWorkItemAttachments,
  getWorkItemAttachmentSummary,
  getWorkItemAttachmentById,
} from './get-work-item-attachments/feature';
// Import MCP types
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Convert string order to CommentSortOrder enum
 */
function mapOrderToEnum(order?: string): CommentSortOrder | undefined {
  if (!order) return undefined;
  switch (order.toLowerCase()) {
    case 'asc':
      return CommentSortOrder.Asc;
    case 'desc':
      return CommentSortOrder.Desc;
    default:
      return CommentSortOrder.Asc;
  }
}

/**
 * Convert string expand to CommentExpandOptions enum
 */
function mapExpandToEnum(expand?: string): CommentExpandOptions | undefined {
  if (!expand) return undefined;
  switch (expand.toLowerCase()) {
    case 'none':
      return CommentExpandOptions.None;
    case 'reactions':
      return CommentExpandOptions.Reactions;
    default:
      return CommentExpandOptions.None;
  }
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
    'list_work_items',
    'create_work_item',
    'update_work_item',
    'manage_work_item_link',
    'get_work_item_comments',
    'get_work_item_attachments',
    'get_work_item_attachment_summary',
    'get_work_item_attachment_by_id',
  ].includes(toolName);
};

/**
 * Handles work items feature requests
 */
export const handleWorkItemsRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
): Promise<CallToolResult> => {
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
    case 'get_work_item_comments': {
      const args = GetWorkItemCommentsSchema.parse(request.params.arguments);

      // Auto-adjust parameters to avoid token limits
      const adjustedArgs = {
        projectId: args.projectId ?? defaultProject,
        workItemId: args.workItemId,
        top: args.top || 100, // Allow more comments by default
        continuationToken: args.continuationToken,
        includeDeleted: args.includeDeleted,
        order: mapOrderToEnum(args.order),
        expand: mapExpandToEnum(args.expand),
        processImages: args.processImages ?? true, // Default to true
        maxImageSize: args.maxImageSize || 1048576, // 1MB max per image
        timeoutMs: args.timeoutMs,
        imagePreviewMode: args.imagePreviewMode ?? false,
        separateImages: args.separateImages ?? true, // Default to separate images
      };

      const result = await getWorkItemComments(connection, adjustedArgs);

      // Use native MCP content blocks - much more efficient for Claude Code's multimodal handling
      const contentBlocks = [];

      // Always include comments first (prioritize text content)
      const commentsJson = JSON.stringify(result.comments, null, 2);
      contentBlocks.push({
        type: 'text' as const,
        text: commentsJson,
      });

      console.log(`💾 Comments: ${commentsJson.length} chars`);

      // Add images as native MCP ImageContent blocks (not base64 text!)
      // This is handled efficiently by Claude Code's multimodal pipeline
      let includedImages = 0;
      const maxImages = 2; // Conservative limit for testing

      for (
        let i = 0;
        i < result.images.length && includedImages < maxImages;
        i++
      ) {
        const image = result.images[i];

        console.log(
          `🖼️ Adding native ImageContent block ${i + 1}: ${image.fileName}`,
        );

        // Return image URL so Claude can fetch and analyze it
        contentBlocks.push({
          type: 'text',
          text: `🖼️ **${image.fileName || 'Image'}** from comment ${image.fromCommentId}\n📎 ${image.originalUrl}`,
        });

        includedImages++;
        console.log(`✅ Native image ${i + 1} added: ${image.fileName}`);
      }

      // Add summary
      const summaryText =
        result.images.length > 0
          ? `\n📊 Summary: Showing all ${result.comments.length} comments and first ${includedImages} of ${result.images.length} images as native MCP content blocks.`
          : `\n📊 Summary: Showing all ${result.comments.length} comments (no images found).`;

      contentBlocks.push({
        type: 'text' as const,
        text: summaryText,
      });

      return { content: contentBlocks as any };
    }
    case 'get_work_item_attachments': {
      const args = GetWorkItemAttachmentsSchema.parse(request.params.arguments);
      const result = await getWorkItemAttachments(connection, args);

      // Use native MCP content blocks for attachments too
      const contentBlocks = [];

      // Add main result as text (excluding base64Content to avoid token issues)
      const resultForText = {
        ...result,
        attachments: result.attachments.map((att) => ({
          ...att,
          base64Content: att.base64Content
            ? `[Base64 data: ${att.base64Content.length} chars]`
            : undefined,
        })),
      };

      contentBlocks.push({
        type: 'text' as const,
        text: JSON.stringify(resultForText, null, 2),
      });

      // Add ALL attachments with URLs for Claude to fetch
      let includedAttachments = 0;
      const maxAttachments = 20; // Allow more attachments

      for (const attachment of result.attachments) {
        if (attachment.id && includedAttachments < maxAttachments) {
          // Return attachment URL so Claude can fetch and analyze it
          const attachmentUrl = `${connection.serverUrl}/_apis/wit/attachments/${attachment.id}?$format=octetstream`;
          const isImageFile =
            attachment.contentType &&
            attachment.contentType.toLowerCase().startsWith('image/');
          const emoji = isImageFile ? '🖼️' : '📄';

          contentBlocks.push({
            type: 'text',
            text: `${emoji} **${attachment.fileName}** (${attachment.contentType || 'unknown'})\n📎 Download URL: ${attachmentUrl}`,
          });

          includedAttachments++;
          console.log(`✅ Attachment URL added: ${attachment.fileName}`);
        }
      }

      // Add summary for all attachments
      if (includedAttachments > 0) {
        contentBlocks.push({
          type: 'text' as const,
          text: `\n📊 Summary: Showing ${includedAttachments} attachments with download URLs.`,
        });
      }

      return { content: contentBlocks as any };
    }
    case 'get_work_item_attachment_summary': {
      const args = GetWorkItemAttachmentSummarySchema.parse(
        request.params.arguments,
      );
      const result = await getWorkItemAttachmentSummary(
        connection,
        args.workItemId,
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'get_work_item_attachment_by_id': {
      const args = GetWorkItemAttachmentByIdSchema.parse(
        request.params.arguments,
      );
      const result = await getWorkItemAttachmentById(
        connection,
        args.workItemId,
        args.attachmentId,
        false, // Force to false to avoid token limits
      );

      if (!result) {
        return {
          content: [{ type: 'text', text: 'Attachment not found' }],
        };
      }

      // Return attachment info with URL for Claude to fetch
      const attachmentInfo = {
        ...result,
        // Remove base64Content to avoid token issues
        base64Content: result.base64Content
          ? '[Content available via URL below]'
          : undefined,
      };

      const contentBlocks = [];

      // Add attachment metadata
      contentBlocks.push({
        type: 'text' as const,
        text: JSON.stringify(attachmentInfo, null, 2),
      });

      // Add URL for Claude to fetch the attachment content
      if (result.url) {
        const attachmentUrl = `${connection.serverUrl}/_apis/wit/attachments/${result.id}?$format=octetstream`;
        const emoji = result.isImage ? '🖼️' : '📄';
        contentBlocks.push({
          type: 'text',
          text: `${emoji} **${result.fileName}** (attachment)\n📎 Download URL: ${attachmentUrl}`,
        });
      }

      return { content: contentBlocks as any };
    }
    default:
      throw new Error(`Unknown work items tool: ${request.params.name}`);
  }
};
