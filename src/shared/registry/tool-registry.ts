import type { z } from 'zod';
import type { ToolsetName } from '../config/tool-filter.ts';
import type {
  ToolAnnotations,
  ToolDefinition,
} from '../types/tool-definition.ts';
import type { ToolContext } from '../session/azure-devops-session.ts';
import { toJsonSchema } from '../utils/to-json-schema.ts';

export type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

export interface RegisteredTool {
  readonly name: string;
  readonly description: string;
  readonly schema: z.ZodType;
  readonly readOnly: boolean;
  readonly annotations: ToolAnnotations;
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

interface BaseToolSpec<TSchema extends z.ZodType> {
  name: string;
  description: string;
  schema: TSchema;
  title?: string;
  openWorld?: boolean;
  handler: (ctx: ToolContext, input: z.infer<TSchema>) => Promise<unknown>;
}

export interface ReadOnlyToolSpec<
  TSchema extends z.ZodType,
> extends BaseToolSpec<TSchema> {
  readOnly: true;
  destructive?: never;
  idempotent?: never;
}

export interface WriteToolSpec<
  TSchema extends z.ZodType,
> extends BaseToolSpec<TSchema> {
  readOnly: false;
  destructive: boolean;
  idempotent: boolean;
}

export type DefineToolSpec<TSchema extends z.ZodType> =
  | ReadOnlyToolSpec<TSchema>
  | WriteToolSpec<TSchema>;

const TITLE_ACRONYMS: Readonly<Record<string, string>> = {
  api: 'API',
  id: 'ID',
  ids: 'IDs',
  pr: 'PR',
  prs: 'PRs',
  url: 'URL',
  urls: 'URLs',
  wiql: 'WIQL',
};

/**
 * Convert a snake_case tool name into a crisp Title Case label.
 */
export function formatToolTitle(name: string): string {
  const formatted = name
    .split('_')
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const lower = segment.toLowerCase();
      return (
        TITLE_ACRONYMS[lower] ?? lower.charAt(0).toUpperCase() + lower.slice(1)
      );
    })
    .join(' ');
  return formatted || name;
}

function isTextContentBlock(
  item: unknown,
): item is { type: 'text'; text: string } {
  return (
    typeof item === 'object' &&
    item !== null &&
    'type' in item &&
    item.type === 'text' &&
    'text' in item &&
    typeof item.text === 'string'
  );
}

function isMcpToolResult(value: unknown): value is McpToolResult {
  if (typeof value !== 'object' || value === null || !('content' in value)) {
    return false;
  }
  if (!Array.isArray(value.content) || value.content.length === 0) {
    return false;
  }
  if (
    'isError' in value &&
    value.isError !== undefined &&
    typeof value.isError !== 'boolean'
  ) {
    return false;
  }
  return value.content.every(isTextContentBlock);
}

/**
 * Format any handler return value into a spec-compliant MCP tool result.
 * Strings are returned verbatim; undefined becomes ''; objects/arrays are pretty-printed JSON.
 */
export function formatToolResult(value: unknown): McpToolResult {
  if (isMcpToolResult(value)) {
    return value;
  }
  const text =
    value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : (JSON.stringify(value, null, 2) ?? '');
  return {
    content: [{ type: 'text', text }],
  };
}

/**
 * Declaratively define a single MCP tool binding metadata, Zod schema,
 * read-only classification, MCP ToolAnnotations, and typed handler in one place
 * so schemas, definitions, and dispatch can never drift.
 *
 * Compile-time Poka-yoke: write tools (`readOnly: false`) MUST explicitly
 * specify `destructive` and `idempotent`; read-only tools (`readOnly: true`)
 * automatically emit `{ readOnlyHint: true, destructiveHint: false, idempotentHint: true }`.
 *
 * JSON Schema conversion is deferred lazily until `toDefinition()` is called
 * (and cached), avoiding eager work for filtered-out tools.
 */
export function defineTool<TSchema extends z.ZodType>(
  spec: DefineToolSpec<TSchema>,
): RegisteredTool {
  let cachedDefinition: ToolDefinition | null = null;
  const annotations: ToolAnnotations = spec.readOnly
    ? {
        title: spec.title ?? formatToolTitle(spec.name),
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: spec.openWorld ?? true,
      }
    : {
        title: spec.title ?? formatToolTitle(spec.name),
        readOnlyHint: false,
        destructiveHint: spec.destructive,
        idempotentHint: spec.idempotent,
        openWorldHint: spec.openWorld ?? true,
      };

  return {
    name: spec.name,
    description: spec.description,
    schema: spec.schema,
    readOnly: spec.readOnly,
    annotations,
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
          annotations,
        };
      }
      return cachedDefinition;
    },
  };
}
