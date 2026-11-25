export * from './schemas.ts';
export * from './wiki-client.ts';
export { getWikis } from './get-wikis/feature.ts';
export { getWikiPage } from './get-wiki-page/feature.ts';
export { createWiki } from './create-wiki/feature.ts';
export { updateWikiPage } from './update-wiki-page/feature.ts';
export { listWikiPages } from './list-wiki-pages/feature.ts';
export { createWikiPage } from './create-wiki-page/feature.ts';

import { defineTool } from '../../shared/registry/tool-registry.ts';
import type { FeatureModule } from '../../shared/registry/tool-registry.ts';
import {
  CreateWikiPageSchema,
  CreateWikiSchema,
  GetWikiPageSchema,
  GetWikisSchema,
  ListWikiPagesSchema,
  UpdateWikiPageSchema,
} from './schemas.ts';
import { getWikis } from './get-wikis/feature.ts';
import { getWikiPage } from './get-wiki-page/feature.ts';
import { createWiki } from './create-wiki/feature.ts';
import { updateWikiPage } from './update-wiki-page/feature.ts';
import { listWikiPages } from './list-wiki-pages/feature.ts';
import { createWikiPage } from './create-wiki-page/feature.ts';

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
