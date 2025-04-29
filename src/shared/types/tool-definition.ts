/**
 * Represents a tool that can be listed in the ListTools response
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}
