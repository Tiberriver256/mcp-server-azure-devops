import type { z } from 'zod';
import type { ToolContext } from '../../../shared/session/azure-devops-session';
import { UpdateWikiPageSchema } from '../schemas';
import { createWikiClient } from '../wiki-client';

export type UpdateWikiPageOptions = z.infer<typeof UpdateWikiPageSchema>;

/**
 * Updates a wiki page in Azure DevOps.
 */
export async function updateWikiPage(
  options: UpdateWikiPageOptions,
  ctx?: ToolContext,
) {
  const validated = UpdateWikiPageSchema.parse(options);
  const organizationId = validated.organizationId ?? undefined;
  const projectId = ctx
    ? ctx.resolveProjectId(validated.projectId ?? undefined)
    : (validated.projectId ?? '');

  const client = createWikiClient(ctx, {
    organizationId,
    projectId,
  });

  return await client.updatePage(
    { content: validated.content },
    projectId,
    validated.wikiId,
    validated.pagePath,
    {
      comment: validated.comment ?? undefined,
    },
  );
}
