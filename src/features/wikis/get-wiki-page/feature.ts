import { AzureDevOpsError } from '../../../shared/errors/index.ts';
import type { ToolContext } from '../../../shared/session/azure-devops-session.ts';
import { createWikiClient } from '../wiki-client.ts';

export interface GetWikiPageOptions {
  organizationId?: string;
  projectId?: string;
  wikiId: string;
  pagePath: string;
}

/**
 * Get a wiki page's content as plain text.
 */
export async function getWikiPage(
  options: GetWikiPageOptions,
  ctx?: ToolContext,
): Promise<string> {
  const { organizationId, wikiId, pagePath } = options;
  const projectId = ctx
    ? ctx.resolveProjectId(options.projectId)
    : (options.projectId ?? '');

  try {
    const client = createWikiClient(ctx, {
      organizationId,
      projectId,
    });

    return (await client.getPage(projectId, wikiId, pagePath)).content;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new AzureDevOpsError(
      `Failed to get wiki page: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
