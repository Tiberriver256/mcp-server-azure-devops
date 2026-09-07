/**
 * Shared test helper for reading MCP SDK text content blocks.
 *
 * The MCP SDK `content` array is a union (text | image | audio | resource …),
 * and the client types it as `unknown`, so `content[0].text` does not
 * typecheck. All tool handlers in this repo return a single text block, so
 * specs use this helper to narrow to text in one place instead of repeating
 * casts at every call site.
 */
export function getTextContent(content: unknown, index = 0): string {
  const block = (Array.isArray(content) ? content[index] : undefined) as
    | { type?: unknown; text?: unknown }
    | undefined;
  if (!block || block.type !== 'text' || typeof block.text !== 'string') {
    throw new Error(`Expected text content block at index ${index}`);
  }
  return block.text;
}
