import { Readable } from 'stream';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ListToolsResultSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { WebApi } from 'azure-devops-node-api';
import { GitVersionType } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { createAzureDevOpsServer, getToolRegistry } from './server';
import { AuthenticationMethod } from './shared/auth';
import { AzureDevOpsValidationError } from './shared/errors';
import { TOOLSET_NAMES } from './shared/config';

describe('createAzureDevOpsServer deep seam tests', () => {
  const baseConfig = {
    organizationUrl: 'https://dev.azure.com/test-org',
    authMethod: AuthenticationMethod.PersonalAccessToken,
    personalAccessToken: 'super-secret-pat-value',
    defaultProject: 'demo-project',
  };

  function getHandler(
    server: ReturnType<typeof createAzureDevOpsServer>,
    method: string,
  ) {
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

  it('registers all 60 tools across 10 toolsets with explicit boolean readOnly', () => {
    const registry = getToolRegistry();
    let total = 0;
    for (const toolset of TOOLSET_NAMES) {
      expect(registry[toolset].length).toBeGreaterThan(0);
      for (const tool of registry[toolset]) {
        expect(typeof tool.readOnly).toBe('boolean');
        total += 1;
      }
    }
    expect(total).toBe(60);
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
    const webApiFactory = jest.fn();
    const server = createAzureDevOpsServer(
      { ...baseConfig, readOnly: true },
      { webApiFactory },
    );

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
    expect(webApiFactory).not.toHaveBeenCalled();
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

  it('caches a single WebApi instance across multiple tool calls and redacts secrets in errors', async () => {
    const getProjects = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'p1', name: 'Alpha' }])
      .mockRejectedValueOnce(
        new Error(
          'Upstream failure with Authorization: Basic c2VjcmV0OnRva2Vu and Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
        ),
      );
    const mockWebApi = {
      getCoreApi: jest.fn().mockResolvedValue({ getProjects }),
    } as unknown as WebApi;
    const webApiFactory = jest.fn().mockResolvedValue(mockWebApi);

    const server = createAzureDevOpsServer(baseConfig, { webApiFactory });
    const callHandler = getHandler(
      server,
      CallToolRequestSchema.shape.method.value,
    );

    const first = (await callHandler(
      {
        method: 'tools/call',
        params: { name: 'list_projects', arguments: {} },
      },
      {},
    )) as { isError?: boolean; content: Array<{ text: string }> };
    expect(first.isError).toBeUndefined();
    expect(JSON.parse(first.content[0].text)).toEqual([
      { id: 'p1', name: 'Alpha' },
    ]);

    const second = (await callHandler(
      {
        method: 'tools/call',
        params: { name: 'list_projects', arguments: {} },
      },
      {},
    )) as { isError: boolean; content: Array<{ text: string }> };
    expect(second.isError).toBe(true);
    expect(second.content[0].text).not.toContain('c2VjcmV0OnRva2Vu');
    expect(second.content[0].text).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(second.content[0].text).toContain('[REDACTED]');

    // Both calls reused the cached WebApi connection
    expect(webApiFactory).toHaveBeenCalledTimes(1);
  });

  it('serves ListResources, ListResourceTemplates, and ReadResource for all 5 ado:// URI templates', async () => {
    const getItemContent = jest
      .fn()
      .mockImplementation(() => Readable.from(['export const ok = true;\n']));
    const getPullRequestById = jest.fn().mockResolvedValue({
      pullRequestId: 77,
      lastMergeSourceCommit: { commitId: 'deadbeef1234' },
    });
    const mockWebApi = {
      getGitApi: jest.fn().mockResolvedValue({
        getItemContent,
        getItems: jest.fn().mockResolvedValue([]),
        getPullRequestById,
      }),
    } as unknown as WebApi;
    const webApiFactory = jest.fn().mockResolvedValue(mockWebApi);

    const server = createAzureDevOpsServer(baseConfig, { webApiFactory });

    const listResources = getHandler(
      server,
      ListResourcesRequestSchema.shape.method.value,
    );
    expect(
      await listResources({ method: 'resources/list', params: {} }, {}),
    ).toEqual({
      resources: [],
    });

    const listTemplates = getHandler(
      server,
      ListResourceTemplatesRequestSchema.shape.method.value,
    );
    const templates = (await listTemplates(
      { method: 'resources/templates/list', params: {} },
      {},
    )) as { resourceTemplates: Array<{ uriTemplate: string }> };
    expect(templates.resourceTemplates).toHaveLength(5);

    const readResource = getHandler(
      server,
      ReadResourceRequestSchema.shape.method.value,
    );

    // 1. Default branch
    const defaultRes = (await readResource(
      {
        method: 'resources/read',
        params: {
          uri: 'ado://test-org/demo-project/my-repo/contents/src/app.ts',
        },
      },
      {},
    )) as { contents: Array<{ mimeType: string; text: string }> };
    expect(defaultRes.contents[0].mimeType).toBe('application/typescript');
    expect(defaultRes.contents[0].text).toBe('export const ok = true;\n');

    // 2. Branch with slash (verifies GitVersionType.Branch === 0 is NOT dropped!)
    await readResource(
      {
        method: 'resources/read',
        params: {
          uri: 'ado://test-org/demo-project/my-repo/branches/feature/foo/contents/src/app.ts',
        },
      },
      {},
    );
    expect(getItemContent).toHaveBeenLastCalledWith(
      'my-repo',
      '/src/app.ts',
      'demo-project',
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      { versionType: GitVersionType.Branch, version: 'feature/foo' },
      true,
    );

    // 3. Commit
    await readResource(
      {
        method: 'resources/read',
        params: {
          uri: 'ado://test-org/demo-project/my-repo/commits/abc123/contents/src/app.ts',
        },
      },
      {},
    );
    expect(getItemContent).toHaveBeenLastCalledWith(
      'my-repo',
      '/src/app.ts',
      'demo-project',
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      { versionType: GitVersionType.Commit, version: 'abc123' },
      true,
    );

    // 4. Tag
    await readResource(
      {
        method: 'resources/read',
        params: {
          uri: 'ado://test-org/demo-project/my-repo/tags/v1.0.0/contents/src/app.ts',
        },
      },
      {},
    );
    expect(getItemContent).toHaveBeenLastCalledWith(
      'my-repo',
      '/src/app.ts',
      'demo-project',
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      { versionType: GitVersionType.Tag, version: 'v1.0.0' },
      true,
    );

    // 5. Pull request (resolves lastMergeSourceCommit)
    await readResource(
      {
        method: 'resources/read',
        params: {
          uri: 'ado://test-org/demo-project/my-repo/pullrequests/77/contents/src/app.ts',
        },
      },
      {},
    );
    expect(getPullRequestById).toHaveBeenCalledWith(77, 'demo-project');
    expect(getItemContent).toHaveBeenLastCalledWith(
      'my-repo',
      '/src/app.ts',
      'demo-project',
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      { versionType: GitVersionType.Commit, version: 'deadbeef1234' },
      true,
    );
  });

  it('redacts secrets in ReadResource error logs and thrown messages', async () => {
    const stderrChunks: string[] = [];
    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: unknown) => {
        stderrChunks.push(String(chunk));
        return true;
      });

    try {
      const mockWebApi = {
        getGitApi: jest
          .fn()
          .mockRejectedValue(
            new Error(
              'Fetch failed with bearer superSecretBearerToken999 at https://:patSecretValue12345@dev.azure.com/org',
            ),
          ),
      } as unknown as WebApi;
      const server = createAzureDevOpsServer(baseConfig, {
        webApiFactory: jest.fn().mockResolvedValue(mockWebApi),
      });

      const readResource = getHandler(
        server,
        ReadResourceRequestSchema.shape.method.value,
      );

      const err = await readResource(
        {
          method: 'resources/read',
          params: {
            uri: 'ado://test-org/demo-project/my-repo/contents/src/app.ts',
          },
        },
        {},
      ).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).not.toContain('superSecretBearerToken999');
      expect((err as Error).message).not.toContain('patSecretValue12345');
      expect(stderrChunks.join('')).not.toContain('superSecretBearerToken999');
      expect(stderrChunks.join('')).not.toContain('patSecretValue12345');
    } finally {
      stderrSpy.mockRestore();
    }
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
