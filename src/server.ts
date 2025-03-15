import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from 'zod-to-json-schema';
import { WebApi } from 'azure-devops-node-api';
import { VERSION } from "./config/version";
import { AzureDevOpsConfig } from "./types/config";
import { 
  AzureDevOpsAuthenticationError, 
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsValidationError,
  isAzureDevOpsError
} from "./common/errors";
import { AuthenticationMethod, AzureDevOpsClient } from './auth';

// Import our operation modules
import * as projects from './operations/projects';
import * as workitems from './operations/workitems';
import * as repositories from './operations/repositories';
import * as organizations from './operations/organizations';

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
      name: "azure-devops-mcp",
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register the ListTools request handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        // Organization tools
        {
          name: "list_organizations",
          description: "List all Azure DevOps organizations accessible to the authenticated user",
          inputSchema: zodToJsonSchema(organizations.ListOrganizationsSchema),
        },
        // Project tools
        {
          name: "list_projects",
          description: "List all projects in the Azure DevOps organization",
          inputSchema: zodToJsonSchema(projects.ListProjectsSchema),
        },
        {
          name: "get_project",
          description: "Get details of a specific project",
          inputSchema: zodToJsonSchema(projects.GetProjectSchema),
        },
        // Work item tools
        {
          name: "get_work_item",
          description: "Get details of a specific work item",
          inputSchema: zodToJsonSchema(workitems.GetWorkItemSchema),
        },
        {
          name: "list_work_items",
          description: "List work items in a project",
          inputSchema: zodToJsonSchema(workitems.ListWorkItemsSchema),
        },
        // Repository tools
        {
          name: "get_repository",
          description: "Get details of a specific repository",
          inputSchema: zodToJsonSchema(repositories.GetRepositorySchema),
        },
        {
          name: "list_repositories",
          description: "List repositories in a project",
          inputSchema: zodToJsonSchema(repositories.ListRepositoriesSchema),
        },
      ],
    };
  });

  // Register the CallTool request handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      if (!request.params.arguments) {
        throw new AzureDevOpsValidationError("Arguments are required");
      }

      // Get a connection to Azure DevOps
      const connection = await getConnection(config);

      switch (request.params.name) {
        // Organization tools
        case 'list_organizations': {
          // Parse arguments but they're not used since this tool doesn't have parameters
          organizations.ListOrganizationsSchema.parse(request.params.arguments);
          const result = await organizations.listOrganizations(config);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }
        
        // Project tools
        case 'list_projects': {
          const args = projects.ListProjectsSchema.parse(request.params.arguments);
          const result = await projects.listProjects(connection, args);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }
        case 'get_project': {
          const args = projects.GetProjectSchema.parse(request.params.arguments);
          const result = await projects.getProject(connection, args.projectId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }
        
        // Work item tools
        case 'get_work_item': {
          const args = workitems.GetWorkItemSchema.parse(request.params.arguments);
          const result = await workitems.getWorkItem(
            connection,
            args.workItemId
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }
        case 'list_work_items': {
          const args = workitems.ListWorkItemsSchema.parse(request.params.arguments);
          const result = await workitems.listWorkItems(connection, args);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }
        
        // Repository tools
        case 'get_repository': {
          const args = repositories.GetRepositorySchema.parse(request.params.arguments);
          const result = await repositories.getRepository(
            connection,
            args.projectId,
            args.repositoryId
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }
        case 'list_repositories': {
          const args = repositories.ListRepositoriesSchema.parse(request.params.arguments);
          const result = await repositories.listRepositories(connection, args);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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
        content: [{ type: "text", text: errorMessage }],
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
    throw new AzureDevOpsValidationError('Organization URL is required');
  }

  // Set default authentication method if not specified
  if (!config.authMethod) {
    config.authMethod = AuthenticationMethod.PersonalAccessToken;
  }

  // Validate PAT if using PAT authentication
  if (config.authMethod === AuthenticationMethod.PersonalAccessToken && !config.personalAccessToken) {
    throw new AzureDevOpsValidationError('Personal Access Token is required for PAT authentication');
  }
}

/**
 * Get an authenticated connection to Azure DevOps
 * 
 * @param config The Azure DevOps configuration
 * @returns An authenticated WebApi client
 * @throws {AzureDevOpsAuthenticationError} If authentication fails
 */
export async function getConnection(config: AzureDevOpsConfig): Promise<WebApi> {
  try {
    // Create a client with the appropriate authentication method
    const client = new AzureDevOpsClient({
      method: config.authMethod || AuthenticationMethod.PersonalAccessToken,
      organizationUrl: config.organizationUrl,
      personalAccessToken: config.personalAccessToken
    });
    
    // Test the connection by getting the Core API
    await client.getCoreApi();
    
    // Return the underlying WebApi client
    return await client.getWebApiClient();
  } catch (error) {
    safeLog(`Connection error details: ${error}`);
    throw new AzureDevOpsAuthenticationError(`Failed to authenticate with Azure DevOps: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Test the connection to Azure DevOps
 * 
 * @param config The Azure DevOps configuration
 * @returns True if the connection is successful, false otherwise
 */
export async function testConnection(config: AzureDevOpsConfig): Promise<boolean> {
  try {
    safeLog(`Testing connection to ${config.organizationUrl}...`);
    await getConnection(config);
    safeLog('Connection successful');
    return true;
  } catch (error) {
    safeLog('Connection test failed:');
    return false;
  }
}