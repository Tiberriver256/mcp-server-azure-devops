import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { WebApi } from 'azure-devops-node-api';
import { GitVersionType } from 'azure-devops-node-api/interfaces/GitInterfaces';
import type { ToolsetName } from './shared/config';
import { VERSION, resolveEnabledTools } from './shared/config';
import type { AzureDevOpsConfig, ToolDefinition } from './shared/types';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
  handleResponseError,
} from './shared/errors';
import { logError } from './shared/logging';
import { createAzureDevOpsSession } from './shared/session/azure-devops-session';
import type { CreateSessionOptions } from './shared/session/azure-devops-session';
import type {
  FeatureModule,
  RegisteredTool,
} from './shared/registry/tool-registry';
import {
  ADO_RESOURCE_TEMPLATES,
  getMimeType,
  parseAdoResourceUri,
} from './shared/resources/ado-resource-uri';

import { usersFeature } from './features/users';
import { organizationsFeature } from './features/organizations';
import { projectsFeature } from './features/projects';
import { repositoriesFeature, getFileContent } from './features/repositories';
import { workItemsFeature } from './features/work-items';
import { searchFeature } from './features/search';
import { pullRequestsFeature } from './features/pull-requests';
import { pipelinesFeature } from './features/pipelines';
import { wikisFeature } from './features/wikis';
import { testPlansFeature } from './features/test-plans';

export type AzureDevOpsServer = Server;

const FEATURE_MODULES: readonly FeatureModule[] = [
  usersFeature,
  organizationsFeature,
  projectsFeature,
  repositoriesFeature,
  workItemsFeature,
  searchFeature,
  pullRequestsFeature,
  pipelinesFeature,
  wikisFeature,
  testPlansFeature,
];

/**
 * Returns registered executable tools grouped by toolset name (without
 * eagerly converting Zod schemas to JSON Schema).
 */
export function getRegisteredToolRegistry(): Record<
  ToolsetName,
  readonly RegisteredTool[]
> {
  return {
    users: usersFeature.tools,
    organizations: organizationsFeature.tools,
    projects: projectsFeature.tools,
    repositories: repositoriesFeature.tools,
    'work-items': workItemsFeature.tools,
    search: searchFeature.tools,
    'pull-requests': pullRequestsFeature.tools,
    pipelines: pipelinesFeature.tools,
    wikis: wikisFeature.tools,
    'test-plans': testPlansFeature.tools,
  };
}

/**
 * Returns the full tool definition registry grouped by toolset name.
 */
export function getToolRegistry(): Record<ToolsetName, ToolDefinition[]> {
  const registered = getRegisteredToolRegistry();
  return {
    users: registered.users.map((t) => t.toDefinition()),
    organizations: registered.organizations.map((t) => t.toDefinition()),
    projects: registered.projects.map((t) => t.toDefinition()),
    repositories: registered.repositories.map((t) => t.toDefinition()),
    'work-items': registered['work-items'].map((t) => t.toDefinition()),
    search: registered.search.map((t) => t.toDefinition()),
    'pull-requests': registered['pull-requests'].map((t) => t.toDefinition()),
    pipelines: registered.pipelines.map((t) => t.toDefinition()),
    wikis: registered.wikis.map((t) => t.toDefinition()),
    'test-plans': registered['test-plans'].map((t) => t.toDefinition()),
  };
}

export function getFeatureModules(): readonly FeatureModule[] {
  return FEATURE_MODULES;
}

/**
 * Create an Azure DevOps MCP Server.
 *
 * - Validates config and resolves enabled tools upfront (fail-fast).
 * - Converts Zod schemas to JSON Schema lazily only for enabled tools.
 * - Uses a single cached AzureDevOpsSession per server instance (no per-call
 *   connection probes or credential re-instantiation).
 * - Dispatches tools in O(1) via Map lookup with uniform schema validation.
 */
