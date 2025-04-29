import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import { ListOrganizationsSchema } from './schemas';

/**
 * List of organizations tools
 */
export const organizationsTools: ToolDefinition[] = [
  {
    name: 'list_organizations',
    description:
      'List all Azure DevOps organizations accessible to the current authentication',
    inputSchema: zodToJsonSchema(ListOrganizationsSchema),
  },
];
