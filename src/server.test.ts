import { z } from 'zod';
import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsValidationError,
  AzureDevOpsResourceNotFoundError,
} from './shared/errors';
import { AzureDevOpsConfig } from './shared/types';
import {
  createAzureDevOpsServer,
  getConnection,
  testConnection,
} from './server';

// Define schema objects
const ListProjectsSchema = z.object({
  top: z.number().optional(),
  skip: z.number().optional(),
  includeCapabilities: z.boolean().optional(),
  includeHistory: z.boolean().optional(),
});

const GetProjectSchema = z.object({
  projectId: z.string(),
  includeCapabilities: z.boolean().optional(),
  includeHistory: z.boolean().optional(),
});

const GetWorkItemSchema = z.object({
  workItemId: z.number(),
  expand: z.string().optional(),
});

const ListWorkItemsSchema = z.object({
  projectId: z.string(),
  queryId: z.string().optional(),
  wiql: z.string().optional(),
  teamId: z.string().optional(),
  top: z.number().optional(),
  skip: z.number().optional(),
});

const GetRepositorySchema = z.object({
  projectId: z.string(),
  repositoryId: z.string(),
  includeLinks: z.boolean().optional(),
});

const ListRepositoriesSchema = z.object({
  projectId: z.string(),
  includeLinks: z.boolean().optional(),
});

const CreateWorkItemSchema = z.object({
  projectId: z.string(),
  workItemType: z.string(),
  title: z.string(),
  description: z.string().optional(),
  assignedTo: z.string().optional(),
  areaPath: z.string().optional(),
  iterationPath: z.string().optional(),
  priority: z.number().optional(),
  additionalFields: z.record(z.string(), z.any()).optional(),
});

// Create a mock server that we can access in tests
const mockServer = {
  setRequestHandler: jest.fn(),
  registerTool: jest.fn(),
  capabilities: {
    tools: {},
  },
};

// Define mock functions before imports
const mockWebApiConstructor = jest
  .fn()
  .mockImplementation((_url: string, _requestHandler: any) => {
    return {
      getLocationsApi: jest.fn().mockResolvedValue({
        getResourceAreas: jest.fn().mockResolvedValue([]),
      }),
      getCoreApi: jest.fn().mockResolvedValue({
        getProjects: jest.fn().mockResolvedValue([]),
      }),
      getGitApi: jest.fn(),
      getWorkItemTrackingApi: jest.fn(),
    };
  });

const mockGetPersonalAccessTokenHandler = jest.fn();

// Mock modules before imports
jest.mock('azure-devops-node-api', () => ({
  WebApi: mockWebApiConstructor,
  getPersonalAccessTokenHandler: mockGetPersonalAccessTokenHandler,
}));

// Mock the MCP SDK modules
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => mockServer),
}));

jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: 'ListToolsRequestSchema',
  CallToolRequestSchema: 'CallToolRequestSchema',
}));

// Mock the feature modules
jest.mock('./features/projects/list-projects/feature', () => ({
  listProjects: jest.fn(),
}));

jest.mock('./features/projects/get-project/feature', () => ({
  getProject: jest.fn(),
}));

jest.mock('./features/work-items/get-work-item/feature', () => ({
  getWorkItem: jest.fn(),
}));

jest.mock('./features/work-items/list-work-items/feature', () => ({
  listWorkItems: jest.fn(),
}));

jest.mock('./features/work-items/create-work-item/feature', () => ({
  createWorkItem: jest.fn(),
}));

jest.mock('./features/repositories/get-repository/feature', () => ({
  getRepository: jest.fn(),
}));

jest.mock('./features/repositories/list-repositories/feature', () => ({
  listRepositories: jest.fn(),
}));

jest.mock('./features/organizations/list-organizations/feature', () => ({
  listOrganizations: jest.fn(),
}));

// Mock the schema modules
jest.mock('./features/projects/schemas', () => ({
  ListProjectsSchema,
  GetProjectSchema,
}));

jest.mock('./features/work-items/schemas', () => ({
  GetWorkItemSchema,
  ListWorkItemsSchema,
  CreateWorkItemSchema,
}));

jest.mock('./features/repositories/schemas', () => ({
  GetRepositorySchema,
  ListRepositoriesSchema,
}));

