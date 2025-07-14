import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import {
  RequestHandler,
  RequestIdentifier,
} from '../../shared/types/request-handler';
import { ToolDefinition } from '../../shared/types/tool-definition';
import {
  EnableToolsetSchema,
  GetToolsetToolsSchema,
  ListAvailableToolsetsSchema,
} from './schemas';
import { dynamicTools } from './tool-definitions';
import { ToolsetInfo, ToolsetToolInfo } from './types';

// Re-export tools
export * from './tool-definitions';

// Export types and schemas
export * from './schemas';
export * from './types';

// Map to store toolset definitions
export const toolsets = new Map<
  string,
  { description: string; tools: ToolDefinition[]; enabled: boolean }
>();

// Initialize toolsets
export function initializeToolsets(allTools: {
  [key: string]: ToolDefinition[];
}) {
  // Clear existing toolsets
  toolsets.clear();

  // Add each toolset
  Object.entries(allTools).forEach(([name, tools]) => {
    if (name !== 'dynamic') {
      toolsets.set(name, {
        description: `${name} related tools`,
        tools,
        enabled: false,
      });
    }
  });

  // Dynamic toolset is always enabled
  toolsets.set('dynamic', {
    description: 'Tools for discovering and enabling other tools',
    tools: dynamicTools,
    enabled: true,
  });
}

/**
 * Checks if the request is for the dynamic toolset feature
 */
export const isDynamicRequest: RequestIdentifier = (
  request: CallToolRequest,
): boolean => {
  const toolName = request.params.name;
  return [
    'list_available_toolsets',
    'get_toolset_tools',
    'enable_toolset',
  ].includes(toolName);
};

/**
 * Handles dynamic toolset feature requests
 */
export const handleDynamicRequest: RequestHandler = async (
  _connection: WebApi,
  request: CallToolRequest,
): Promise<{ content: Array<{ type: string; text: string }> }> => {
  switch (request.params.name) {
    case 'list_available_toolsets': {
      ListAvailableToolsetsSchema.parse(request.params.arguments);
      const toolsetInfos: ToolsetInfo[] = Array.from(toolsets.entries()).map(
        ([name, ts]) => ({
          name,
          description: ts.description,
          can_enable: 'true',
          currently_enabled: String(ts.enabled),
        }),
      );
      return {
        content: [
          { type: 'text', text: JSON.stringify(toolsetInfos, null, 2) },
        ],
      };
    }

    case 'get_toolset_tools': {
      const args = GetToolsetToolsSchema.parse(request.params.arguments);
      const toolset = toolsets.get(args.toolset);
      if (!toolset) {
        throw new Error(`Toolset ${args.toolset} not found`);
      }

      const toolInfos: ToolsetToolInfo[] = toolset.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        can_enable: 'true',
        toolset: args.toolset,
      }));

      return {
        content: [{ type: 'text', text: JSON.stringify(toolInfos, null, 2) }],
      };
    }

    case 'enable_toolset': {
      const args = EnableToolsetSchema.parse(request.params.arguments);
      const toolset = toolsets.get(args.toolset);
      if (!toolset) {
        throw new Error(`Toolset ${args.toolset} not found`);
      }

      if (toolset.enabled) {
        return {
          content: [
            {
              type: 'text',
              text: `Toolset ${args.toolset} is already enabled`,
            },
          ],
        };
      }

      // Enable the toolset
      toolset.enabled = true;
      let enabledCount = 0;
      for (const tool of toolset.tools) {
        if ('enable' in tool) {
          (tool as { enable: () => void }).enable();
          enabledCount++;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: `Toolset ${args.toolset} enabled (${enabledCount} tools)`,
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown dynamic tool: ${request.params.name}`);
  }
};
