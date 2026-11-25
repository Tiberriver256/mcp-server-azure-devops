export * from './schemas';
export * from './types';
export { getMe } from './get-me/feature';

import { defineTool } from '../../shared/registry/tool-registry';
import type { FeatureModule } from '../../shared/registry/tool-registry';
import { GetMeSchema } from './schemas';
import { getMe } from './get-me/feature';

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
