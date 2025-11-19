import { WebApi } from 'azure-devops-node-api';
import { downloadAttachment } from './download-manager';
import { convertToBase64DataUrl, isImageMimeType } from './base64-converter';
import { AzureDevOpsError } from '../shared/errors';

/**
 * Options for HTML image processing
 */
export interface HtmlImageProcessingOptions {
  maxImageSize: number; // Maximum size in bytes
  supportedFormats: string[]; // Supported MIME types
  timeoutMs: number; // Download timeout
  replaceWithDataUrls: boolean; // Replace URLs with data URLs
  addImageMetadata: boolean; // Add metadata as HTML attributes
  concurrentDownloads: number; // Max concurrent downloads
}

/**
 * Default options for HTML image processing
 */
export const DEFAULT_HTML_IMAGE_OPTIONS: HtmlImageProcessingOptions = {
  maxImageSize: 5 * 1024 * 1024, // 5MB
  supportedFormats: [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/bmp',
    'image/webp',
  ],
  timeoutMs: 30000, // 30 seconds
  replaceWithDataUrls: true,
  addImageMetadata: true,
  concurrentDownloads: 3,
};

/**
 * Information about an image found in HTML
 */
export interface HtmlImageInfo {
  originalUrl: string;
  dataUrl?: string;
  fileName?: string;
  size?: number;
  contentType?: string;
  width?: number;
  height?: number;
  error?: string;
}

/**
 * Result of processing HTML images
 */
export interface HtmlImageProcessingResult {
  processedHtml: string;
  images: HtmlImageInfo[];
  successCount: number;
  failureCount: number;
}

/**
 * Process all images in HTML content from work item fields
 *
 * @param connection Azure DevOps WebApi connection
 * @param htmlContent The HTML content to process
 * @param options Processing options
 * @returns Promise<HtmlImageProcessingResult>
 */
