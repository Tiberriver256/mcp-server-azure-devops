import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import {
  EnableToolsetSchema,
  GetToolsetToolsSchema,
  ListAvailableToolsetsSchema,
} from './schemas';

/**
 * List of dynamic toolset management tools
 */
export const dynamicTools: ToolDefinition[] = [
  {
    name: 'list_available_toolsets',
    description:
      'List all available groups of tools (toolsets) and their status.',
    inputSchema: zodToJsonSchema(ListAvailableToolsetsSchema),
  },
  {
    name: 'get_toolset_tools',
    description: 'List the specific tools available within a given toolset.',
    inputSchema: zodToJsonSchema(GetToolsetToolsSchema),
  },
  {
    name: 'enable_toolset',
    description:
      'Enables a specific toolset, making its tools available for use.',
    inputSchema: zodToJsonSchema(EnableToolsetSchema),
  },
];
