export * from './schemas';
export * from './wiki-client';
export { getWikis } from './get-wikis/feature';
export { getWikiPage } from './get-wiki-page/feature';
export { createWiki } from './create-wiki/feature';
export { updateWikiPage } from './update-wiki-page/feature';
export { listWikiPages } from './list-wiki-pages/feature';
export { createWikiPage } from './create-wiki-page/feature';

import { defineTool } from '../../shared/registry/tool-registry';
import type { FeatureModule } from '../../shared/registry/tool-registry';
import {
  CreateWikiPageSchema,
  CreateWikiSchema,
  GetWikiPageSchema,
  GetWikisSchema,
  ListWikiPagesSchema,
  UpdateWikiPageSchema,
} from './schemas';
import { getWikis } from './get-wikis/feature';
import { getWikiPage } from './get-wiki-page/feature';
import { createWiki } from './create-wiki/feature';
import { updateWikiPage } from './update-wiki-page/feature';
import { listWikiPages } from './list-wiki-pages/feature';
import { createWikiPage } from './create-wiki-page/feature';

export const wikisFeature: FeatureModule = {
  toolset: 'wikis',
  tools: [
    defineTool({
      name: 'get_wikis',
      description: 'Get details of wikis in a project',
      schema: GetWikisSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const orgId = args.organizationId ?? undefined;
        const connection = await ctx.getWebApi(orgId);
        return await getWikis(connection, {
          organizationId: orgId,
          projectId: ctx.resolveOptionalProjectId(args.projectId ?? undefined),
        });
      },
    }),
    defineTool({
      name: 'get_wiki_page',
      description: 'Get the content of a wiki page',
      schema: GetWikiPageSchema,
      readOnly: true,
      handler: (ctx, args) =>
        getWikiPage(
          {
            organizationId: args.organizationId ?? undefined,
            projectId: args.projectId ?? undefined,
            wikiId: args.wikiId,
            pagePath: args.pagePath,
          },
          ctx,
        ),
    }),
    defineTool({
      name: 'create_wiki',
      description: 'Create a new wiki in the project',
      schema: CreateWikiSchema,
      readOnly: false,
      handler: (ctx, args) =>
        createWiki(ctx, {
          organizationId: args.organizationId ?? undefined,
          projectId: args.projectId ?? undefined,
          name: args.name,
          type: args.type,
          repositoryId: args.repositoryId ?? undefined,
          mappedPath: args.mappedPath ?? undefined,
        }),
    }),
    defineTool({
      name: 'update_wiki_page',
      description: 'Update content of a wiki page',
      schema: UpdateWikiPageSchema,
      readOnly: false,
      handler: (ctx, args) => updateWikiPage(args, ctx),
    }),
    defineTool({
      name: 'list_wiki_pages',
      description: 'List pages within an Azure DevOps wiki',
      schema: ListWikiPagesSchema,
      readOnly: true,
      handler: (ctx, args) => listWikiPages(args, ctx),
    }),
    defineTool({
      name: 'create_wiki_page',
      description:
        'Create a new page in a wiki. If the page already exists at the specified path, it will be updated.',
      schema: CreateWikiPageSchema,
      readOnly: false,
      handler: (ctx, args) => createWikiPage(args, ctx),
    }),
  ],
};
