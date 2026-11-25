import { z } from 'zod';

/**
 * Convert a Zod schema to JSON Schema draft-07 for MCP tool input definitions.
 * Uses `io: 'input'` so optional fields with `.default(...)` remain optional
 * in the advertised `inputSchema.required` array.
 */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, {
    target: 'draft-07',
    io: 'input',
  }) as Record<string, unknown>;
}
