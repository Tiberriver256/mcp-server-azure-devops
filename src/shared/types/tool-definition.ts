/**
 * Represents a tool that can be listed in the ListTools response
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /**
   * Whether this tool is read-only (does not mutate Azure DevOps state).
   * Tools without `readOnly: true` are treated as write-capable (fail-closed)
   * and excluded when read-only mode is enabled.
   */
  readOnly: boolean;
}
