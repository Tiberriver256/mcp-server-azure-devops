import { WebApi } from 'azure-devops-node-api';
import { WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import {
  processWorkItemAttachments,
  WorkItemAttachment,
  AttachmentProcessingOptions,
} from '../../../utils/attachment-processor';

/**
 * Options for getting work item attachments
 */
export interface GetWorkItemAttachmentsOptions {
  workItemId: number;
  projectId?: string;
  includeContent: boolean;
  maxAttachmentSize: number;
  imageFormats: string[];
  convertImagesToBase64: boolean;
  includeImageMetadata: boolean;
  filterByType?: 'images' | 'documents' | 'all';
  concurrentDownloads: number;
  timeoutMs: number;
}

/**
 * Default options for attachment retrieval
 */
export const DEFAULT_ATTACHMENT_RETRIEVAL_OPTIONS: Partial<GetWorkItemAttachmentsOptions> =
  {
    includeContent: true,
    maxAttachmentSize: 10 * 1024 * 1024, // 10MB
    imageFormats: [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/bmp',
      'image/webp',
    ],
    convertImagesToBase64: true,
    includeImageMetadata: true,
    filterByType: 'all',
    concurrentDownloads: 3,
    timeoutMs: 30000,
  };

/**
 * Enhanced attachment with additional processing info
 */
export interface EnhancedWorkItemAttachment extends WorkItemAttachment {
  processingTime?: number;
  cacheHit?: boolean;
  thumbnailBase64?: string;
}

/**
 * Result of getting work item attachments
 */
export interface GetWorkItemAttachmentsResult {
  workItemId: number;
  attachments: EnhancedWorkItemAttachment[];
  totalCount: number;
  imageCount: number;
  documentCount: number;
  totalSize: number;
  processingTimeMs: number;
  cacheHits: number;
}

/**
 * Get all attachments for a work item
 *
 * @param connection Azure DevOps WebApi connection
 * @param options Attachment retrieval options
 * @returns Promise<GetWorkItemAttachmentsResult>
 */
export async function getWorkItemAttachments(
  connection: WebApi,
  options: GetWorkItemAttachmentsOptions,
): Promise<GetWorkItemAttachmentsResult> {
  const startTime = Date.now();

  try {
    // First, get the work item to access its attachments
    const witApi = await connection.getWorkItemTrackingApi();

    const workItem = await witApi.getWorkItem(
      options.workItemId,
      undefined, // fields
      undefined, // asOf
      WorkItemExpand.Relations, // expand relations to get attachments
    );

    if (!workItem) {
      throw new AzureDevOpsResourceNotFoundError(
        `Work item '${options.workItemId}' not found`,
      );
    }

    // Process attachments - return URLs instead of base64 content to avoid token limits
    const processingOptions: Partial<AttachmentProcessingOptions> = {
      includeContent: false, // Don't download content, just return metadata and URLs
      maxAttachmentSize: options.maxAttachmentSize,
      imageFormats: options.imageFormats,
      convertImagesToBase64: false, // Don't convert to base64
      concurrentDownloads: options.concurrentDownloads,
      timeoutMs: options.timeoutMs,
    };

    const attachments = await processWorkItemAttachments(
      connection,
      workItem,
      processingOptions,
    );

    // Enhance attachments with additional processing info
    const enhancedAttachments: EnhancedWorkItemAttachment[] = attachments.map(
      (attachment) => ({
        ...attachment,
        processingTime: 0, // Would be tracked during processing
        cacheHit: false, // Would be tracked during processing
      }),
    );

    // Filter by type if requested
    const filteredAttachments = filterAttachmentsByType(
      enhancedAttachments,
      options.filterByType || 'all',
    );

    // Calculate statistics
    const stats = calculateAttachmentStatistics(filteredAttachments);

    const processingTimeMs = Date.now() - startTime;

    return {
      workItemId: options.workItemId,
      attachments: filteredAttachments,
      totalCount: filteredAttachments.length,
      imageCount: stats.imageCount,
      documentCount: stats.documentCount,
      totalSize: stats.totalSize,
      processingTimeMs,
      cacheHits: 0, // Would be calculated during processing
    };
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    throw new AzureDevOpsError(
      `Failed to get work item attachments: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Get attachment summary without downloading content
 *
 * @param connection Azure DevOps WebApi connection
 * @param workItemId Work item ID
 * @returns Promise<attachment summary>
 */
export async function getWorkItemAttachmentSummary(
  connection: WebApi,
  workItemId: number,
): Promise<{
  totalCount: number;
  imageCount: number;
  documentCount: number;
  totalSize: number;
  attachments: Array<{
    id: string;
    fileName: string;
    size: number;
    contentType: string;
    isImage: boolean;
  }>;
}> {
  try {
    const witApi = await connection.getWorkItemTrackingApi();

    const workItem = await witApi.getWorkItem(
      workItemId,
      undefined,
      undefined,
      WorkItemExpand.Relations,
    );

    if (!workItem) {
      throw new AzureDevOpsResourceNotFoundError(
        `Work item '${workItemId}' not found`,
      );
    }

    // Process attachments without downloading content
    const attachments = await processWorkItemAttachments(connection, workItem, {
      includeContent: false,
    });

    const stats = calculateAttachmentStatistics(attachments);

    return {
      totalCount: attachments.length,
      imageCount: stats.imageCount,
      documentCount: stats.documentCount,
      totalSize: stats.totalSize,
      attachments: attachments.map((att) => ({
        id: att.id,
        fileName: att.fileName,
        size: att.size,
        contentType: att.contentType,
        isImage: att.isImage,
      })),
    };
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    throw new AzureDevOpsError(
      `Failed to get attachment summary: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Filter attachments by type
 *
 * @param attachments Array of attachments
 * @param filterType Type filter
 * @returns Filtered attachments
 */
function filterAttachmentsByType(
  attachments: EnhancedWorkItemAttachment[],
  filterType: 'images' | 'documents' | 'all',
): EnhancedWorkItemAttachment[] {
  switch (filterType) {
    case 'images':
      return attachments.filter((att) => att.isImage);
    case 'documents':
      return attachments.filter((att) => !att.isImage);
    case 'all':
    default:
      return attachments;
  }
}

/**
 * Calculate attachment statistics
 *
 * @param attachments Array of attachments
 * @returns Statistics object
 */
function calculateAttachmentStatistics(attachments: WorkItemAttachment[]): {
  imageCount: number;
  documentCount: number;
  totalSize: number;
} {
  let imageCount = 0;
  let documentCount = 0;
  let totalSize = 0;

  for (const attachment of attachments) {
    if (attachment.isImage) {
      imageCount++;
    } else {
      documentCount++;
    }
    totalSize += attachment.size;
  }

  return {
    imageCount,
    documentCount,
    totalSize,
  };
}

/**
 * Get attachment by ID
 *
 * @param connection Azure DevOps WebApi connection
 * @param workItemId Work item ID
 * @param attachmentId Attachment ID
 * @param includeContent Whether to download content
 * @returns Promise<EnhancedWorkItemAttachment or null>
 */
export async function getWorkItemAttachmentById(
  connection: WebApi,
  workItemId: number,
  attachmentId: string,
  _includeContent: boolean = false, // Changed default to false to avoid token limits
): Promise<EnhancedWorkItemAttachment | null> {
  const result = await getWorkItemAttachments(connection, {
    workItemId,
    includeContent: false, // Force to false to avoid token limits - return URL instead
    maxAttachmentSize: 50 * 1024 * 1024, // 50MB for single attachment
    imageFormats: [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/bmp',
      'image/webp',
    ],
    convertImagesToBase64: false, // Force to false to avoid token limits
    includeImageMetadata: true,
    concurrentDownloads: 1,
    timeoutMs: 60000, // 60 seconds for single attachment
  });

  return result.attachments.find((att) => att.id === attachmentId) || null;
}
