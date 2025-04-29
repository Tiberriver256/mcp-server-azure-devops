import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import { GetMeSchema } from './schemas';

/**
 * List of users tools
 */
export const usersTools: ToolDefinition[] = [
  {
    name: 'get_me',
    description:
      'Get details of the authenticated user (id, displayName, email)',
    inputSchema: zodToJsonSchema(GetMeSchema),
  },
];