export async function processHtmlImages(
  connection: WebApi,
  htmlContent: string,
  options: Partial<HtmlImageProcessingOptions> = {},
): Promise<HtmlImageProcessingResult> {
  const config: HtmlImageProcessingOptions = {
    ...DEFAULT_HTML_IMAGE_OPTIONS,
    ...options,
  };

  if (!htmlContent || htmlContent.trim() === '') {
    return {
      processedHtml: htmlContent,
      images: [],
      successCount: 0,
      failureCount: 0,
    };
  }

  try {
    // Extract all image URLs from HTML
    const imageUrls = extractImageUrls(htmlContent);
    console.log(`Found ${imageUrls.length} image URLs in HTML`);

    if (imageUrls.length === 0) {
      return {
        processedHtml: htmlContent,
        images: [],
        successCount: 0,
        failureCount: 0,
      };
    }

    // Filter for Azure DevOps attachment URLs
    const attachmentUrls = imageUrls.filter((url) =>
      isAzureDevOpsAttachmentUrl(url),
    );
    console.log(`Found ${attachmentUrls.length} Azure DevOps attachment URLs`);
    for (const url of attachmentUrls) {
      console.log(`  - ${url}`);
    }

    if (attachmentUrls.length === 0) {
      console.log('No Azure DevOps attachment URLs found');
      return {
        processedHtml: htmlContent,
        images: imageUrls.map((url) => ({ originalUrl: url })),
        successCount: 0,
        failureCount: 0,
      };
    }

    // Process images with concurrency control
    const imageInfos = await processImagesWithConcurrency(
      connection,
      attachmentUrls,
      config,
    );

    // Replace URLs in HTML content
    let processedHtml = htmlContent;
    let successCount = 0;
    let failureCount = 0;

    for (const imageInfo of imageInfos) {
      if (imageInfo.dataUrl && config.replaceWithDataUrls) {
        // Replace original URL with data URL
        processedHtml = replaceImageUrl(
          processedHtml,
          imageInfo.originalUrl,
          imageInfo.dataUrl,
          imageInfo,
          config.addImageMetadata,
        );
        successCount++;
      } else {
        failureCount++;
      }
    }

    // Add any non-attachment URLs to the results
    const nonAttachmentImages = imageUrls
      .filter((url) => !isAzureDevOpsAttachmentUrl(url))
      .map((url) => ({ originalUrl: url }));

    return {
      processedHtml,
      images: [...imageInfos, ...nonAttachmentImages],
      successCount,
      failureCount,
    };
  } catch (error) {
    throw new AzureDevOpsError(
      `Failed to process HTML images: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Extract all image URLs from HTML content with robust error handling
 *
 * @param html HTML content to parse
 * @returns Array of image URLs
 */
export function extractImageUrls(html: string): string[] {
  if (!html || typeof html !== 'string') return [];

  const imageUrls: string[] = [];

  try {
    // Clean up malformed HTML by removing null bytes and control characters
    // eslint-disable-next-line no-control-regex
    const cleanHtml = html.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Multiple regex patterns to catch different img tag formats
    const imgPatterns = [
      // Standard img tags with quoted src
      /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi,
      // Img tags with unquoted src
      /<img[^>]+src\s*=\s*([^\s>]+)[^>]*>/gi,
      // Self-closing img tags
      /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*\/>/gi,
    ];

    for (const regex of imgPatterns) {
      let match;
      // Reset lastIndex for each pattern
      regex.lastIndex = 0;

      while ((match = regex.exec(cleanHtml)) !== null) {
        const url = match[1];
        if (url && url.trim() && !imageUrls.includes(url.trim())) {
          // Decode HTML entities in URLs
          const decodedUrl = decodeHtmlEntities(url.trim());
          if (isValidUrl(decodedUrl)) {
            imageUrls.push(decodedUrl);
          }
        }
      }
    }

    // Also look for background-image CSS properties
    const cssImagePattern =
      /background-image\s*:\s*url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi;
    let cssMatch;
    while ((cssMatch = cssImagePattern.exec(cleanHtml)) !== null) {
      const url = cssMatch[1];
      if (url && url.trim() && !imageUrls.includes(url.trim())) {
        const decodedUrl = decodeHtmlEntities(url.trim());
        if (isValidUrl(decodedUrl)) {
          imageUrls.push(decodedUrl);
        }
      }
    }
  } catch (error) {
    console.warn('Error extracting image URLs from HTML:', error);
    // Return any URLs found so far
  }

  return imageUrls;
}

/**
 * Decode common HTML entities in URLs
 *
 * @param str String that may contain HTML entities
 * @returns Decoded string
 */
function decodeHtmlEntities(str: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#x60;': '`',
    '&#x3D;': '=',
  };

  return str.replace(/&[^;]+;/g, (entity) => entities[entity] || entity);
}

/**
 * Basic URL validation
 *
 * @param url URL to validate
 * @returns true if URL appears valid
 */
function isValidUrl(url: string): boolean {
  if (!url || url.length < 4) return false;

  // Check for common URL patterns
  return (
    /^(https?:\/\/|\/\/|\/|[a-zA-Z]:\/\/)/i.test(url) &&
    !url.includes('<') &&
    !url.includes('>') &&
    !url.includes('"') &&
    !url.includes("'")
  );
}

/**
 * Check if a URL is an Azure DevOps attachment URL
 *
 * @param url URL to check
 * @returns true if it's an Azure DevOps attachment URL
 */
export function isAzureDevOpsAttachmentUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Enhanced Azure DevOps attachment URL detection
  const azureDevOpsPatterns = [
    '/_apis/wit/attachments/',
    '/tfs/',
    '/DefaultCollection/',
    '/_api/Attachment/',
    '/attachments/',
    // TFS on-premises patterns
    '/tfs/Deltek/',
    'https://tfs.deltek.com',
    // Cloud patterns
    '.visualstudio.com',
    'dev.azure.com',
  ];

  return azureDevOpsPatterns.some((pattern) => url.includes(pattern));
}

/**
 * Process multiple images with concurrency control
 *
 * @param connection Azure DevOps WebApi connection
 * @param urls Array of image URLs
 * @param config Processing configuration
 * @returns Promise<HtmlImageInfo[]>
 */
async function processImagesWithConcurrency(
  connection: WebApi,
  urls: string[],
  config: HtmlImageProcessingOptions,
): Promise<HtmlImageInfo[]> {
  const results: HtmlImageInfo[] = [];

  // Process URLs in chunks to control concurrency
  for (let i = 0; i < urls.length; i += config.concurrentDownloads) {
    const chunk = urls.slice(i, i + config.concurrentDownloads);

    const chunkPromises = chunk.map((url) =>
      processHtmlImage(connection, url, config),
    );

    const chunkResults = await Promise.allSettled(chunkPromises);

    // Collect results
    chunkResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          originalUrl: chunk[index],
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        });
      }
    });
  }

  return results;
}