export function createAzureDevOpsServer(
  config: AzureDevOpsConfig,
  sessionDeps?: CreateSessionOptions,
): Server {
  const session = createAzureDevOpsSession(config, sessionDeps);

  const toolCatalog = resolveEnabledTools(getRegisteredToolRegistry(), {
    toolsets: session.config.toolsets,
    enabledTools: session.config.enabledTools,
    disabledTools: session.config.disabledTools,
    readOnly: session.config.readOnly,
  });

  const enabledToolMap = new Map<string, RegisteredTool>();
  for (const tool of toolCatalog.tools) {
    enabledToolMap.set(tool.name, tool);
  }

  let cachedMcpTools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations: { readOnlyHint: boolean };
  }> | null = null;

  const getMcpTools = () => {
    if (!cachedMcpTools) {
      cachedMcpTools = toolCatalog.tools.map((tool) => {
        const def = tool.toDefinition();
        return {
          name: def.name,
          description: def.description,
          inputSchema: def.inputSchema,
          annotations: {
            readOnlyHint: def.readOnly,
          },
        };
      });
    }
    return cachedMcpTools;
  };

  const server = new Server(
    {
      name: 'azure-devops-mcp',
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => {
    return { tools: getMcpTools() };
  });

  server.setRequestHandler(ListResourcesRequestSchema, () => {
    return { resources: [] };
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, () => {
    return { resourceTemplates: [...ADO_RESOURCE_TEMPLATES] };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      const parsed = parseAdoResourceUri(request.params.uri);
      const connection = await session.getWebApi(parsed.organization);

      let versionDescriptor:
        | { versionType: GitVersionType; version: string }
        | undefined;

      switch (parsed.ref.kind) {
        case 'default':
          break;
        case 'branch':
          versionDescriptor = {
            versionType: GitVersionType.Branch,
            version: parsed.ref.branch,
          };
          break;
        case 'commit':
          versionDescriptor = {
            versionType: GitVersionType.Commit,
            version: parsed.ref.commit,
          };
          break;
        case 'tag':
          versionDescriptor = {
            versionType: GitVersionType.Tag,
            version: parsed.ref.tag,
          };
          break;
        case 'pullrequest': {
          const gitApi = await connection.getGitApi();
          const pr = await gitApi.getPullRequestById(
            parsed.ref.pullRequestId,
            parsed.project,
          );
          if (!pr) {
            throw new AzureDevOpsResourceNotFoundError(
              `Pull request ${parsed.ref.pullRequestId} not found in project '${parsed.project}'`,
            );
          }

          const sourceCommit = pr.lastMergeSourceCommit?.commitId;
          const sourceBranch = pr.sourceRefName?.replace(/^refs\/heads\//, '');

          if (sourceCommit) {
            versionDescriptor = {
              versionType: GitVersionType.Commit,
              version: sourceCommit,
            };
          } else if (sourceBranch) {
            versionDescriptor = {
              versionType: GitVersionType.Branch,
              version: sourceBranch,
            };
          }
          break;
        }
      }

      const fileContent = await getFileContent(
        connection,
        parsed.project,
        parsed.repository,
        parsed.path,
        versionDescriptor,
      );

      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: fileContent.isDirectory
              ? 'application/json'
              : getMimeType(parsed.path),
            text: fileContent.content,
          },
        ],
      };
    } catch (error) {
      logError(
        `Error reading resource: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (error instanceof AzureDevOpsError) {
        throw error;
      }
      throw new AzureDevOpsResourceNotFoundError(
        `Failed to read resource: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const toolName = request.params.name;
      const tool = enabledToolMap.get(toolName);
      if (!tool) {
        if (toolCatalog.readOnlyBlockedNames.has(toolName)) {
          throw new AzureDevOpsValidationError(
            `Tool '${toolName}' is disabled in read-only mode`,
          );
        }
        if (toolCatalog.allToolNames.has(toolName)) {
          throw new AzureDevOpsValidationError(
            `Tool '${toolName}' is disabled by server configuration`,
          );
        }
        throw new Error(`Unknown tool: ${toolName}`);
      }

      return await tool.execute(session, request.params.arguments);
    } catch (error) {
      return handleResponseError(error);
    }
  });

  return server;
}

/**
 * Create a one-off authenticated WebApi connection for standalone callers.
 */
export async function getConnection(
  config: AzureDevOpsConfig,
): Promise<WebApi> {
  const session = createAzureDevOpsSession(config);
  return await session.getWebApi();
}
