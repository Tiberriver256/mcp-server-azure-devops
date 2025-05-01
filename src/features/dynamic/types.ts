import { ToolDefinition } from '../../shared/types/tool-definition';

/**
 * Represents a toolset that can be dynamically enabled/disabled
 */
export interface Toolset {
  name: string;
  description: string;
  tools: ToolDefinition[];
  enabled: boolean;
}

/**
 * Response format for list_available_toolsets
 */
export interface ToolsetInfo {
  name: string;
  description: string;
  can_enable: string;
  currently_enabled: string;
}

/**
 * Response format for get_toolset_tools
 */
export interface ToolsetToolInfo {
  name: string;
  description: string;
  can_enable: string;
  toolset: string;
}