/**
 * Process a single HTML image
 *
 * @param connection Azure DevOps WebApi connection
 * @param url Image URL
 * @param config Processing configuration
 * @returns Promise<HtmlImageInfo>
 */
async function processHtmlImage(
  connection: WebApi,
  url: string,
  config: HtmlImageProcessingOptions,
): Promise<HtmlImageInfo> {
  const imageInfo: HtmlImageInfo = {
    originalUrl: url,
  };

  try {
    // Download the image
    const downloadResult = await downloadAttachment(
      connection,
      url,
      config.timeoutMs,
    );

    imageInfo.size = downloadResult.size;
    imageInfo.contentType = downloadResult.contentType;
    imageInfo.fileName = extractFileNameFromUrl(url);

    // Check if it's actually an image
    if (!isImageMimeType(downloadResult.contentType)) {
      imageInfo.error = `Not an image: ${downloadResult.contentType}`;
      return imageInfo;
    }

    // Check size limits
    if (downloadResult.size > config.maxImageSize) {
      imageInfo.error = `Image too large: ${downloadResult.size} > ${config.maxImageSize}`;
      return imageInfo;
    }

    // Check if format is supported
    if (!config.supportedFormats.includes(downloadResult.contentType)) {
      imageInfo.error = `Unsupported format: ${downloadResult.contentType}`;
      return imageInfo;
    }

    // Convert to base64 data URL
    imageInfo.dataUrl = convertToBase64DataUrl(
      downloadResult.content,
      downloadResult.contentType,
    );

    // Try to get image dimensions (basic implementation)
    const dimensions = getBasicImageDimensions(
      downloadResult.content,
      downloadResult.contentType,
    );
    if (dimensions) {
      imageInfo.width = dimensions.width;
      imageInfo.height = dimensions.height;
    }

    return imageInfo;
  } catch (error) {
    imageInfo.error = error instanceof Error ? error.message : String(error);
    return imageInfo;
  }
}

/**
 * Replace image URL in HTML content with data URL
 *
 * @param html Original HTML content
 * @param originalUrl Original image URL
 * @param dataUrl Base64 data URL
 * @param imageInfo Image metadata
 * @param addMetadata Whether to add metadata attributes
 * @returns Modified HTML content
 */
function replaceImageUrl(
  html: string,
  originalUrl: string,
  dataUrl: string,
  imageInfo: HtmlImageInfo,
  addMetadata: boolean,
): string {
  // Escape special regex characters in URL
  const escapedUrl = originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  if (addMetadata) {
    // Replace with enhanced img tag including metadata
    const imgRegex = new RegExp(
      `(<img[^>]+src\\s*=\\s*["'])${escapedUrl}(["'][^>]*>)`,
      'gi',
    );

    return html.replace(imgRegex, (_match, beforeSrc, afterSrc) => {
      let enhancedTag = `${beforeSrc}${dataUrl}${afterSrc}`;

      // Add metadata attributes if they don't already exist
      if (imageInfo.fileName && !enhancedTag.includes('data-filename=')) {
        enhancedTag = enhancedTag.replace(
          '>',
          ` data-filename="${imageInfo.fileName}">`,
        );
      }

      if (imageInfo.size && !enhancedTag.includes('data-size=')) {
        enhancedTag = enhancedTag.replace(
          '>',
          ` data-size="${imageInfo.size}">`,
        );
      }

      if (
        imageInfo.width &&
        imageInfo.height &&
        !enhancedTag.includes('width=')
      ) {
        enhancedTag = enhancedTag.replace(
          '>',
          ` width="${imageInfo.width}" height="${imageInfo.height}">`,
        );
      }

      return enhancedTag;
    });
  } else {
    // Simple URL replacement
    const imgRegex = new RegExp(`(src\\s*=\\s*["'])${escapedUrl}(["'])`, 'gi');

    return html.replace(imgRegex, `$1${dataUrl}$2`);
  }
}

