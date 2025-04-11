import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { WebApi } from 'azure-devops-node-api';
import { VERSION } from './shared/config';
import { AzureDevOpsConfig } from './shared/types';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
  isAzureDevOpsError,
} from './shared/errors';
import { AuthenticationMethod, AzureDevOpsClient } from './shared/auth';
import { defaultProject, defaultOrg } from './utils/environment';

// Import our new feature modules
import {
  ListWorkItemsSchema,
  GetWorkItemSchema,
  CreateWorkItemSchema,
  UpdateWorkItemSchema,
  ManageWorkItemLinkSchema,
  listWorkItems,
  getWorkItem,
  createWorkItem,
  updateWorkItem,
  manageWorkItemLink,
} from './features/work-items';

import {
  GetProjectSchema,
  GetProjectDetailsSchema,
  ListProjectsSchema,
  getProject,
  getProjectDetails,
  listProjects,
} from './features/projects';

import {
  GetRepositorySchema,
  GetRepositoryDetailsSchema,
  ListRepositoriesSchema,
  getRepository,
  getRepositoryDetails,
  listRepositories,
  getFileContent,
  GetFileContentSchema,
  GetAllRepositoriesTreeSchema,
  getAllRepositoriesTree,
  formatRepositoryTree,
} from './features/repositories';

import {
  ListOrganizationsSchema,
  listOrganizations,
} from './features/organizations';

import {
  SearchCodeSchema,
  SearchWikiSchema,
  SearchWorkItemsSchema,
  searchCode,
  searchWiki,
  searchWorkItems,
} from './features/search';

import { GetMeSchema, getMe } from './features/users';

import {
  CreatePullRequestSchema,
  createPullRequest,
} from './features/pull-requests';

import { ListPipelinesSchema, listPipelines } from './features/pipelines';

import { GitVersionType } from 'azure-devops-node-api/interfaces/GitInterfaces';

// Create a safe console logging function that won't interfere with MCP protocol
function safeLog(message: string) {
  process.stderr.write(`${message}\n`);
}

/**
 * Type definition for the Azure DevOps MCP Server
 */
export type AzureDevOpsServer = Server;

/**
 * Create an Azure DevOps MCP Server
 *
 * @param config The Azure DevOps configuration
 * @returns A configured MCP server instance
 */
