import { JsonSchema7Type } from 'zod-to-json-schema';

/**
 * Represents a tool that can be listed in the ListTools response
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema7Type;
  mcp_enabled?: boolean;
}