/**
 * Extract filename from URL
 *
 * @param url The URL
 * @returns Filename or default
 */
function extractFileNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return (
      urlObj.searchParams.get('fileName') ||
      urlObj.pathname.split('/').pop() ||
      'image'
    );
  } catch {
    return 'image';
  }
}

/**
 * Get basic image dimensions (simplified implementation)
 *
 * @param buffer Image buffer
 * @param mimeType MIME type
 * @returns Dimensions or null
 */
function getBasicImageDimensions(
  buffer: Buffer,
  mimeType: string,
): { width: number; height: number } | null {
  // Very basic dimension detection - for production use a proper library
  if (mimeType === 'image/png' && buffer.length >= 24) {
    if (buffer.toString('ascii', 1, 4) === 'PNG') {
      try {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height };
      } catch {
        return null;
      }
    }
  }

  // For other formats, return null (would need proper image parsing)
  return null;
}

/**
 * Process work item fields that contain HTML
 *
 * @param connection Azure DevOps WebApi connection
 * @param fields Work item fields object
 * @param options Processing options
 * @returns Promise<processed fields with embedded images>
 */
export async function processWorkItemHtmlFields(
  connection: WebApi,
  fields: Record<string, unknown>,
  options: Partial<HtmlImageProcessingOptions> = {},
): Promise<{
  processedFields: Record<string, string>;
  allImages: HtmlImageInfo[];
}> {
  const htmlFieldNames = [
    'System.Description',
    'Microsoft.VSTS.Common.DescriptionHtml',
    'Microsoft.VSTS.TCM.ReproSteps',
    'System.History',
    'Microsoft.VSTS.Common.AcceptanceCriteria',
  ];

  const processedFields: Record<string, string> = {};
  const allImages: HtmlImageInfo[] = [];

  // Process each HTML field
  for (const fieldName of htmlFieldNames) {
    const fieldValue = fields[fieldName];

    if (
      fieldValue &&
      typeof fieldValue === 'string' &&
      fieldValue.trim() !== ''
    ) {
      const result = await processHtmlImages(connection, fieldValue, options);

      processedFields[fieldName] = result.processedHtml;
      allImages.push(...result.images);
    }
  }

  return {
    processedFields,
    allImages,
  };
}

/**
 * Multi-modal MCP response data for Claude Code
 */
export interface McpImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
  alt?: string;
}

export interface McpTextContent {
  type: 'text';
  text: string;
}

export type McpContent = McpTextContent | McpImageContent;

/**
 * Prepare multi-modal MCP response with images and text
 *
 * @param processedHtml The HTML content with embedded images
 * @param images Array of processed images
 * @param options Configuration options
 * @returns Multi-modal MCP content array
 */
export function prepareMcpMultiModalResponse(
  processedHtml: string,
  images: HtmlImageInfo[],
  options: {
    includeOriginalHtml?: boolean;
    includeImageMetadata?: boolean;
    maxImagesInResponse?: number;
    preferDataUrls?: boolean;
  } = {},
): McpContent[] {
  const {
    includeOriginalHtml = true,
    includeImageMetadata = true,
    maxImagesInResponse = 10,
    preferDataUrls: _preferDataUrls = true,
  } = options;

  const content: McpContent[] = [];

  // Add processed HTML as text content
  if (includeOriginalHtml && processedHtml) {
    const textContent: McpTextContent = {
      type: 'text',
      text: processedHtml,
    };
    content.push(textContent);
  }

  // Add successful images as separate image contents
  const successfulImages = images
    .filter((img) => img.dataUrl && !img.error)
    .slice(0, maxImagesInResponse);

  for (const imageInfo of successfulImages) {
    if (imageInfo.dataUrl) {
      // Extract base64 data from data URL
      const base64Data = imageInfo.dataUrl.split(',')[1];

      if (base64Data) {
        // Return image URL reference instead of base64 ImageContent
        const imageReference: McpTextContent = {
          type: 'text',
          text: `🖼️ **${imageInfo.fileName || 'Image'}**\n📎 ${imageInfo.originalUrl}`,
        };

        content.push(imageReference);

        // Add metadata as text if requested
        if (includeImageMetadata) {
          const metadata = [
            `Image: ${imageInfo.fileName || 'unknown'}`,
            `Size: ${imageInfo.size ? formatFileSize(imageInfo.size) : 'unknown'}`,
            `Type: ${imageInfo.contentType || 'unknown'}`,
            imageInfo.width && imageInfo.height
              ? `Dimensions: ${imageInfo.width}x${imageInfo.height}`
              : undefined,
          ]
            .filter(Boolean)
            .join(', ');

          const metadataContent: McpTextContent = {
            type: 'text',
            text: `[${metadata}]`,
          };

          content.push(metadataContent);
        }
      }
    }
  }

  // Add error information for failed images
  const failedImages = images.filter((img) => img.error);
  if (failedImages.length > 0) {
    const errorInfo = failedImages
      .map((img) => `Failed to process: ${img.originalUrl} (${img.error})`)
      .join('\n');

    const errorContent: McpTextContent = {
      type: 'text',
      text: `Image Processing Errors:\n${errorInfo}`,
    };

    content.push(errorContent);
  }

  return content;
}