import { getProject } from './features/projects/get-project/feature';
import { listProjects } from './features/projects/list-projects/feature';
import { getWorkItem } from './features/work-items/get-work-item/feature';
import { listWorkItems } from './features/work-items/list-work-items/feature';
import { createWorkItem } from './features/work-items/create-work-item/feature';
import { getRepository } from './features/repositories/get-repository/feature';
import { listRepositories } from './features/repositories/list-repositories/feature';
import { listOrganizations } from './features/organizations/list-organizations/feature';

describe('Azure DevOps MCP Server', () => {
  let callToolHandler: any;

  const validConfig: AzureDevOpsConfig = {
    organizationUrl: 'https://dev.azure.com/testorg',
    personalAccessToken: 'mock-pat-1234567890abcdef1234567890abcdef1234567890',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Initialize the mock server
    mockServer.registerTool.mockImplementation((name) => {
      return { name };
    });

    // Create server instance
    createAzureDevOpsServer(validConfig);

    // Define the callToolHandler function
    callToolHandler = mockServer.setRequestHandler.mock.calls.find(
      (call: any[]) => call[0] === 'CallToolRequestSchema',
    )?.[1];
  });

  describe('Server Initialization', () => {
    it('should create a server instance', () => {
      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(2);
    });

    it('should register tools', () => {
      const toolCalls = (mockServer.registerTool as jest.Mock).mock.calls;
      const toolNames = toolCalls.map((call: any[]) => call[0]);

      // Check for specific tools
      expect(toolNames).toContain('list_projects');
      expect(toolNames).toContain('get_project');
      expect(toolNames).toContain('get_work_item');
      expect(toolNames).toContain('list_work_items');
    });

    it('should set request handlers', () => {
      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        'ListToolsRequestSchema',
        expect.any(Function),
      );
      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        'CallToolRequestSchema',
        expect.any(Function),
      );
    });

    it('should throw error when organization URL is missing', () => {
      const invalidConfig = { ...validConfig, organizationUrl: '' };
      expect(() => createAzureDevOpsServer(invalidConfig)).toThrow(
        'Organization URL is required',
      );
    });

    it('should throw error when PAT is missing', () => {
      const invalidConfig = { ...validConfig, personalAccessToken: '' };
      expect(() => createAzureDevOpsServer(invalidConfig)).toThrow(
        'Personal Access Token is required',
      );
    });
  });

  describe('CallToolRequestSchema Handler', () => {
    it('should handle unknown tool error', async () => {
      const response = await callToolHandler({
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
      });

      expect(response.content[0].text).toContain('Unknown tool: unknown_tool');
    });

    it('should handle missing arguments error', async () => {
      const response = await callToolHandler({
        params: {
          name: 'list_projects',
        },
      });

      expect(response.content[0].text).toContain('Arguments are required');
    });

    it('should handle list_projects tool call', async () => {
      (listProjects as jest.Mock).mockResolvedValueOnce([
        { id: 'project1', name: 'Project 1' },
      ]);

      const result = await callToolHandler({
        params: {
          name: 'list_projects',
          arguments: { top: 10 },
        },
      });

      expect(JSON.parse(result.content[0].text)).toEqual([
        { id: 'project1', name: 'Project 1' },
      ]);
      expect(listProjects).toHaveBeenCalledWith(expect.anything(), { top: 10 });
    });

    it('should handle get_project tool call', async () => {
      (getProject as jest.Mock).mockResolvedValueOnce({
        id: 'project1',
        name: 'Project 1',
      });

      const result = await callToolHandler({
        params: {
          name: 'get_project',
          arguments: { projectId: 'project1' },
        },
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        id: 'project1',
        name: 'Project 1',
      });
      expect(getProject).toHaveBeenCalledWith(expect.anything(), 'project1');
    });

    it('should handle list_work_items tool call', async () => {
      (listWorkItems as jest.Mock).mockResolvedValueOnce([
        { id: 1, fields: { 'System.Title': 'Task 1' } },
      ]);

      const result = await callToolHandler({
        params: {
          name: 'list_work_items',
          arguments: { projectId: 'project1', wiql: 'SELECT * FROM WorkItems' },
        },
      });

      expect(JSON.parse(result.content[0].text)).toEqual([
        { id: 1, fields: { 'System.Title': 'Task 1' } },
      ]);
      expect(listWorkItems).toHaveBeenCalledWith(expect.anything(), {
        projectId: 'project1',
        wiql: 'SELECT * FROM WorkItems',
      });
    });

    it('should handle get_work_item tool call', async () => {
      (getWorkItem as jest.Mock).mockResolvedValueOnce({
        id: 1,
        fields: { 'System.Title': 'Task 1' },
      });

      const result = await callToolHandler({
        params: {
          name: 'get_work_item',
          arguments: { workItemId: 1 },
        },
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        id: 1,
        fields: { 'System.Title': 'Task 1' },
      });
      expect(getWorkItem).toHaveBeenCalledWith(expect.anything(), 1);
    });

    it('should handle create_work_item tool call', async () => {
      (createWorkItem as jest.Mock).mockResolvedValueOnce({
        id: 1,
        fields: { 'System.Title': 'New Task' },
      });

      const result = await callToolHandler({
        params: {
          name: 'create_work_item',
          arguments: {
            projectId: 'project1',
            workItemType: 'Task',
            title: 'New Task',
          },
        },
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        id: 1,
        fields: { 'System.Title': 'New Task' },
      });
      expect(createWorkItem).toHaveBeenCalledWith(
        expect.anything(),
        'project1',
        'Task',
        {
          title: 'New Task',
          description: undefined,
          assignedTo: undefined,
          areaPath: undefined,
          iterationPath: undefined,
          priority: undefined,
          additionalFields: undefined,
        },
      );
    });

    it('should handle list_repositories tool call', async () => {
      (listRepositories as jest.Mock).mockResolvedValueOnce([
        { id: 'repo1', name: 'Repository 1' },
      ]);

      const result = await callToolHandler({
        params: {
          name: 'list_repositories',
          arguments: { projectId: 'project1' },
        },
      });

      expect(JSON.parse(result.content[0].text)).toEqual([
        { id: 'repo1', name: 'Repository 1' },
      ]);
      expect(listRepositories).toHaveBeenCalledWith(expect.anything(), {
        projectId: 'project1',
      });
    });

    it('should handle get_repository tool call', async () => {
      (getRepository as jest.Mock).mockResolvedValueOnce({
        id: 'repo1',
        name: 'Repository 1',
      });

      const result = await callToolHandler({
        params: {
          name: 'get_repository',
          arguments: { projectId: 'project1', repositoryId: 'repo1' },
        },
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        id: 'repo1',
        name: 'Repository 1',
      });
      expect(getRepository).toHaveBeenCalledWith(
        expect.anything(),
        'project1',
        'repo1',
      );
    });

    it('should handle list_organizations tool call', async () => {
      (listOrganizations as jest.Mock).mockResolvedValueOnce([
        { name: 'org1', url: 'https://dev.azure.com/org1' },
      ]);

      const result = await callToolHandler({
        params: {
          name: 'list_organizations',
          arguments: {},
        },
      });

      expect(JSON.parse(result.content[0].text)).toEqual([
        { name: 'org1', url: 'https://dev.azure.com/org1' },
      ]);
      expect(listOrganizations).toHaveBeenCalledWith(validConfig);
    });

    it('should handle error thrown by feature function', async () => {
      (getProject as jest.Mock).mockRejectedValueOnce(
        new AzureDevOpsResourceNotFoundError('Project not found'),
      );

      const result = await callToolHandler({
        params: {
          name: 'get_project',
          arguments: { projectId: 'invalid-project' },
        },
      });

      expect(result.content[0].text).toContain('Project not found');
      expect(result.content[0].text).toContain(
        'AzureDevOpsResourceNotFoundError',
      );
    });
  });

  describe('Connection Functions', () => {
    it('should create a connection to Azure DevOps', async () => {
      const connection = await getConnection(validConfig);
      expect(connection).toBeDefined();
    });

    it('should test connection successfully', async () => {
      // Mock getConnection for this test
      (getConnection as jest.Mock).mockResolvedValueOnce({
        getLocationsApi: jest.fn().mockResolvedValue({
          getResourceAreas: jest.fn().mockResolvedValue([]),
        }),
      });

      const result = await testConnection(validConfig);
      expect(result).toBe(true);
    });

    it('should handle connection failures', async () => {
      // Mock a failure for this specific test
      (getConnection as jest.Mock).mockRejectedValueOnce(
        new AzureDevOpsAuthenticationError('Connection failed'),
      );

      const result = await testConnection(validConfig);
      expect(result).toBe(false);
    });
  });
});
