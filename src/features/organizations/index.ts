export * from './schemas';
export * from './types';
export { listOrganizations } from './list-organizations/feature';

import { defineTool } from '../../shared/registry/tool-registry';
import type { FeatureModule } from '../../shared/registry/tool-registry';
import { ListOrganizationsSchema } from './schemas';
import { listOrganizations } from './list-organizations/feature';

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
