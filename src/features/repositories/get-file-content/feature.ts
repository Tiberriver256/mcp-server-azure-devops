import { WebApi } from 'azure-devops-node-api';
import {
  GitVersionDescriptor,
  GitItem,
  GitVersionType,
  VersionControlRecursionType,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzureDevOpsResourceNotFoundError } from '../../../shared/errors';

/**
 * Response format for file content
 */
export interface FileContentResponse {
  content: string;
  isDirectory: boolean;
}

/**
 * Get content of a file or directory from a repository
 *
 * @param connection - Azure DevOps WebApi connection
 * @param projectId - Project ID or name
 * @param repositoryId - Repository ID or name
 * @param path - Path to file or directory
 * @param versionDescriptor - Optional version descriptor for retrieving file at specific commit/branch/tag
 * @returns Content of the file or list of items if path is a directory
 */
export async function getFileContent(
  connection: WebApi,
  projectId: string,
  repositoryId: string,
  path: string = '/',
  versionDescriptor?: { versionType: GitVersionType; version: string },
): Promise<FileContentResponse> {
  try {
    const gitApi = await connection.getGitApi();

    // Create version descriptor for API requests
    const gitVersionDescriptor: GitVersionDescriptor | undefined =
      versionDescriptor
        ? {
            version: versionDescriptor.version,
            versionType: versionDescriptor.versionType,
            versionOptions: undefined,
          }
        : undefined;

    // First, try to get items using the path to determine if it's a directory
    let isDirectory = false;
    let items: GitItem[] = [];

    try {
      items = await gitApi.getItems(
        repositoryId,
        projectId,
        path,
        VersionControlRecursionType.OneLevel,
        undefined,
        undefined,
        undefined,
        undefined,
        gitVersionDescriptor,
      );

      // If multiple items are returned or the path ends with /, it's a directory
      isDirectory = items.length > 1 || (path !== '/' && path.endsWith('/'));
    } catch {
      // If getItems fails, try to get file content directly
      isDirectory = false;
    }

    if (isDirectory) {
      // For directories, return a formatted list of the items
      return {
        content: JSON.stringify(items, null, 2),
        isDirectory: true,
      };
    } else {
      // For files, get the actual content
      try {
        // Get file content using the Git API
        const contentStream = await gitApi.getItemContent(
          repositoryId,
          path,
          projectId,
          undefined,
          undefined,
          undefined,
          undefined,
          false,
          gitVersionDescriptor,
          true,
        );

        // Convert the stream to a string
        if (contentStream) {
          const chunks: Buffer[] = [];

          // Listen for data events to collect chunks
          contentStream.on('data', (chunk) => {
            chunks.push(Buffer.from(chunk));
          });

          // Use a promise to wait for the stream to finish
          const content = await new Promise<string>((resolve, reject) => {
            contentStream.on('end', () => {
              // Concatenate all chunks and convert to string
              const buffer = Buffer.concat(chunks);
              resolve(buffer.toString('utf8'));
            });

            contentStream.on('error', (err) => {
              reject(err);
            });
          });

          return {
            content,
            isDirectory: false,
          };
        }

        throw new Error('No content returned from API');
      } catch (error) {
        // If it's a 404 or similar error, throw a ResourceNotFoundError
        if (
          error instanceof Error &&
          (error.message.includes('not found') ||
            error.message.includes('does not exist'))
        ) {
          throw new AzureDevOpsResourceNotFoundError(
            `Path '${path}' not found in repository '${repositoryId}' of project '${projectId}'`,
          );
        }
        throw error;
      }
    }
  } catch (error) {
    // If it's already an AzureDevOpsResourceNotFoundError, rethrow it
    if (error instanceof AzureDevOpsResourceNotFoundError) {
      throw error;
    }

    // Otherwise, wrap it in a ResourceNotFoundError
    throw new AzureDevOpsResourceNotFoundError(
      `Failed to get content for path '${path}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
