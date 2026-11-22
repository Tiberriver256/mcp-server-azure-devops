import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListToolsResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createAzureDevOpsServer, getToolRegistry } from './server';
import { AuthenticationMethod } from './shared/auth';
import { AzureDevOpsValidationError } from './shared/errors';
import { TOOLSET_NAMES } from './shared/config';

describe('createAzureDevOpsServer tool filtering and read-only mode', () => {
  const baseConfig = {
    organizationUrl: 'https://dev.azure.com/test-org',
    authMethod: AuthenticationMethod.PersonalAccessToken,
    personalAccessToken: 'test-pat',
  };

  function getHandler(
    server: ReturnType<typeof createAzureDevOpsServer>,
    method: string,
  ) {
    // Access registered MCP request handler for unit verification without spawning stdio transport
    const handlers = (
      server as unknown as {
        _requestHandlers: Map<
          string,
          (req: unknown, extra: unknown) => Promise<unknown>
        >;
      }
    )._requestHandlers;
    const handler = handlers.get(method);
    if (!handler) {
      throw new Error(`Handler not registered for ${method}`);
    }
    return handler;
  }

  it('requires every registered tool to explicitly declare boolean readOnly', () => {
    const registry = getToolRegistry();
    for (const toolset of TOOLSET_NAMES) {
      for (const tool of registry[toolset]) {
        expect(typeof tool.readOnly).toBe('boolean');
      }
    }
  });

  it('filters ListTools by toolsets and disabledTools and emits spec-compliant MCP tools', async () => {
    const server = createAzureDevOpsServer({
      ...baseConfig,
      toolsets: ['projects', 'users'],
      disabledTools: ['get_project_details'],
    });

    const listHandler = getHandler(
      server,
      ListToolsRequestSchema.shape.method.value,
    );
    const result = (await listHandler(
      { method: 'tools/list', params: {} },
      {},
    )) as {
      tools: Array<Record<string, unknown>>;
    };

    const parsed = ListToolsResultSchema.parse(result);
    expect(parsed.tools.map((t) => t.name)).toEqual([
      'get_me',
      'list_projects',
      'get_project',
    ]);
    for (const tool of result.tools) {
      expect(tool).not.toHaveProperty('readOnly');
      expect(tool).not.toHaveProperty('mcp_enabled');
      expect(tool.annotations).toEqual({ readOnlyHint: true });
    }
  });

  it('excludes all write tools in read-only mode and blocks CallTool before connecting', async () => {
    const server = createAzureDevOpsServer({
      ...baseConfig,
      readOnly: true,
    });

    const listHandler = getHandler(
      server,
      ListToolsRequestSchema.shape.method.value,
    );
    const listed = await listHandler({ method: 'tools/list', params: {} }, {});
    const parsed = ListToolsResultSchema.parse(listed);

    expect(parsed.tools.length).toBeGreaterThan(0);
    expect(
      parsed.tools.every((t) => t.annotations?.readOnlyHint === true),
    ).toBe(true);
    expect(parsed.tools.some((t) => t.name === 'create_work_item')).toBe(false);

    const callHandler = getHandler(
      server,
      CallToolRequestSchema.shape.method.value,
    );
    const response = (await callHandler(
      {
        method: 'tools/call',
        params: { name: 'create_work_item', arguments: {} },
      },
      {},
    )) as { isError: boolean; content: Array<{ text: string }> };

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain(
      "Tool 'create_work_item' is disabled in read-only mode",
    );
  });

  it('rejects tools disabled by toolsets, disabledTools, or unknown names on CallTool', async () => {
    const server = createAzureDevOpsServer({
      ...baseConfig,
      toolsets: ['projects'],
      disabledTools: ['get_project'],
    });

    const callHandler = getHandler(
      server,
      CallToolRequestSchema.shape.method.value,
    );

    const excludedByToolset = (await callHandler(
      {
        method: 'tools/call',
        params: { name: 'get_work_item', arguments: { workItemId: 1 } },
      },
      {},
    )) as { isError: boolean; content: Array<{ text: string }> };
    expect(excludedByToolset.isError).toBe(true);
    expect(excludedByToolset.content[0].text).toContain(
      "Tool 'get_work_item' is disabled by server configuration",
    );

    const excludedByDenylist = (await callHandler(
      {
        method: 'tools/call',
        params: { name: 'get_project', arguments: { projectId: 'p' } },
      },
      {},
    )) as { isError: boolean; content: Array<{ text: string }> };
    expect(excludedByDenylist.isError).toBe(true);
    expect(excludedByDenylist.content[0].text).toContain(
      "Tool 'get_project' is disabled by server configuration",
    );

    const unknownTool = (await callHandler(
      {
        method: 'tools/call',
        params: { name: 'totally_unknown_tool', arguments: {} },
      },
      {},
    )) as { isError: boolean; content: Array<{ text: string }> };
    expect(unknownTool.isError).toBe(true);
    expect(unknownTool.content[0].text).toContain(
      'Unknown tool: totally_unknown_tool',
    );
  });

  it('fails fast on unknown toolset during server creation', () => {
    expect(() =>
      createAzureDevOpsServer({
        ...baseConfig,
        toolsets: ['not-a-toolset'],
      }),
    ).toThrow(AzureDevOpsValidationError);
  });
});
