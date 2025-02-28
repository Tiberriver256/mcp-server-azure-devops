import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as azdev from 'azure-devops-node-api';
import { AzureDevOpsConfig } from './types/config';
import { VERSION } from './config/version';

/**
 * Azure DevOps MCP Server
 * 
 * Implements a Model Context Protocol server for Azure DevOps
 */
export class AzureDevOpsServer {
  private server: McpServer;
  private config: AzureDevOpsConfig;
  private connection: azdev.WebApi | null = null;
  private serverInfo: { name: string, version: string };
  
  /**
   * Create a new Azure DevOps MCP Server
   * 
   * @param config The Azure DevOps configuration
   */
  constructor(config: AzureDevOpsConfig) {
    this.validateConfig(config);
    this.config = config;
    
    this.serverInfo = {
      name: "azure-devops-mcp",
      version: VERSION
    };
    
    // Initialize the MCP server
    this.server = new McpServer({
      name: this.serverInfo.name,
      version: this.serverInfo.version
    });
    
    // Initialize the Azure DevOps connection
    this.initializeConnection();
    
    // Register the tools
    this.registerTools();
  }
  
  /**
   * Validate the Azure DevOps configuration
   * 
   * @param config Configuration to validate
   * @throws Error if configuration is invalid
   */
  private validateConfig(config: AzureDevOpsConfig): void {
    // Validate organization URL
    if (!config.organizationUrl) {
      throw new Error('Organization URL is required');
    }

    try {
      const url = new URL(config.organizationUrl);
      if (!url.hostname.endsWith('azure.com') && !url.hostname.endsWith('visualstudio.com')) {
        throw new Error('Invalid organization URL domain');
      }
    } catch (error: any) {
      throw new Error(`Invalid organization URL: ${error.message}`);
    }

    // Validate PAT
    if (!config.personalAccessToken) {
      throw new Error('Personal Access Token is required');
    }

    if (config.personalAccessToken.length < 32) {
      throw new Error('Personal Access Token appears to be too short');
    }

    // Validate API version if provided
    if (config.apiVersion) {
      const apiVersionPattern = /^\d+\.\d+(-preview(\.\d+)?)?$/;
      if (!apiVersionPattern.test(config.apiVersion)) {
        throw new Error('Invalid API version format. Expected format: major.minor or major.minor-preview.revision');
      }
    }
  }
  
  /**
   * Initialize the Azure DevOps API connection
   */
  private initializeConnection(): void {
    const authHandler = azdev.getPersonalAccessTokenHandler(this.config.personalAccessToken);
    this.connection = new azdev.WebApi(this.config.organizationUrl, authHandler);
  }
  
  /**
   * Register all tools with the MCP server
   */
  private registerTools(): void {
    this.registerProjectTools();
    this.registerWorkItemTools();
    this.registerRepositoryTools();
  }
  
  /**
   * Register project-related tools
   */
  private registerProjectTools(): void {
    // List projects tool
    this.server.tool(
      "list_projects",
      {},
      async (_args, _extras) => {
        // Implementation will be added later
        return {
          content: [
            {
              type: "text",
              text: "Project list will be displayed here"
            }
          ]
        };
      }
    );
    
    // Get project details tool
    this.server.tool(
      "get_project",
      {
        projectId: z.string().describe("The ID or name of the project")
      },
      async (args, _extras) => {
        // Implementation will be added later
        return {
          content: [
            {
              type: "text",
              text: `Project details for ${args.projectId} will be displayed here`
            }
          ]
        };
      }
    );
  }
  
  /**
   * Register work item-related tools
   */
  private registerWorkItemTools(): void {
    // Get work item tool
    this.server.tool(
      "get_work_item",
      {
        workItemId: z.number().describe("The ID of the work item"),
        project: z.string().optional().describe("The project containing the work item")
      },
      async (args, _extras) => {
        // Implementation will be added later
        return {
          content: [
            {
              type: "text",
              text: `Work item ${args.workItemId} details will be displayed here`
            }
          ]
        };
      }
    );
    
    // Create work item tool
    this.server.tool(
      "create_work_item",
      {
        project: z.string().describe("The project to create the work item in"),
        title: z.string().describe("The title of the work item"),
        description: z.string().optional().describe("The description of the work item"),
        workItemType: z.string().describe("The type of work item (e.g., Bug, Task, User Story)"),
        assignedTo: z.string().optional().describe("The user to assign the work item to")
      },
      async (args, _extras) => {
        // Implementation will be added later
        return {
          content: [
            {
              type: "text",
              text: `Work item created with title: ${args.title}`
            }
          ]
        };
      }
    );
  }
  
  /**
   * Register repository-related tools
   */
  private registerRepositoryTools(): void {
    // List repositories tool
    this.server.tool(
      "list_repositories",
      {
        project: z.string().optional().describe("The project to list repositories from")
      },
      async (args, _extras) => {
        // Implementation will be added later
        return {
          content: [
            {
              type: "text",
              text: `Repositories for project ${args.project || 'default'} will be displayed here`
            }
          ]
        };
      }
    );
    
    // Get repository details tool
    this.server.tool(
      "get_repository",
      {
        repositoryId: z.string().describe("The ID or name of the repository"),
        project: z.string().optional().describe("The project containing the repository")
      },
      async (args, _extras) => {
        // Implementation will be added later
        return {
          content: [
            {
              type: "text",
              text: `Repository ${args.repositoryId} details will be displayed here`
            }
          ]
        };
      }
    );
  }
  
  /**
   * Test the connection to Azure DevOps
   * 
   * @returns A promise that resolves to true if the connection is successful
   */
  public async testConnection(): Promise<boolean> {
    try {
      // Try to get the location service to verify the connection
      if (!this.connection) {
        console.error('Connection test failed: No connection initialized');
        return false;
      }

      console.log('Testing connection to:', this.config.organizationUrl);
      const locationApi = await this.connection.getLocationsApi();
      console.log('Successfully got location API, attempting to get resource areas...');
      
      const areas = await locationApi.getResourceAreas();
      console.log('Successfully retrieved resource areas:', areas.length);
      return true;
    } catch (error: any) {
      console.error('Connection test failed:', error);
      if ('statusCode' in error) {
        console.error('Status Code:', error.statusCode);
        console.error('Response Headers:', JSON.stringify(error.responseHeaders, null, 2));
      }
      if ('message' in error) {
        console.error('Error Message:', error.message);
      }
      return false;
    }
  }
  
  /**
   * Get the name of the server
   * 
   * @returns The server name
   */
  public getName(): string {
    return this.serverInfo.name;
  }
  
  /**
   * Get the version of the server
   * 
   * @returns The server version
   */
  public getVersion(): string {
    return this.serverInfo.version;
  }
  
  /**
   * Get all registered tools
   * 
   * @returns Array of registered tools
   */
  public getTools(): Array<{name: string; description: string}> {
    // This is a mock implementation for testing purposes
    // In a real implementation, we would get this information from the MCP server
    return [
      { name: 'get_project', description: 'Get project details' },
      { name: 'list_projects', description: 'List all projects' },
      { name: 'get_work_item', description: 'Get work item details' },
      { name: 'create_work_item', description: 'Create a new work item' },
      { name: 'get_repository', description: 'Get repository details' },
      { name: 'list_repositories', description: 'List all repositories' }
    ];
  }
  
  /**
   * Connect the server to a transport
   * 
   * @param transport The transport to connect to
   * @returns A promise that resolves when the connection is established
   */
  public async connect(transport: any): Promise<void> {
    return this.server.connect(transport);
  }
} 