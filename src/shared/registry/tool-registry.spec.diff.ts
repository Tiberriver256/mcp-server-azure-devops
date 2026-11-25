import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ListToolsRequestSchema,
  ListToolsResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  createAzureDevOpsServer,
  getFeatureModules,
  getRegisteredToolRegistry,
} from '../../server.ts';
import { AuthenticationMethod } from '../auth/index.ts';
import { TOOLSET_NAMES } from '../config/index.ts';
import { formatToolResult } from './tool-registry.ts';

void describe('tool-registry contract differential tests: Zod definitions vs MCP ListTools JSON Schema', () => {
  void it('validates all 60 tools against MCP ListToolsResultSchema with zero leaked internals or sentinel defaults', async () => {
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
    assert.ok(listHandler !== undefined);

    const rawResult = (await listHandler(
      { method: 'tools/list', params: {} },
      {},
    )) as { tools: Array<Record<string, unknown>> };

    // 1. Validate against official MCP SDK ListToolsResultSchema
    const mcpResult = ListToolsResultSchema.parse(rawResult);
    assert.strictEqual(mcpResult.tools.length, 60);

    // 2. Build independent catalog from feature modules
    const modules = getFeatureModules();
    assert.deepStrictEqual(
      modules.map((m) => m.toolset),
      [...TOOLSET_NAMES],
    );

    const registeredRegistry = getRegisteredToolRegistry();
    const registeredList = TOOLSET_NAMES.flatMap(
      (ts) => registeredRegistry[ts],
    );
    assert.strictEqual(registeredList.length, 60);

    // 3. No duplicate tool names across all toolsets
    const names = registeredList.map((t) => t.name);
    assert.strictEqual(new Set(names).size, 60);
    assert.deepStrictEqual(
      mcpResult.tools.map((t) => t.name),
      names,
    );

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
      assert.strictEqual(Object.hasOwn(rawTool, 'readOnly'), false);
      assert.strictEqual(Object.hasOwn(rawTool, 'mcp_enabled'), false);

      // Annotations agree strictly with readOnly flag
      assert.deepStrictEqual(rawTool.annotations, {
        readOnlyHint: registered.readOnly,
      });
      assert.strictEqual(typeof registered.readOnly, 'boolean');

      // Description non-empty and matches definition
      assert.strictEqual(typeof def.description, 'string');
      assert.ok(def.description.trim().length > 0);
      assert.strictEqual(rawTool.description, def.description);

      // JSON Schema must be Draft-07 object schema (type: 'object')
      const schema = rawTool.inputSchema as Record<string, unknown>;
      assert.strictEqual(schema.type, 'object');
      assert.strictEqual(typeof schema.properties, 'object');

      // No property may advertise a sentinel default value
      const properties =
        (schema.properties as Record<string, Record<string, unknown>>) ?? {};
      for (const propSchema of Object.values(properties)) {
        if (typeof propSchema.default === 'string') {
          assert.strictEqual(SENTINEL_DEFAULTS.has(propSchema.default), false);
        }
      }

      // Required keys (if any) must exist in properties and match Zod safeParse rejection of {}
      const required = Array.isArray(schema.required)
        ? (schema.required as string[])
        : [];
      const propKeys = new Set(
        Object.keys((schema.properties as Record<string, unknown>) ?? {}),
      );
      for (const reqKey of required) {
        assert.ok(propKeys.has(reqKey));
      }

      if (required.length > 0) {
        assert.strictEqual(registered.schema.safeParse({}).success, false);
      }
    }
  });

  void it('formatToolResult produces valid MCP text blocks for undefined and domain objects containing arbitrary content arrays', () => {
    assert.deepStrictEqual(formatToolResult(undefined), {
      content: [{ type: 'text', text: '' }],
    });

    const domainObject = { content: [{ foo: 1 }], id: 42 };
    const formatted = formatToolResult(domainObject);
    assert.strictEqual(formatted.content.length, 1);
    assert.strictEqual(formatted.content[0].type, 'text');
    assert.deepStrictEqual(JSON.parse(formatted.content[0].text), domainObject);

    const emptyContentDomain = { content: [] };
    assert.deepStrictEqual(
      JSON.parse(formatToolResult(emptyContentDomain).content[0].text),
      emptyContentDomain,
    );

    const validMcp = { content: [{ type: 'text' as const, text: 'ok' }] };
    assert.strictEqual(formatToolResult(validMcp), validMcp);
  });
});