export function createAzureDevOpsServer(config: AzureDevOpsConfig): Server {
  // Validate the configuration
  validateConfig(config);

  // Initialize the MCP server
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

  // Register the ListTools request handler
  server.setRequestHandler(ListToolsRequestSchema, () => {
    return {
      tools: [
        // User tools
        {
          name: 'get_me',
          description:
            'Get details of the authenticated user (id, displayName, email)',
          inputSchema: zodToJsonSchema(GetMeSchema),
        },
        // Organization tools
        {
          name: 'list_organizations',
          description:
            'List all Azure DevOps organizations accessible to the current authentication',
          inputSchema: zodToJsonSchema(ListOrganizationsSchema),
        },
        // Project tools
        {
          name: 'list_projects',
          description: 'List all projects in an organization',
          inputSchema: zodToJsonSchema(ListProjectsSchema),
        },
        {
          name: 'get_project',
          description: 'Get details of a specific project',
          inputSchema: zodToJsonSchema(GetProjectSchema),
        },
        {
          name: 'get_project_details',
          description:
            'Get comprehensive details of a project including process, work item types, and teams',
          inputSchema: zodToJsonSchema(GetProjectDetailsSchema),
        },
        // Work item tools
        {
          name: 'get_work_item',
          description: 'Get details of a specific work item',
          inputSchema: zodToJsonSchema(GetWorkItemSchema),
        },
        {
          name: 'list_work_items',
          description: 'List work items in a project',
          inputSchema: zodToJsonSchema(ListWorkItemsSchema),
        },
        {
          name: 'create_work_item',
          description: 'Create a new work item',
          inputSchema: zodToJsonSchema(CreateWorkItemSchema),
        },
        {
          name: 'update_work_item',
          description: 'Update an existing work item',
          inputSchema: zodToJsonSchema(UpdateWorkItemSchema),
        },
        {
          name: 'manage_work_item_link',
          description: 'Add or remove a link between work items',
          inputSchema: zodToJsonSchema(ManageWorkItemLinkSchema),
        },
        // Pipeline tools
        {
          name: 'list_pipelines',
          description: 'List pipelines in a project',
          inputSchema: zodToJsonSchema(ListPipelinesSchema),
        },
        // Repository tools
        {
          name: 'get_repository',
          description: 'Get details of a specific repository',
          inputSchema: zodToJsonSchema(GetRepositorySchema),
        },
        {
          name: 'get_repository_details',
          description:
            'Get detailed information about a repository including statistics and refs',
          inputSchema: zodToJsonSchema(GetRepositoryDetailsSchema),
        },
        {
          name: 'list_repositories',
          description: 'List repositories in a project',
          inputSchema: zodToJsonSchema(ListRepositoriesSchema),
        },
        // File content tool
        {
          name: 'get_file_content',
          description: 'Get content of a file or directory from a repository',
          inputSchema: zodToJsonSchema(GetFileContentSchema),
        },
        // Multi-repository tree tool
        {
          name: 'get_all_repositories_tree',
          description:
            'Displays a hierarchical tree view of files and directories across multiple Azure DevOps repositories within a project, based on their default branches',
          inputSchema: zodToJsonSchema(GetAllRepositoriesTreeSchema),
        },
        // Search tools
        {
          name: 'search_code',
          description: 'Search for code across repositories in a project',
          inputSchema: zodToJsonSchema(SearchCodeSchema),
        },
        {
          name: 'search_wiki',
          description: 'Search for content across wiki pages in a project',
          inputSchema: zodToJsonSchema(SearchWikiSchema),
        },
        {
          name: 'search_work_items',
          description: 'Search for work items across projects in Azure DevOps',
          inputSchema: zodToJsonSchema(SearchWorkItemsSchema),
        },
        // Pull request tools
        {
          name: 'create_pull_request',
          description: 'Create a new pull request',
          inputSchema: zodToJsonSchema(CreatePullRequestSchema),
        },
      ],
    };
  });

  // Register the resource handlers
  // ListResources - register available resource templates
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    // Create resource templates for repository content
    const templates = [
      // Default branch content
      {
        uriTemplate: 'ado://{organization}/{project}/{repo}/contents{/path*}',
        name: 'Repository Content',
        description: 'Content from the default branch of a repository',
      },
      // Branch specific content
      {
        uriTemplate:
          'ado://{organization}/{project}/{repo}/branches/{branch}/contents{/path*}',
        name: 'Branch Content',
        description: 'Content from a specific branch of a repository',
      },
      // Commit specific content
      {
        uriTemplate:
          'ado://{organization}/{project}/{repo}/commits/{commit}/contents{/path*}',
        name: 'Commit Content',
        description: 'Content from a specific commit in a repository',
      },
      // Tag specific content
      {
        uriTemplate:
          'ado://{organization}/{project}/{repo}/tags/{tag}/contents{/path*}',
        name: 'Tag Content',
        description: 'Content from a specific tag in a repository',
      },
      // Pull request specific content
      {
        uriTemplate:
          'ado://{organization}/{project}/{repo}/pullrequests/{prId}/contents{/path*}',
        name: 'Pull Request Content',
        description: 'Content from a specific pull request in a repository',
      },
    ];

    return {
      resources: [],
      templates,
    };
  });

  // ReadResource - handle reading content from the templates
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      const uri = new URL(request.params.uri);

      // Parse the URI to extract components
      const segments = uri.pathname.split('/').filter(Boolean);

      // Check if it's an Azure DevOps resource URI
      if (uri.protocol !== 'ado:') {
        throw new AzureDevOpsResourceNotFoundError(
          `Unsupported protocol: ${uri.protocol}`,
        );
      }

      // Extract organization, project, and repo
      // const organization = segments[0]; // Currently unused but kept for future use
      const project = segments[1];
      const repo = segments[2];

      // Get a connection to Azure DevOps
      const connection = await getConnection(config);

      // Default path is root if not specified
      let path = '/';
      // Extract path from the remaining segments, if there are at least 5 segments (org/project/repo/contents/path)
      if (segments.length >= 5 && segments[3] === 'contents') {
        path = '/' + segments.slice(4).join('/');
      }

      // Determine version control parameters based on URI pattern
      let versionType: GitVersionType | undefined;
      let version: string | undefined;

      if (segments[3] === 'branches' && segments.length >= 5) {
        versionType = GitVersionType.Branch;
        version = segments[4];

        // Extract path if present
        if (segments.length >= 7 && segments[5] === 'contents') {
          path = '/' + segments.slice(6).join('/');
        }
      } else if (segments[3] === 'commits' && segments.length >= 5) {
        versionType = GitVersionType.Commit;
        version = segments[4];

        // Extract path if present
        if (segments.length >= 7 && segments[5] === 'contents') {
          path = '/' + segments.slice(6).join('/');
        }
      } else if (segments[3] === 'tags' && segments.length >= 5) {
        versionType = GitVersionType.Tag;
        version = segments[4];

        // Extract path if present
        if (segments.length >= 7 && segments[5] === 'contents') {
          path = '/' + segments.slice(6).join('/');
        }
      } else if (segments[3] === 'pullrequests' && segments.length >= 5) {
        // TODO: For PR head, we need to get the source branch or commit
        // Currently just use the default branch as a fallback
        // versionType = GitVersionType.Branch;
        // version = 'PR-' + segments[4];

        // Extract path if present
        if (segments.length >= 7 && segments[5] === 'contents') {
          path = '/' + segments.slice(6).join('/');
        }
      }

      // Get the content
      const versionDescriptor =
        versionType && version ? { versionType, version } : undefined;

      const fileContent = await getFileContent(
        connection,
        project,
        repo,
        path,
        versionDescriptor,
      );

      // Return the content based on whether it's a file or directory
      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: fileContent.isDirectory
              ? 'application/json'
              : getMimeType(path),
            text: fileContent.content,
          },
        ],
      };
    } catch (error) {
      safeLog(`Error reading resource: ${error}`);
      if (error instanceof AzureDevOpsError) {
        throw error;
      }
      throw new AzureDevOpsResourceNotFoundError(
        `Failed to read resource: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  // Register the CallTool request handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      // Note: We don't need to validate the presence of arguments here because:
      // 1. The schema validations (via zod.parse) will check for required parameters
      // 2. Default values from environment.ts are applied for optional parameters (projectId, organizationId)
      // 3. Arguments can be omitted entirely for tools with no required parameters

      // Get a connection to Azure DevOps
      const connection = await getConnection(config);

      switch (request.params.name) {
        // User tools
        case 'get_me': {
          const result = await getMe(connection);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        // Organization tools
        case 'list_organizations': {
          const result = await listOrganizations(config);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        // Project tools
        case 'list_projects': {
          const args = ListProjectsSchema.parse(request.params.arguments);
          const result = await listProjects(connection, {
            stateFilter: args.stateFilter,
            top: args.top,
            skip: args.skip,
            continuationToken: args.continuationToken,
          });
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }
        case 'get_project': {
          const args = GetProjectSchema.parse(request.params.arguments);
          const result = await getProject(
            connection,
            args.projectId ?? defaultProject,
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }
        case 'get_project_details': {
          const args = GetProjectDetailsSchema.parse(request.params.arguments);
          const result = await getProjectDetails(connection, {
            ...args,
            projectId: args.projectId ?? defaultProject,
          });
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        // Work item tools
        case 'get_work_item': {
          const args = GetWorkItemSchema.parse(request.params.arguments);
          const result = await getWorkItem(
            connection,
            args.workItemId,
            args.expand,
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }
        case 'list_work_items': {
          const args = ListWorkItemsSchema.parse(request.params.arguments);
          const result = await listWorkItems(connection, {
            projectId: args.projectId ?? defaultProject,
            teamId: args.teamId,
            queryId: args.queryId,
            wiql: args.wiql,
            top: args.top,
            skip: args.skip,
          });
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }
        case 'create_work_item': {
          const args = CreateWorkItemSchema.parse(request.params.arguments);
          const result = await createWorkItem(
            connection,
            args.projectId ?? defaultProject,
            args.workItemType,
            {
              title: args.title,
              description: args.description,
              assignedTo: args.assignedTo,
              areaPath: args.areaPath,
              iterationPath: args.iterationPath,
              priority: args.priority,
              parentId: args.parentId,
              additionalFields: args.additionalFields,
            },
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }
        case 'update_work_item': {
          const args = UpdateWorkItemSchema.parse(request.params.arguments);
          const result = await updateWorkItem(connection, args.workItemId, {
            title: args.title,
            description: args.description,
            assignedTo: args.assignedTo,
            areaPath: args.areaPath,
            iterationPath: args.iterationPath,
            priority: args.priority,
            state: args.state,
            additionalFields: args.additionalFields,
          });
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }
        case 'manage_work_item_link': {
          const args = ManageWorkItemLinkSchema.parse(request.params.arguments);
          const result = await manageWorkItemLink(
            connection,
            args.projectId ?? defaultProject,
            {
              sourceWorkItemId: args.sourceWorkItemId,
              targetWorkItemId: args.targetWorkItemId,
              operation: args.operation,
              relationType: args.relationType,
              newRelationType: args.newRelationType,
              comment: args.comment,
            },
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        // Pipeline tools
        case 'list_pipelines': {
          const args = ListPipelinesSchema.parse(request.params.arguments);
          const result = await listPipelines(connection, {
            ...args,
            projectId: args.projectId ?? defaultProject,
          });
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        // Repository tools
        case 'get_repository': {
          const args = GetRepositorySchema.parse(request.params.arguments);
          const result = await getRepository(
            connection,
            args.projectId ?? defaultProject,
            args.repositoryId,
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }
        case 'get_repository_details': {
          const args = GetRepositoryDetailsSchema.parse(
            request.params.arguments,
          );
          const result = await getRepositoryDetails(connection, {
            projectId: args.projectId ?? defaultProject,
            repositoryId: args.repositoryId,
            includeStatistics: args.includeStatistics,
            includeRefs: args.includeRefs,
            refFilter: args.refFilter,
            branchName: args.branchName,
          });
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }
        case 'list_repositories': {
          const args = ListRepositoriesSchema.parse(request.params.arguments);
          const result = await listRepositories(connection, {
            ...args,
            projectId: args.projectId ?? defaultProject,
          });
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }
        case 'get_file_content': {
          const args = GetFileContentSchema.parse(request.params.arguments);

          // Map the string version type to the GitVersionType enum
          let versionTypeEnum: GitVersionType | undefined;
          if (args.versionType && args.version) {
            if (args.versionType === 'branch') {
              versionTypeEnum = GitVersionType.Branch;
            } else if (args.versionType === 'commit') {
              versionTypeEnum = GitVersionType.Commit;
            } else if (args.versionType === 'tag') {
              versionTypeEnum = GitVersionType.Tag;
            }
          }

          const result = await getFileContent(
            connection,
            args.projectId ?? defaultProject,
            args.repositoryId,
            args.path,
            versionTypeEnum !== undefined && args.version
              ? { versionType: versionTypeEnum, version: args.version }
              : undefined,
          );
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }
        case 'get_all_repositories_tree': {
          const args = GetAllRepositoriesTreeSchema.parse(
            request.params.arguments,
          );
          const result = await getAllRepositoriesTree(connection, {
            ...args,
            projectId: args.projectId ?? defaultProject,
            organizationId: args.organizationId ?? defaultOrg,
          });

          // Format the output as plain text tree representation
          let formattedOutput = '';
          for (const repo of result.repositories) {
            formattedOutput += formatRepositoryTree(
              repo.name,
              repo.tree,
              repo.stats,
              repo.error,
            );
            formattedOutput += '\n'; // Add blank line between repositories
          }

          return {
            content: [{ type: 'text', text: formattedOutput }],
          };
        }

        // Search tools
        case 'search_code': {
          const args = SearchCodeSchema.parse(request.params.arguments);
          const result = await searchCode(connection, args);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }
        case 'search_wiki': {
          const args = SearchWikiSchema.parse(request.params.arguments);
          const result = await searchWiki(connection, args);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }
        case 'search_work_items': {
          const args = SearchWorkItemsSchema.parse(request.params.arguments);
          const result = await searchWorkItems(connection, args);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        // Pull request tools
        case 'create_pull_request': {
          const args = CreatePullRequestSchema.parse(request.params.arguments);
          const result = await createPullRequest(
            connection,
            args.projectId ?? defaultProject,
            args.repositoryId,
            args,
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    } catch (error) {
      safeLog(`Error handling tool call: ${error}`);

      // Format the error message
      const errorMessage = isAzureDevOpsError(error)
        ? formatAzureDevOpsError(error)
        : `Error: ${error instanceof Error ? error.message : String(error)}`;

      return {
        content: [{ type: 'text', text: errorMessage }],
      };
    }
  });

  return server;
}

/**
 * Format an Azure DevOps error for display
 *
 * @param error The error to format
 * @returns Formatted error message
 */
function formatAzureDevOpsError(error: AzureDevOpsError): string {
  let message = `Azure DevOps API Error: ${error.message}`;

  if (error instanceof AzureDevOpsValidationError) {
    message = `Validation Error: ${error.message}`;
  } else if (error instanceof AzureDevOpsResourceNotFoundError) {
    message = `Not Found: ${error.message}`;
  } else if (error instanceof AzureDevOpsAuthenticationError) {
    message = `Authentication Failed: ${error.message}`;
  }

  return message;
}

/**
 * Get a mime type based on file extension
 *
 * @param path File path
 * @returns Mime type string
 */
function getMimeType(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'txt':
      return 'text/plain';
    case 'html':
    case 'htm':
      return 'text/html';
    case 'css':
      return 'text/css';
    case 'js':
      return 'application/javascript';
    case 'json':
      return 'application/json';
    case 'xml':
      return 'application/xml';
    case 'md':
      return 'text/markdown';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'pdf':
      return 'application/pdf';
    case 'ts':
    case 'tsx':
      return 'application/typescript';
    case 'py':
      return 'text/x-python';
    case 'cs':
      return 'text/x-csharp';
    case 'java':
      return 'text/x-java';
    case 'c':
      return 'text/x-c';
    case 'cpp':
    case 'cc':
      return 'text/x-c++';
    case 'go':
      return 'text/x-go';
    case 'rs':
      return 'text/x-rust';
    case 'rb':
      return 'text/x-ruby';
    case 'sh':
      return 'text/x-sh';
    case 'yaml':
    case 'yml':
      return 'text/yaml';
    default:
      return 'text/plain';
  }
}

/**
 * Validate the Azure DevOps configuration
 *
 * @param config The configuration to validate
 * @throws {AzureDevOpsValidationError} If the configuration is invalid
 */
function validateConfig(config: AzureDevOpsConfig): void {
  if (!config.organizationUrl) {
    process.stderr.write(
      'ERROR: Organization URL is required but was not provided.\n',
    );
    process.stderr.write(
      `Config: ${JSON.stringify(
        {
          organizationUrl: config.organizationUrl,
          authMethod: config.authMethod,
          defaultProject: config.defaultProject,
          // Hide PAT for security
          personalAccessToken: config.personalAccessToken
            ? 'REDACTED'
            : undefined,
          apiVersion: config.apiVersion,
        },
        null,
        2,
      )}\n`,
    );
    throw new AzureDevOpsValidationError('Organization URL is required');
  }

  // Set default authentication method if not specified
  if (!config.authMethod) {
    config.authMethod = AuthenticationMethod.AzureIdentity;
  }

  // Validate PAT if using PAT authentication
  if (
    config.authMethod === AuthenticationMethod.PersonalAccessToken &&
    !config.personalAccessToken
  ) {
    throw new AzureDevOpsValidationError(
      'Personal access token is required when using PAT authentication',
    );
  }
}

/**
 * Create a connection to Azure DevOps
 *
 * @param config The configuration to use
 * @returns A WebApi connection
 */
export async function getConnection(
  config: AzureDevOpsConfig,
): Promise<WebApi> {
  try {
    // Create a client with the appropriate authentication method
    const client = new AzureDevOpsClient({
      method: config.authMethod || AuthenticationMethod.AzureIdentity,
      organizationUrl: config.organizationUrl,
      personalAccessToken: config.personalAccessToken,
    });

    // Test the connection by getting the Core API
    await client.getCoreApi();

    // Return the underlying WebApi client
    return await client.getWebApiClient();
  } catch (error) {
    throw new AzureDevOpsAuthenticationError(
      `Failed to connect to Azure DevOps: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
