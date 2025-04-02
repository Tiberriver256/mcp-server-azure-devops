import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
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
  ListProjectsSchema,
  getProject,
  listProjects,
} from './features/projects';

import {
  GetRepositorySchema,
  GetRepositoryDetailsSchema,
  ListRepositoriesSchema,
  getRepository,
  getRepositoryDetails,
  listRepositories,
} from './features/repositories';

import {
  ListOrganizationsSchema,
  listOrganizations,
} from './features/organizations';

import { SearchCodeSchema, searchCode } from './features/search';

// Create a safe console logging function that won't interfere with MCP protocol
function safeLog(message: string) {
  process.stderr.write(`${message}\n`);
}

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
      },
    },
  );

  // Register the ListTools request handler
  server.setRequestHandler(ListToolsRequestSchema, () => {
    return {
      tools: [
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
        // Repository tools
        {
          name: 'get_repository',
          description: 'Get details of a specific repository',
          inputSchema: zodToJsonSchema(GetRepositorySchema),
        },
        {
          name: 'get_repository_details',
          description: 'Get detailed information about a repository including statistics and refs',
          inputSchema: zodToJsonSchema(GetRepositoryDetailsSchema),
        },
        {
          name: 'list_repositories',
          description: 'List repositories in a project',
          inputSchema: zodToJsonSchema(ListRepositoriesSchema),
        },
        // Search tools
        {
          name: 'search_code',
          description: 'Search for code across repositories in a project',
          inputSchema: zodToJsonSchema(SearchCodeSchema),
        },
      ],
    };
  });

  // Register the CallTool request handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      if (!request.params.arguments) {
        throw new AzureDevOpsValidationError('Arguments are required');
      }

      // Get a connection to Azure DevOps
      const connection = await getConnection(config);

      switch (request.params.name) {
        // Organization tools
        case 'list_organizations': {
          // Parse arguments but they're not used since this tool doesn't have parameters
          ListOrganizationsSchema.parse(request.params.arguments);
          const result = await listOrganizations(config);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        // Project tools
        case 'list_projects': {
          const args = ListProjectsSchema.parse(request.params.arguments);
          const result = await listProjects(connection, args);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }
        case 'get_project': {
          const args = GetProjectSchema.parse(request.params.arguments);
          const result = await getProject(connection, args.projectId);
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
          const result = await listWorkItems(connection, args);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }
        case 'create_work_item': {
          const args = CreateWorkItemSchema.parse(request.params.arguments);
          const result = await createWorkItem(
            connection,
            args.projectId,
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
          const result = await manageWorkItemLink(connection, args.projectId, {
            sourceWorkItemId: args.sourceWorkItemId,
            targetWorkItemId: args.targetWorkItemId,
            operation: args.operation,
            relationType: args.relationType,
            newRelationType: args.newRelationType,
            comment: args.comment,
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
            args.projectId,
            args.repositoryId,
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }
        case 'get_repository_details': {
          const args = GetRepositoryDetailsSchema.parse(request.params.arguments);
          const result = await getRepositoryDetails(
            connection,
            {
              projectId: args.projectId,
              repositoryId: args.repositoryId,
              includeStatistics: args.includeStatistics,
              includeRefs: args.includeRefs,
              refFilter: args.refFilter,
              branchName: args.branchName,
            },
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }
        case 'list_repositories': {
          const args = ListRepositoriesSchema.parse(request.params.arguments);
          const result = await listRepositories(connection, args);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
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
    config.authMethod = AuthenticationMethod.PersonalAccessToken;
  }

  // Validate PAT if using PAT authentication
  if (
    config.authMethod === AuthenticationMethod.PersonalAccessToken &&
    !config.personalAccessToken
  ) {
    throw new AzureDevOpsValidationError(
      'Personal Access Token is required for PAT authentication',
    );
  }
}

/**
 * Get an authenticated connection to Azure DevOps
 *
 * @param config The Azure DevOps configuration
 * @returns An authenticated WebApi client
 * @throws {AzureDevOpsAuthenticationError} If authentication fails
 */
export async function getConnection(
  config: AzureDevOpsConfig,
): Promise<WebApi> {
  try {
    // Create a client with the appropriate authentication method
    const client = new AzureDevOpsClient({
      method: config.authMethod || AuthenticationMethod.PersonalAccessToken,
      organizationUrl: config.organizationUrl,
      personalAccessToken: config.personalAccessToken,
    });

    // Test the connection by getting the Core API
    await client.getCoreApi();

    // Return the underlying WebApi client
    return await client.getWebApiClient();
  } catch (error) {
    safeLog(`Connection error details: ${error}`);
    throw new AzureDevOpsAuthenticationError(
      `Failed to authenticate with Azure DevOps: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Test the connection to Azure DevOps
 *
 * @param config The Azure DevOps configuration
 * @returns True if the connection is successful, false otherwise
 */
export async function testConnection(
  config: AzureDevOpsConfig,
): Promise<boolean> {
  try {
    safeLog(`Testing connection to ${config.organizationUrl}...`);
    await getConnection(config);
    safeLog('Connection successful');
    return true;
  } catch {
    safeLog('Connection test failed:');
    return false;
  }
}
