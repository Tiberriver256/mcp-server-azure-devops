import type { z } from 'zod';
import { handleRequestError } from '../../../shared/errors/index.ts';
import type { ToolContext } from '../../../shared/session/azure-devops-session.ts';
import type { CreateWikiPageSchema } from '../schemas.ts';
import { createWikiClient } from '../wiki-client.ts';

/**
 * Creates a new wiki page in Azure DevOps (or updates it if it already exists).
 */
export const createWikiPage = async (
  params: z.infer<typeof CreateWikiPageSchema>,
  ctx?: ToolContext,
) => {
  try {
    const organizationId = params.organizationId ?? undefined;
    const projectId = ctx
      ? ctx.resolveProjectId(params.projectId ?? undefined)
      : (params.projectId ?? '');

    const wikiClient = createWikiClient(ctx, {
      organizationId,
      projectId,
    });

    return await wikiClient.updatePage(
      { content: params.content },
      projectId,
      params.wikiId,
      params.pagePath ?? '/',
      {
        comment: params.comment ?? undefined,
      },
    );
  } catch (error: unknown) {
    handleRequestError(error, 'creating or updating wiki page');
  }
};
