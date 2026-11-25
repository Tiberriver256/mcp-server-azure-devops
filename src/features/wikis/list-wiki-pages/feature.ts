import { AzureDevOpsError } from '../../../shared/errors';
import type { ToolContext } from '../../../shared/session/azure-devops-session';
import type { ListWikiPagesOptions } from '../schemas';
import { createWikiClient } from '../wiki-client';
import type { WikiPageSummary } from '../wiki-client';

export type { WikiPageSummary };

/**
 * List wiki pages from a wiki sorted by order then path.
 */
export async function listWikiPages(
  options: ListWikiPagesOptions,
  ctx?: ToolContext,
): Promise<WikiPageSummary[]> {
  const organizationId = options.organizationId ?? undefined;
  const projectId = ctx
    ? ctx.resolveProjectId(options.projectId ?? undefined)
    : (options.projectId ?? '');

  try {
    const client = createWikiClient(ctx, {
      organizationId,
      projectId,
    });

    const pages = await client.listWikiPages(projectId, options.wikiId);
    return pages.map((page) => ({
      id: page.id,
      path: page.path,
      url: page.url,
      order: page.order,
    }));
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new AzureDevOpsError(
      `Failed to list wiki pages: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
