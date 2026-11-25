import type { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsError,
  AzureDevOpsValidationError,
} from '../../../shared/errors/index.ts';
import { createSessionFromEnv } from '../../../shared/session/azure-devops-session.ts';
import type { ToolContext } from '../../../shared/session/azure-devops-session.ts';
import { WikiType } from '../schemas.ts';
import { createWikiClient } from '../wiki-client.ts';

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
  connectionOrContext: WebApi | ToolContext,
  options: CreateWikiOptions,
) {
  try {
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

    const session =
      'requestAzureDevOps' in connectionOrContext
        ? connectionOrContext
        : createSessionFromEnv({
            organizationUrl: connectionOrContext.serverUrl,
            defaultProject: options.projectId,
          });

    const projectId = session.resolveOptionalProjectId(options.projectId);
    if (!projectId) {
      throw new AzureDevOpsValidationError('Project ID is required');
    }

    const wikiClient = createWikiClient(session, {
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
