export * from './schemas';
export * from './types';
export { searchCode } from './search-code/feature';
export { searchWiki } from './search-wiki/feature';
export { searchWorkItems } from './search-work-items/feature';

import { defineTool } from '../../shared/registry/tool-registry';
import type { FeatureModule } from '../../shared/registry/tool-registry';
import {
  SearchCodeSchema,
  SearchWikiSchema,
  SearchWorkItemsSchema,
} from './schemas';
import { searchCode } from './search-code/feature';
import { searchWiki } from './search-wiki/feature';
import { searchWorkItems } from './search-work-items/feature';

export const searchFeature: FeatureModule = {
  toolset: 'search',
  tools: [
    defineTool({
      name: 'search_code',
      description: 'Search for code across repositories in a project',
      schema: SearchCodeSchema,
      readOnly: true,
      handler: async (ctx, args) => {
        const connection = await ctx.getWebApi(args.organizationId);
        return await searchCode(connection, args, ctx);
      },
    }),
    defineTool({
      name: 'search_wiki',
      description: 'Search for content across wiki pages in a project',
      schema: SearchWikiSchema,
      readOnly: true,
      handler: (ctx, args) => searchWiki(ctx, args),
    }),
    defineTool({
      name: 'search_work_items',
      description: 'Search for work items across projects in Azure DevOps',
      schema: SearchWorkItemsSchema,
      readOnly: true,
      handler: (ctx, args) => searchWorkItems(ctx, args),
    }),
  ],
};
