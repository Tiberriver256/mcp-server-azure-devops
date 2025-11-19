import { WebApi } from 'azure-devops-node-api';
import {
  CommentList,
  CommentExpandOptions,
  CommentSortOrder,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import sharp from 'sharp';

/**
 * Compress an image to reduce size and token count
 */
async function compressImage(
  buffer: Buffer,
  mimeType: string,
  maxWidth: number = 800,
  maxHeight: number = 600,
  quality: number = 75,
): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    let pipeline = sharp(buffer);

    // Get image metadata to check if resizing is needed
    const metadata = await pipeline.metadata();
    const needsResize =
      (metadata.width && metadata.width > maxWidth) ||
      (metadata.height && metadata.height > maxHeight);

    if (needsResize) {
      pipeline = pipeline.resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Convert to appropriate format with compression
    if (mimeType.includes('png')) {
      pipeline = pipeline.png({
        compressionLevel: 6,
        palette: true, // Use palette for smaller files when possible
      });
    } else {
      // Convert everything else to JPEG for better compression
      pipeline = pipeline.jpeg({ quality });
      mimeType = 'image/jpeg';
    }

    const compressedBuffer = await pipeline.toBuffer();

    console.log(
      `Image compressed: ${buffer.length} bytes → ${compressedBuffer.length} bytes (${Math.round((1 - compressedBuffer.length / buffer.length) * 100)}% reduction)`,
    );

    return { buffer: compressedBuffer, mimeType };
  } catch (error) {
    console.warn('Image compression failed, using original:', error);
    return { buffer, mimeType };
  }
}

/**
 * Raw comment data structure from Azure DevOps API
 */
interface RawWorkItemComment {
  id?: number;
  workItemId?: number;
  text?: string;
  createdBy?: {
    displayName?: string;
    uniqueName?: string;
    imageUrl?: string;
    id?: string;
  };
  createdDate?: Date | string;
  modifiedDate?: Date | string;
  url?: string;
  format?: string | { toString: () => string };
  reactions?: Array<{
    type?: string;
    count?: number;
    users?: Array<{
      displayName?: string;
      uniqueName?: string;
    }>;
  }>;
}

/**
 * Enhanced work item comment with additional processed fields
 */
export interface EnhancedWorkItemComment {
  id: number;
  workItemId: number;
  text: string;
  createdBy: {
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
    id: string;
  };
  createdDate: string;
  modifiedDate?: string;
  url: string;
  format?: string;
  mentions?: Array<{
    id: string;
    displayName: string;
    uniqueName: string;
  }>;
  reactions?: Array<{
    type: string;
    count: number;
    users: Array<{
      displayName: string;
      uniqueName: string;
    }>;
  }>;
}

/**
 * Options for retrieving work item comments
 */
export interface GetWorkItemCommentsOptions {
  projectId: string;
  workItemId: number;
  top?: number;
  continuationToken?: string;
  includeDeleted?: boolean;
  expand?: CommentExpandOptions;
  order?: CommentSortOrder;
  processImages?: boolean;
  maxImageSize?: number;
  timeoutMs?: number;
  imagePreviewMode?: boolean;
  separateImages?: boolean;
}

/**
 * Result with comments and extracted images
 */
export interface GetWorkItemCommentsResult {
  comments: EnhancedWorkItemComment[];
  images: Array<{
    base64Data: string;
    mimeType: string;
    fileName: string;
    fromCommentId: number;
    description: string;
    originalUrl: string;
  }>;
}

/**
 * Get all comments for a work item with enhanced processing
 *
 * @param connection Azure DevOps WebApi connection
 * @param options Comment retrieval options
 * @returns Promise<EnhancedWorkItemComment[]>
 */