/**
 * Create a comprehensive work item response with images
 *
 * @param workItemData Work item data with processed HTML fields
 * @param allImages All processed images from the work item
 * @returns Formatted response for Claude Code
 */
export function createWorkItemImageResponse(
  workItemData: {
    id: number;
    title?: string;
    fields: Record<string, unknown>;
    processedFields: Record<string, string>;
  },
  allImages: HtmlImageInfo[],
): {
  mcpContent: McpContent[];
  summary: {
    totalImages: number;
    successfulImages: number;
    failedImages: number;
    totalImageSize: number;
    imageFormats: string[];
  };
} {
  // Create summary
  const successfulImages = allImages.filter((img) => img.dataUrl && !img.error);
  const failedImages = allImages.filter((img) => img.error);
  const totalImageSize = allImages.reduce(
    (sum, img) => sum + (img.size || 0),
    0,
  );
  const imageFormats = [
    ...new Set(
      allImages
        .map((img) => img.contentType)
        .filter((type): type is string => Boolean(type)),
    ),
  ];

  // Build comprehensive response text
  const responseText = buildWorkItemResponseText(workItemData, allImages);

  // Create multi-modal content
  const mcpContent = prepareMcpMultiModalResponse(responseText, allImages, {
    includeOriginalHtml: true,
    includeImageMetadata: true,
    maxImagesInResponse: 15,
    preferDataUrls: true,
  });

  const summary = {
    totalImages: allImages.length,
    successfulImages: successfulImages.length,
    failedImages: failedImages.length,
    totalImageSize,
    imageFormats,
  };

  return {
    mcpContent,
    summary,
  };
}

/**
 * Build comprehensive work item response text
 *
 * @param workItemData Work item data
 * @param images Processed images
 * @returns Formatted response text
 */
function buildWorkItemResponseText(
  workItemData: {
    id: number;
    title?: string;
    fields: Record<string, unknown>;
    processedFields: Record<string, string>;
  },
  images: HtmlImageInfo[],
): string {
  const lines: string[] = [];

  // Header
  lines.push(
    `# Work Item ${workItemData.id}${workItemData.title ? `: ${workItemData.title}` : ''}`,
  );
  lines.push('');

  // Image processing summary
  const successful = images.filter((img) => !img.error).length;
  const failed = images.filter((img) => img.error).length;

  if (images.length > 0) {
    lines.push(
      `## Images Processed: ${images.length} (${successful} successful, ${failed} failed)`,
    );
    lines.push('');
  }

  // Processed HTML fields
  const htmlFields = [
    { key: 'System.Description', label: 'Description' },
    { key: 'Microsoft.VSTS.Common.DescriptionHtml', label: 'Description HTML' },
    { key: 'Microsoft.VSTS.TCM.ReproSteps', label: 'Reproduction Steps' },
    {
      key: 'Microsoft.VSTS.Common.AcceptanceCriteria',
      label: 'Acceptance Criteria',
    },
  ];

  for (const field of htmlFields) {
    const processedContent = workItemData.processedFields[field.key];
    if (processedContent && processedContent.trim()) {
      lines.push(`## ${field.label}`);
      lines.push(processedContent);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Format file size in human-readable format
 *
 * @param bytes File size in bytes
 * @returns Formatted size string
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
