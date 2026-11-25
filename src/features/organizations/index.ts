export * from './schemas.ts';
export * from './types.ts';
export { listOrganizations } from './list-organizations/feature.ts';

import { defineTool } from '../../shared/registry/tool-registry.ts';
import type { FeatureModule } from '../../shared/registry/tool-registry.ts';
import { ListOrganizationsSchema } from './schemas.ts';
import { listOrganizations } from './list-organizations/feature.ts';

export const organizationsFeature: FeatureModule = {
  toolset: 'organizations',
  tools: [
    defineTool({
      name: 'list_organizations',
      description:
        'List all Azure DevOps organizations accessible to the current authentication',
      schema: ListOrganizationsSchema,
      readOnly: true,
      handler: (ctx) => listOrganizations(ctx),
    }),
  ],
};
