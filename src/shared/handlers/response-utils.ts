/**
 * Wraps a value as a JSON-serialized MCP text response.
 */
export function jsonResponse(result: unknown): {
  content: Array<{ type: string; text: string }>;
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

/**
 * Wraps a plain string as an MCP text response.
 */
export function textResponse(text: string): {
  content: Array<{ type: string; text: string }>;
} {
  return {
    content: [{ type: 'text', text }],
  };
}
