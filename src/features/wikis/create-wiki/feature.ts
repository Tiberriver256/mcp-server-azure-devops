import type { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsError,
  AzureDevOpsValidationError,
} from '../../../shared/errors';
import type { ToolContext } from '../../../shared/session/azure-devops-session';
import { WikiType } from '../schemas';
import { createWikiClient } from '../wiki-client';

export interface CreateWikiOptions {
  organizationId?: string;
  projectId?: string;
  name: string;
  type?: WikiType;
  repositoryId?: string;
  mappedPath?: string;
}

/**
 * Create a new wiki in Azure DevOps.
 */
export async function createWiki(
  _connectionOrContext: WebApi | ToolContext,
  options: CreateWikiOptions,
) {
  try {
    const ctx =
      'requestAzureDevOps' in _connectionOrContext
        ? _connectionOrContext
        : undefined;
    const {
      name,
      type = WikiType.ProjectWiki,
      repositoryId,
      mappedPath = '/',
    } = options;

    if (type === WikiType.CodeWiki && !repositoryId) {
      throw new AzureDevOpsValidationError(
        'Repository ID is required for code wikis',
      );
    }

    const projectId = ctx
      ? ctx.resolveProjectId(options.projectId)
      : options.projectId;
    if (!projectId) {
      throw new AzureDevOpsValidationError('Project ID is required');
    }

    const wikiClient = createWikiClient(ctx, {
      organizationId: options.organizationId,
      projectId,
    });

    return await wikiClient.createWiki(projectId, {
      name,
      projectId,
      type,
      ...(type === WikiType.CodeWiki && {
        repositoryId,
        mappedPath,
        version: {
          version: 'main',
          versionType: 'branch' as const,
        },
      }),
    });
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    throw new AzureDevOpsError(
      `Failed to create wiki: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