export async function getWorkItemComments(
  connection: WebApi,
  options: GetWorkItemCommentsOptions,
): Promise<GetWorkItemCommentsResult> {
  try {
    console.log(
      `getWorkItemComments called with processImages: ${options.processImages}`,
    );
    const witApi = await connection.getWorkItemTrackingApi();

    // Call Azure DevOps API to get comments
    const commentsList: CommentList = await witApi.getComments(
      options.projectId,
      options.workItemId,
      options.top,
      options.continuationToken,
      options.includeDeleted,
      options.expand,
      options.order,
    );

    if (!commentsList.comments || commentsList.comments.length === 0) {
      return { comments: [], images: [] };
    }

    // Transform raw comments to enhanced format
    const enhancedComments: EnhancedWorkItemComment[] =
      commentsList.comments.map((comment) =>
        transformComment(comment as RawWorkItemComment),
      );

    const extractedImages: GetWorkItemCommentsResult['images'] = [];

    // Process images in comment text if requested
    if (options.processImages !== false) {
      // Default to true
      console.log(
        `Processing images for ${enhancedComments.length} comments...`,
      );

      for (const comment of enhancedComments) {
        try {
          if (comment.text && comment.text.includes('<img')) {
            console.log(`Processing images in comment ${comment.id}...`);

            if (options.separateImages) {
              // Extract images as separate content blocks
              const { processedText, images } = await extractImagesFromText(
                connection,
                comment.text,
                options,
                comment.id,
              );
              comment.text = processedText;
              extractedImages.push(...images);
            } else {
              // Embed images in text (original behavior)
              comment.text = await processImagesInText(
                connection,
                comment.text,
                options,
              );
            }

            console.log(`Processed comment ${comment.id}`);
          }
        } catch (error) {
          console.error(
            `Failed to process images in comment ${comment.id}:`,
            error,
          );
          // Continue with original text
        }
      }
    }

    return { comments: enhancedComments, images: extractedImages };
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    // Handle specific Azure DevOps API errors
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        throw new AzureDevOpsResourceNotFoundError(
          `Work item '${options.workItemId}' not found or has no comments`,
        );
      }
    }

    throw new AzureDevOpsError(
      `Failed to get work item comments: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Transform raw Azure DevOps comment to enhanced format
 *
 * @param comment Raw WorkItemComment from Azure DevOps API
 * @returns EnhancedWorkItemComment
 */
function transformComment(
  comment: RawWorkItemComment,
): EnhancedWorkItemComment {
  const enhanced: EnhancedWorkItemComment = {
    id: comment.id || 0,
    workItemId: comment.workItemId || 0,
    text: comment.text || '',
    createdBy: {
      displayName: comment.createdBy?.displayName || 'Unknown User',
      uniqueName: comment.createdBy?.uniqueName || '',
      imageUrl: comment.createdBy?.imageUrl,
      id: comment.createdBy?.id || '',
    },
    createdDate:
      comment.createdDate instanceof Date
        ? comment.createdDate.toISOString()
        : comment.createdDate || new Date().toISOString(),
    modifiedDate:
      comment.modifiedDate instanceof Date
        ? comment.modifiedDate.toISOString()
        : comment.modifiedDate,
    url: comment.url || '',
    format: comment.format?.toString() || 'markdown',
  };

  // Process mentions in comment text
  enhanced.mentions = extractMentions(comment.text || '');

  // Process reactions if available
  if (
    comment.reactions &&
    Array.isArray(comment.reactions) &&
    comment.reactions.length > 0
  ) {
    enhanced.reactions = comment.reactions.map((reaction) => ({
      type: reaction.type || 'like',
      count: reaction.count || 0,
      users: Array.isArray(reaction.users)
        ? reaction.users.map((user) => ({
            displayName: user.displayName || '',
            uniqueName: user.uniqueName || '',
          }))
        : [],
    }));
  }

  return enhanced;
}

/**
 * Extract @mentions from comment text
 *
 * @param text Comment text content
 * @returns Array of mentioned users
 */
function extractMentions(
  text: string,
): Array<{ id: string; displayName: string; uniqueName: string }> {
  const mentions: Array<{
    id: string;
    displayName: string;
    uniqueName: string;
  }> = [];

  // Match Azure DevOps mention format: <a href="#" data-vss-mention="version:2.0,id">@DisplayName</a>
  const mentionRegex =
    /<a[^>]+data-vss-mention="[^"]*,([^"]+)"[^>]*>@([^<]+)<\/a>/g;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push({
      id: match[1],
      displayName: match[2],
      uniqueName: '', // Will be populated from user lookup if needed
    });
  }

  return mentions;
}

/**
 * Extract images from text as separate content blocks
 */
async function extractImagesFromText(
  connection: WebApi,
  htmlText: string,
  options: GetWorkItemCommentsOptions,
  commentId: number,
): Promise<{
  processedText: string;
  images: GetWorkItemCommentsResult['images'];
}> {
  const maxSize = options.maxImageSize || 5242880; // 5MB default
  const timeout = options.timeoutMs || 30000; // 30s default

  // Extract image URLs
  const imgRegex = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const matches = Array.from(htmlText.matchAll(imgRegex));

  console.log(`Found ${matches.length} img tags for extraction`);

  let processedText = htmlText;
  const extractedImages: GetWorkItemCommentsResult['images'] = [];

  for (const match of matches) {
    const fullImgTag = match[0];
    const imageUrl = match[1];

    console.log(`Extracting image: ${imageUrl}`);

    // Check if it's an Azure DevOps attachment URL
    if (
      imageUrl.includes('/_apis/wit/attachments/') ||
      (imageUrl.includes('/tfs/') && imageUrl.includes('/attachments/'))
    ) {
      try {
        console.log(`Downloading image for extraction: ${imageUrl}`);

        // Get authentication header
        const authHeader = await getAuthHeaderFromConnection(connection);

        // Download the image with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(imageUrl, {
          headers: {
            Authorization: authHeader,
            Accept: 'image/*',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const contentType =
            response.headers.get('content-type') || 'application/octet-stream';
          const contentLength = parseInt(
            response.headers.get('content-length') || '0',
          );

          console.log(
            `Image response: ${response.status}, type: ${contentType}, size: ${contentLength}`,
          );

          if (contentLength <= maxSize && contentType.startsWith('image/')) {
            const buffer = await response.arrayBuffer();
            const originalBuffer = Buffer.from(buffer);

            // Compress the image to reduce token usage
            const { buffer: compressedBuffer, mimeType: compressedMimeType } =
              await compressImage(
                originalBuffer,
                contentType,
                800, // max width
                600, // max height
                75, // JPEG quality
              );

            const base64 = compressedBuffer.toString('base64');
            const fileName =
              imageUrl.split('fileName=')[1] || `image_${Date.now()}.png`;

            console.log(
              `Extracted and compressed image as base64 (${base64.length} chars)`,
            );

            // Add to extracted images
            extractedImages.push({
              base64Data: base64,
              mimeType: compressedMimeType,
              fileName,
              fromCommentId: commentId,
              description: `Image from comment ${commentId}: ${fileName} (compressed: ${Math.round(compressedBuffer.length / 1024)}KB)`,
              originalUrl: imageUrl,
            });

            // Replace img tag with placeholder in text
            const placeholder = `[📷 Image: ${fileName} - see below]`;
            processedText = processedText.replace(fullImgTag, placeholder);
          } else {
            console.log(
              `Image too large (${contentLength}) or wrong type (${contentType})`,
            );
            const placeholder = `[📷 Image too large: ${Math.round(contentLength / 1024)}KB]`;
            processedText = processedText.replace(fullImgTag, placeholder);
          }
        } else {
          console.log(
            `Failed to download image: ${response.status} ${response.statusText}`,
          );
          const placeholder = `[📷 Image unavailable: ${imageUrl}]`;
          processedText = processedText.replace(fullImgTag, placeholder);
        }
      } catch (error) {
        console.error(`Error extracting image ${imageUrl}:`, error);
        const placeholder = `[📷 Image error: ${imageUrl}]`;
        processedText = processedText.replace(fullImgTag, placeholder);
      }
    } else {
      console.log(`Skipping non-Azure DevOps image: ${imageUrl}`);
      const placeholder = `[📷 External image: ${imageUrl}]`;
      processedText = processedText.replace(fullImgTag, placeholder);
    }
  }

  return { processedText, images: extractedImages };
}

/**
 * Simple image processing for comment text
 */
async function processImagesInText(
  connection: WebApi,
  htmlText: string,
  options: GetWorkItemCommentsOptions,
): Promise<string> {
  const maxSize = options.maxImageSize || 5242880; // 5MB default
  const timeout = options.timeoutMs || 30000; // 30s default
  const previewMode = options.imagePreviewMode || false;

  // Extract image URLs
  const imgRegex = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const matches = Array.from(htmlText.matchAll(imgRegex));

  console.log(`Found ${matches.length} img tags`);

  let processedText = htmlText;

  for (const match of matches) {
    const fullImgTag = match[0];
    const imageUrl = match[1];

    console.log(`Processing image: ${imageUrl}`);

    // Check if it's an Azure DevOps attachment URL
    if (
      imageUrl.includes('/_apis/wit/attachments/') ||
      (imageUrl.includes('/tfs/') && imageUrl.includes('/attachments/'))
    ) {
      try {
        console.log(`Downloading image from: ${imageUrl}`);

        // Get authentication header
        const authHeader = await getAuthHeaderFromConnection(connection);

        // Download the image with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(imageUrl, {
          headers: {
            Authorization: authHeader,
            Accept: 'image/*',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const contentType =
            response.headers.get('content-type') || 'application/octet-stream';
          const contentLength = parseInt(
            response.headers.get('content-length') || '0',
          );

          console.log(
            `Image response: ${response.status}, type: ${contentType}, size: ${contentLength}`,
          );

          if (contentLength <= maxSize && contentType.startsWith('image/')) {
            if (previewMode) {
              // Preview mode: replace with descriptive text
              const fileName = imageUrl.split('fileName=')[1] || 'image';
              const fileSizeKB = Math.round(contentLength / 1024);
              const previewText = `[🖼️ IMAGE: ${fileName} (${contentType}, ${fileSizeKB}KB) - Original URL: ${imageUrl}]`;
              processedText = processedText.replace(fullImgTag, previewText);
              console.log(`Replaced with preview: ${previewText}`);
            } else {
              // Full mode: convert to base64 with compression
              const buffer = await response.arrayBuffer();
              const originalBuffer = Buffer.from(buffer);

              // Compress the image to reduce token usage
              const { buffer: compressedBuffer, mimeType: compressedMimeType } =
                await compressImage(
                  originalBuffer,
                  contentType,
                  800, // max width
                  600, // max height
                  75, // JPEG quality
                );

              const base64 = compressedBuffer.toString('base64');
              const dataUrl = `data:${compressedMimeType};base64,${base64}`;

              console.log(
                `Converted and compressed image to base64 (${base64.length} chars)`,
              );

              // Replace the src in the img tag
              const newImgTag = fullImgTag.replace(imageUrl, dataUrl);
              processedText = processedText.replace(fullImgTag, newImgTag);
            }
          } else {
            console.log(
              `Image too large (${contentLength}) or wrong type (${contentType})`,
            );
          }
        } else {
          console.log(
            `Failed to download image: ${response.status} ${response.statusText}`,
          );
        }
      } catch (error) {
        console.error(`Error processing image ${imageUrl}:`, error);
      }
    } else {
      console.log(`Skipping non-Azure DevOps image: ${imageUrl}`);
    }
  }

  return processedText;
}

/**
 * Get authorization header from WebApi connection
 */
async function getAuthHeaderFromConnection(
  connection: WebApi,
): Promise<string> {
  // Access the internal auth handler
  const authHandler = (connection as any).authHandler;

  if (authHandler && authHandler.token) {
    // Personal Access Token
    return `Basic ${Buffer.from(`:${authHandler.token}`).toString('base64')}`;
  }

  if (authHandler && authHandler.credentials) {
    // Bearer token
    return `Bearer ${authHandler.credentials}`;
  }

  throw new Error('No valid authentication found in connection');
}

/**
 * Get comments with pagination support
 *
 * @param connection Azure DevOps WebApi connection
 * @param options Comment retrieval options
 * @returns Promise<{comments: EnhancedWorkItemComment[], continuationToken?: string}>
 */
export async function getWorkItemCommentsWithPagination(
  connection: WebApi,
  options: GetWorkItemCommentsOptions,
): Promise<{
  comments: EnhancedWorkItemComment[];
  continuationToken?: string;
}> {
  try {
    const witApi = await connection.getWorkItemTrackingApi();

    const commentsList: CommentList = await witApi.getComments(
      options.projectId,
      options.workItemId,
      options.top,
      options.continuationToken,
      options.includeDeleted,
      options.expand,
      options.order,
    );

    const comments =
      commentsList.comments?.map((comment) =>
        transformComment(comment as RawWorkItemComment),
      ) || [];

    return {
      comments,
      continuationToken: commentsList.continuationToken,
    };
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new AzureDevOpsError(
      `Failed to get work item comments with pagination: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
