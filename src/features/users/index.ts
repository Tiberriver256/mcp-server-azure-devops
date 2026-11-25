export * from './schemas.ts';
export * from './types.ts';
export { getMe } from './get-me/feature.ts';

import { defineTool } from '../../shared/registry/tool-registry.ts';
import type { FeatureModule } from '../../shared/registry/tool-registry.ts';
import { GetMeSchema } from './schemas.ts';
import { getMe } from './get-me/feature.ts';

export const usersFeature: FeatureModule = {
  toolset: 'users',
  tools: [
    defineTool({
      name: 'get_me',
      description:
        'Get details of the authenticated user (id, displayName, email)',
      schema: GetMeSchema,
      readOnly: true,
      handler: (ctx) => getMe(ctx),
    }),
  ],
};
