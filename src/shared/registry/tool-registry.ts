import type { z } from 'zod';
import type { ToolsetName } from '../config/tool-filter';
import type { ToolDefinition } from '../types/tool-definition';
import type { ToolContext } from '../session/azure-devops-session';
import { toJsonSchema } from '../utils/to-json-schema';

export type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

export interface RegisteredTool {
  readonly name: string;
  readonly description: string;
  readonly schema: z.ZodType;
  readonly readOnly: boolean;
  readonly execute: (
    ctx: ToolContext,
    rawArgs: unknown,
  ) => Promise<McpToolResult>;
  toDefinition(): ToolDefinition;
}

export interface FeatureModule {
  readonly toolset: ToolsetName;
  readonly tools: readonly RegisteredTool[];
}

function isMcpToolResult(value: unknown): value is McpToolResult {
  if (typeof value !== 'object' || value === null || !('content' in value)) {
    return false;
  }
  return Array.isArray(value.content);
}

/**
 * Format any handler return value into a spec-compliant MCP tool result.
 * Strings are returned verbatim; objects/arrays are pretty-printed JSON.
 */
export function formatToolResult(value: unknown): McpToolResult {
  if (isMcpToolResult(value)) {
    return value;
  }
  const text =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return {
    content: [{ type: 'text', text }],
  };
}

/**
 * Declaratively define a single MCP tool binding metadata, Zod schema,
 * read-only classification, and typed handler in one place so schemas,
 * definitions, and dispatch can never drift.
 *
 * JSON Schema conversion is deferred lazily until `toDefinition()` is called
 * (and cached), avoiding eager work for filtered-out tools.
 */
export function defineTool<TSchema extends z.ZodType>(spec: {
  name: string;
  description: string;
  schema: TSchema;
  readOnly: boolean;
  handler: (ctx: ToolContext, input: z.infer<TSchema>) => Promise<unknown>;
}): RegisteredTool {
  let cachedDefinition: ToolDefinition | null = null;

  return {
    name: spec.name,
    description: spec.description,
    schema: spec.schema,
    readOnly: spec.readOnly,
    async execute(ctx: ToolContext, rawArgs: unknown): Promise<McpToolResult> {
      const parsed = spec.schema.parse(rawArgs ?? {});
      const result = await spec.handler(ctx, parsed);
      return formatToolResult(result);
    },
    toDefinition(): ToolDefinition {
      if (!cachedDefinition) {
        cachedDefinition = {
          name: spec.name,
          description: spec.description,
          inputSchema: toJsonSchema(spec.schema),
          readOnly: spec.readOnly,
        };
      }
      return cachedDefinition;
    },
  };
}
