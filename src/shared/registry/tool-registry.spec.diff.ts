import {
  ListToolsRequestSchema,
  ListToolsResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  createAzureDevOpsServer,
  getFeatureModules,
  getRegisteredToolRegistry,
} from '../../server';
import { AuthenticationMethod } from '../auth';
import { TOOLSET_NAMES } from '../config';
import { formatToolResult } from './tool-registry';

describe('tool-registry contract differential tests: Zod definitions vs MCP ListTools JSON Schema', () => {
  it('validates all 60 tools against MCP ListToolsResultSchema with zero leaked internals or sentinel defaults', async () => {
    const server = createAzureDevOpsServer({
      organizationUrl: 'https://dev.azure.com/contract-org',
      authMethod: AuthenticationMethod.PersonalAccessToken,
      personalAccessToken: 'test-pat',
    });

    const handlers = (
      server as unknown as {
        _requestHandlers: Map<
          string,
          (req: unknown, extra: unknown) => Promise<unknown>
        >;
      }
    )._requestHandlers;
    const listHandler = handlers.get(ListToolsRequestSchema.shape.method.value);
    expect(listHandler).toBeDefined();

    const rawResult = (await listHandler!(
      { method: 'tools/list', params: {} },
      {},
    )) as { tools: Array<Record<string, unknown>> };

    // 1. Validate against official MCP SDK ListToolsResultSchema
    const mcpResult = ListToolsResultSchema.parse(rawResult);
    expect(mcpResult.tools).toHaveLength(60);

    // 2. Build independent catalog from feature modules
    const modules = getFeatureModules();
    expect(modules.map((m) => m.toolset)).toEqual([...TOOLSET_NAMES]);

    const registeredRegistry = getRegisteredToolRegistry();
    const registeredList = TOOLSET_NAMES.flatMap(
      (ts) => registeredRegistry[ts],
    );
    expect(registeredList).toHaveLength(60);

    // 3. No duplicate tool names across all toolsets
    const names = registeredList.map((t) => t.name);
    expect(new Set(names).size).toBe(60);
    expect(mcpResult.tools.map((t) => t.name)).toEqual(names);

    // 4. Differentially verify every single tool's emitted MCP schema against its RegisteredTool metadata
    const SENTINEL_DEFAULTS = new Set([
      'no default project',
      'unknown-organization',
    ]);

    for (let i = 0; i < registeredList.length; i++) {
      const registered = registeredList[i];
      const rawTool = rawResult.tools[i];
      const def = registered.toDefinition();

      // No internal metadata leaked to wire payload
      expect(rawTool).not.toHaveProperty('readOnly');
      expect(rawTool).not.toHaveProperty('mcp_enabled');

      // Annotations agree strictly with readOnly flag
      expect(rawTool.annotations).toEqual({
        readOnlyHint: registered.readOnly,
      });
      expect(typeof registered.readOnly).toBe('boolean');

      // Description non-empty and matches definition
      expect(typeof def.description).toBe('string');
      expect(def.description.trim().length).toBeGreaterThan(0);
      expect(rawTool.description).toBe(def.description);

      // JSON Schema must be Draft-07 object schema (type: 'object')
      const schema = rawTool.inputSchema as Record<string, unknown>;
      expect(schema.type).toBe('object');
      expect(typeof schema.properties).toBe('object');

      // No property may advertise a sentinel default value
      const properties =
        (schema.properties as Record<string, Record<string, unknown>>) ?? {};
      for (const propSchema of Object.values(properties)) {
        if (typeof propSchema.default === 'string') {
          expect(SENTINEL_DEFAULTS.has(propSchema.default)).toBe(false);
        }
      }

      // Required keys (if any) must exist in properties and match Zod safeParse rejection of {}
      const required = Array.isArray(schema.required)
        ? (schema.required as string[])
        : [];
      const propKeys = Object.keys(
        (schema.properties as Record<string, unknown>) ?? {},
      );
      for (const reqKey of required) {
        expect(propKeys).toContain(reqKey);
      }

      if (required.length > 0) {
        expect(registered.schema.safeParse({}).success).toBe(false);
      }
    }
  });

  it('formatToolResult produces valid MCP text blocks for undefined and domain objects containing arbitrary content arrays', () => {
    expect(formatToolResult(undefined)).toEqual({
      content: [{ type: 'text', text: '' }],
    });

    const domainObject = { content: [{ foo: 1 }], id: 42 };
    const formatted = formatToolResult(domainObject);
    expect(formatted.content).toHaveLength(1);
    expect(formatted.content[0].type).toBe('text');
    expect(JSON.parse(formatted.content[0].text)).toEqual(domainObject);

    const emptyContentDomain = { content: [] };
    expect(
      JSON.parse(formatToolResult(emptyContentDomain).content[0].text),
    ).toEqual(emptyContentDomain);

    const validMcp = { content: [{ type: 'text' as const, text: 'ok' }] };
    expect(formatToolResult(validMcp)).toBe(validMcp);
  });
});
