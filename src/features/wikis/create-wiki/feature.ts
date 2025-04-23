import { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsError,
  AzureDevOpsValidationError,
} from '../../../shared/errors';
import { WikiType } from './schema';
import { getWikiClient } from '../../../clients/azure-devops';

/**
 * Options for creating a wiki
 */
export interface CreateWikiOptions {
  /**
   * The ID or name of the organization
   * If not provided, the default organization will be used
   */
  organizationId?: string;

  /**
   * The ID or name of the project
   * If not provided, the default project will be used
   */
  projectId?: string;

  /**
   * The name of the new wiki
   */
  name: string;

  /**
   * Type of wiki to create (projectWiki or codeWiki)
   * Default is projectWiki
   */
  type?: WikiType;

  /**
   * The ID of the repository to associate with the wiki
   * Required when type is codeWiki
   */
  repositoryId?: string;

  /**
   * Folder path inside repository which is shown as Wiki
   * Only applicable for codeWiki type
   * Default is '/'
   */
  mappedPath?: string;
}

/**
 * Create a new wiki in Azure DevOps
 *
 * @param _connection The Azure DevOps WebApi connection (deprecated, kept for backward compatibility)
 * @param options Options for creating a wiki
 * @returns The created wiki
 * @throws {AzureDevOpsValidationError} When required parameters are missing
 * @throws {AzureDevOpsResourceNotFoundError} When the project or repository is not found
 * @throws {AzureDevOpsPermissionError} When the user does not have permission to create a wiki
 * @throws {AzureDevOpsError} When an error occurs while creating the wiki
 */
export async function createWiki(
  _connection: WebApi,
  options: CreateWikiOptions,
) {
  try {
    const {
      name,
      projectId,
      type = WikiType.ProjectWiki,
      repositoryId,
      mappedPath = '/',
    } = options;

    // Validate repository ID for code wiki
    if (type === WikiType.CodeWiki && !repositoryId) {
      throw new AzureDevOpsValidationError(
        'Repository ID is required for code wikis',
      );
    }

    // Get the Wiki client
    const wikiClient = await getWikiClient({
      organizationId: options.organizationId,
    });

    // Prepare the wiki creation parameters
    const wikiCreateParams = {
      name,
      projectId: projectId!,
      type,
      ...(type === WikiType.CodeWiki && {
        repositoryId,
        mappedPath,
        version: {
          version: 'main',
          versionType: 'branch' as const,
        },
      }),
    };

    // Create the wiki
    return await wikiClient.createWiki(projectId!, wikiCreateParams);
  } catch (error) {
    // Just rethrow if it's already one of our error types
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    // Otherwise wrap in AzureDevOpsError
    throw new AzureDevOpsError(
      `Failed to create wiki: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
