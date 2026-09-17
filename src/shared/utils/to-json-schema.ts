import { z } from 'zod';

/**
 * Convert a Zod schema to JSON Schema draft-07 for MCP tool definitions.
 * Replaces zod-to-json-schema after the Zod 4 upgrade.
 */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: 'draft-07' }) as Record<
    string,
    unknown
  >;
}
