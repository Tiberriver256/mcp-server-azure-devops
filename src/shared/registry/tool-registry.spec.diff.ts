import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
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
import {
  defineTool,
  formatToolResult,
  formatToolTitle,
} from './tool-registry.ts';

const EXPECTED_ANNOTATION_KEYS = [
  'destructiveHint',
  'idempotentHint',
  'openWorldHint',
  'readOnlyHint',
  'title',
];

void describe('tool-registry contract differential tests: Zod definitions vs MCP ListTools JSON Schema', () => {
  void it('validates all 75 tools against MCP ListToolsResultSchema with full annotations, invariants, and zero leaked internals', async () => {
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
    assert.strictEqual(mcpResult.tools.length, 75);

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
    assert.strictEqual(registeredList.length, 75);

    // 3. No duplicate tool names across all toolsets
    const names = registeredList.map((t) => t.name);
    assert.strictEqual(new Set(names).size, 75);
    assert.deepStrictEqual(
      mcpResult.tools.map((t) => t.name),
      names,
    );

    // 4. Differentially verify every single tool's emitted MCP schema and ToolAnnotations
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

      // Full 5-field MCP ToolAnnotations on RegisteredTool and ToolDefinition
      assert.deepStrictEqual(def.annotations, registered.annotations);
      assert.deepStrictEqual(
        Object.keys(def.annotations).sort(),
        EXPECTED_ANNOTATION_KEYS,
      );
      assert.strictEqual(typeof def.annotations.title, 'string');
      assert.ok(def.annotations.title.trim().length > 0);
      assert.strictEqual(typeof def.annotations.readOnlyHint, 'boolean');
      assert.strictEqual(typeof def.annotations.destructiveHint, 'boolean');
      assert.strictEqual(typeof def.annotations.idempotentHint, 'boolean');
      assert.strictEqual(typeof def.annotations.openWorldHint, 'boolean');
      assert.strictEqual(typeof registered.readOnly, 'boolean');
      assert.strictEqual(def.annotations.readOnlyHint, registered.readOnly);

      // Read-only invariant: readOnlyHint === true => destructiveHint === false && idempotentHint === true
      if (def.annotations.readOnlyHint) {
        assert.strictEqual(def.annotations.destructiveHint, false);
        assert.strictEqual(def.annotations.idempotentHint, true);
      }

      // Wire annotations must match full ToolAnnotations unconditionally
      const wireAnnotations = rawTool.annotations as Record<string, unknown>;
      assert.deepStrictEqual(wireAnnotations, def.annotations);

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

  void it('classifies get_work_item_attachment as a destructive write tool and enforces expected write hint matrix', () => {
    const registeredRegistry = getRegisteredToolRegistry();
    const byName = new Map(
      TOOLSET_NAMES.flatMap((ts) => registeredRegistry[ts]).map((tool) => [
        tool.name,
        tool,
      ]),
    );

    const attachmentTool = byName.get('get_work_item_attachment');
    assert.ok(attachmentTool !== undefined);
    assert.strictEqual(attachmentTool.readOnly, false);
    assert.deepStrictEqual(attachmentTool.annotations, {
      title: 'Get Work Item Attachment',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    });

    const expectedWriteHints: Record<
      string,
      { destructiveHint: boolean; idempotentHint: boolean }
    > = {
      // Additive non-destructive
      create_work_item: { destructiveHint: false, idempotentHint: false },
      add_work_item_comment: { destructiveHint: false, idempotentHint: false },
      create_work_item_attachment: {
        destructiveHint: false,
        idempotentHint: false,
      },
      create_pull_request: { destructiveHint: false, idempotentHint: false },
      add_pull_request_comment: {
        destructiveHint: false,
        idempotentHint: false,
      },
      create_branch: { destructiveHint: false, idempotentHint: false },
      create_wiki: { destructiveHint: false, idempotentHint: false },
      create_wiki_page: { destructiveHint: true, idempotentHint: true },
      create_test_plan: { destructiveHint: false, idempotentHint: false },
      create_test_suite: { destructiveHint: false, idempotentHint: false },
      create_test_case: { destructiveHint: false, idempotentHint: false },
      // Idempotent non-destructive
      vote_pull_request: { destructiveHint: false, idempotentHint: true },
      update_pull_request_thread_status: {
        destructiveHint: false,
        idempotentHint: true,
      },
      add_test_cases_to_suite: {
        destructiveHint: false,
        idempotentHint: true,
      },
      // Destructive
      create_commit: { destructiveHint: true, idempotentHint: false },
      update_work_item: { destructiveHint: true, idempotentHint: true },
      manage_work_item_link: { destructiveHint: true, idempotentHint: true },
      delete_work_item_attachment: {
        destructiveHint: true,
        idempotentHint: true,
      },
      get_work_item_attachment: { destructiveHint: true, idempotentHint: true },
      merge_pull_request: { destructiveHint: true, idempotentHint: false },
      update_pull_request: { destructiveHint: true, idempotentHint: true },
      manage_pull_request_reviewers: {
        destructiveHint: true,
        idempotentHint: true,
      },
      trigger_pipeline: { destructiveHint: true, idempotentHint: false },
      retry_pipeline_stage: { destructiveHint: true, idempotentHint: false },
      update_wiki_page: { destructiveHint: true, idempotentHint: true },
      remove_test_cases_from_suite: {
        destructiveHint: true,
        idempotentHint: true,
      },
    };

    const actualWriteTools = [...byName.values()].filter((t) => !t.readOnly);
    assert.strictEqual(
      actualWriteTools.length,
      Object.keys(expectedWriteHints).length,
    );

    for (const tool of actualWriteTools) {
      const expected = expectedWriteHints[tool.name];
      assert.ok(expected !== undefined, `Unexpected write tool: ${tool.name}`);
      assert.strictEqual(tool.annotations.readOnlyHint, false);
      assert.strictEqual(
        tool.annotations.destructiveHint,
        expected.destructiveHint,
        `${tool.name} destructiveHint mismatch`,
      );
      assert.strictEqual(
        tool.annotations.idempotentHint,
        expected.idempotentHint,
        `${tool.name} idempotentHint mismatch`,
      );
    }
  });

  void it('keeps create_commit description and schema strictly within token/byte budgets without duplicated tutorials', () => {
    const repoTools = getRegisteredToolRegistry().repositories;
    const createCommitTool = repoTools.find((t) => t.name === 'create_commit');
    assert.ok(createCommitTool !== undefined);

    const def = createCommitTool.toDefinition();
    const descBytes = Buffer.byteLength(def.description, 'utf8');
    const schemaDesc = def.inputSchema.description;
    const schemaDescBytes =
      typeof schemaDesc === 'string'
        ? Buffer.byteLength(schemaDesc, 'utf8')
        : 0;
    const totalBytes = Buffer.byteLength(JSON.stringify(def), 'utf8');

    assert.ok(
      descBytes < 1200,
      `create_commit description too large: ${descBytes} bytes`,
    );
    assert.strictEqual(
      schemaDesc,
      undefined,
      'CreateCommitSchema outer description must be omitted to prevent duplication',
    );
    assert.strictEqual(def.description.includes('Option 1'), false);
    assert.ok(
      descBytes + schemaDescBytes < 1500,
      `create_commit combined descriptions too large: ${descBytes + schemaDescBytes} bytes`,
    );
    assert.ok(
      totalBytes < 4200,
      `create_commit serialized ToolDefinition too large: ${totalBytes} bytes`,
    );
  });

  void it('formatToolTitle and defineTool produce crisp titles and support explicit overrides', () => {
    assert.strictEqual(formatToolTitle('get_work_item'), 'Get Work Item');
    assert.strictEqual(formatToolTitle('get_pr_url_by_id'), 'Get PR URL By ID');
    assert.strictEqual(formatToolTitle('run_wiql_api'), 'Run WIQL API');

    const roTool = defineTool({
      name: 'sample_read',
      description: 'Read sample',
      schema: z.object({}),
      readOnly: true,
      title: 'Custom Read Title',
      openWorld: false,
      handler: () => Promise.resolve('ok'),
    });
    assert.deepStrictEqual(roTool.annotations, {
      title: 'Custom Read Title',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });

    const rwTool = defineTool({
      name: 'sample_write',
      description: 'Write sample',
      schema: z.object({}),
      readOnly: false,
      destructive: true,
      idempotent: false,
      handler: () => Promise.resolve('ok'),
    });
    assert.deepStrictEqual(rwTool.annotations, {
      title: 'Sample Write',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    });
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
