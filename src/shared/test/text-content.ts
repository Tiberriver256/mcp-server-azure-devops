/**
 * Shared unit-test helper for reading MCP SDK text content blocks.
 *
 * The MCP SDK `content` array is a union (text | image | audio | resource …),
 * so `content[0].text` does not typecheck. All tool handlers in this repo
 * return a single text block, so specs use this helper to narrow to text in
 * one place instead of repeating casts at every call site.
 */
export function getTextContent(
  content: ReadonlyArray<{ type: string }> | undefined,
  index = 0,
): string {
  const block = content?.[index] as
    | { type: string; text?: unknown }
    | undefined;
  if (!block || typeof block.text !== 'string') {
    throw new Error(`Expected text content block at index ${index}`);
  }
  return block.text;
}
