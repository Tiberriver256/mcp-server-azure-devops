import { z } from 'zod';

// Define schema objects
const ListProjectsSchema = z.object({
  top: z.number().optional(),
  skip: z.number().optional(),
  includeCapabilities: z.boolean().optional(),
  includeHistory: z.boolean().optional()
});

const GetProjectSchema = z.object({
  projectId: z.string(),
  includeCapabilities: z.boolean().optional(),
  includeHistory: z.boolean().optional()
});

const GetWorkItemSchema = z.object({
  workItemId: z.number(),
  expand: z.string().optional()
});

const ListWorkItemsSchema = z.object({
  projectId: z.string(),
  queryId: z.string().optional(),
  wiql: z.string().optional(),
  teamId: z.string().optional(),
  top: z.number().optional(),
  skip: z.number().optional()
});

const GetRepositorySchema = z.object({
  projectId: z.string(),
  repositoryId: z.string(),
  includeLinks: z.boolean().optional()
});

const ListRepositoriesSchema = z.object({
  projectId: z.string(),
  includeLinks: z.boolean().optional()
});

// Define mock functions before imports
const mockWebApiConstructor = jest.fn().mockImplementation((_url: string, _requestHandler: any) => {
  return {
    getLocationsApi: jest.fn().mockResolvedValue({
      getResourceAreas: jest.fn().mockResolvedValue([])
    }),
    getCoreApi: jest.fn().mockResolvedValue({
      getProjects: jest.fn().mockResolvedValue([])
    }),
    getGitApi: jest.fn(),
    getWorkItemTrackingApi: jest.fn()
  };
});

const mockGetPersonalAccessTokenHandler = jest.fn();

// Mock modules before imports
jest.mock('azure-devops-node-api', () => ({
  WebApi: mockWebApiConstructor,
  getPersonalAccessTokenHandler: mockGetPersonalAccessTokenHandler
}));

// Mock the operations modules
jest.mock('../../src/operations/projects', () => ({
  ListProjectsSchema,
  GetProjectSchema,
  listProjects: jest.fn(),
  getProject: jest.fn()
}));

jest.mock('../../src/operations/workitems', () => ({
  GetWorkItemSchema,
  ListWorkItemsSchema,
  getWorkItem: jest.fn(),
  listWorkItems: jest.fn()
}));

jest.mock('../../src/operations/repositories', () => ({
  GetRepositorySchema,
  ListRepositoriesSchema,
  getRepository: jest.fn(),
  listRepositories: jest.fn()
}));

// Define mock server class
class MockServerClass {
  setRequestHandler = jest.fn();
  registerTool = jest.fn();
  capabilities = {
    tools: {} as Record<string, { name: string }>
  };
}

// Mock the modules
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => new MockServerClass())
}));

jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: 'ListToolsRequestSchema',
  CallToolRequestSchema: 'CallToolRequestSchema'
}));

import { WebApi } from 'azure-devops-node-api';
import { AzureDevOpsConfig } from '../../src/types/config';
import { AzureDevOpsAuthenticationError } from '../../src/common/errors';
import { IRequestHandler } from 'azure-devops-node-api/interfaces/common/VsoBaseInterfaces';
import { createAzureDevOpsServer } from '../../src/server';
import { getProject, listProjects } from '../../src/operations/projects';
import { getWorkItem, listWorkItems } from '../../src/operations/workitems';
import { getRepository, listRepositories } from '../../src/operations/repositories';

describe('Server Coverage Tests', () => {
  let mockServer: MockServerClass;
  let callToolHandler: any;
  
  const validConfig: AzureDevOpsConfig = {
    organizationUrl: 'https://dev.azure.com/test',
    personalAccessToken: 'test-pat',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Initialize the mock server
    mockServer = new MockServerClass();
    
    // Mock the Server constructor to return our mockServer
    (require('@modelcontextprotocol/sdk/server/index.js').Server as jest.Mock).mockReturnValue(mockServer);
    
    // Create server instance
    createAzureDevOpsServer(validConfig);
    
    // Define the callToolHandler function
    callToolHandler = mockServer.setRequestHandler.mock.calls.find(
      (call: any[]) => call[0] === 'CallToolRequestSchema'
    )?.[1];
  });

  describe('Server Initialization', () => {
    it('should create a server instance', () => {
      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(2);
    });

    it('should register tools', () => {
      expect(mockServer.registerTool).toHaveBeenCalledWith('list_projects');
      expect(mockServer.registerTool).toHaveBeenCalledWith('get_project');
      expect(mockServer.registerTool).toHaveBeenCalledWith('get_work_item');
      expect(mockServer.registerTool).toHaveBeenCalledWith('list_work_items');
      expect(mockServer.registerTool).toHaveBeenCalledWith('get_repository');
      expect(mockServer.registerTool).toHaveBeenCalledWith('list_repositories');
    });

    it('should set request handlers', () => {
      expect(mockServer.setRequestHandler).toHaveBeenCalledWith('ListToolsRequestSchema', expect.any(Function));
      expect(mockServer.setRequestHandler).toHaveBeenCalledWith('CallToolRequestSchema', expect.any(Function));
    });
  });

  describe('getConnection', () => {
    it('should create a WebApi instance with the correct parameters', () => {
      const requestHandler: IRequestHandler = {
        prepareRequest: (options) => {
          options.headers = { Authorization: `Basic ${Buffer.from(':test-pat').toString('base64')}` };
        },
        canHandleAuthentication: () => false,
        handleAuthentication: async () => {
          throw new Error('Authentication not supported');
        }
      };
      const webApi = new WebApi('https://dev.azure.com/test', requestHandler);
      expect(webApi).toBeDefined();
    });

    it('should throw AzureDevOpsAuthenticationError when connection fails', async () => {
      const error = new Error('Authentication failed');
      jest.spyOn(WebApi.prototype, 'getLocationsApi').mockRejectedValueOnce(error);

      const requestHandler: IRequestHandler = {
        prepareRequest: (options) => {
          options.headers = { Authorization: `Basic ${Buffer.from(':invalid-pat').toString('base64')}` };
        },
        canHandleAuthentication: () => false,
        handleAuthentication: async () => {
          throw new Error('Authentication not supported');
        }
      };
      const webApi = new WebApi('https://dev.azure.com/test', requestHandler);

      await expect(webApi.getLocationsApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
    });
  });

  describe('CallToolRequestSchema Handler', () => {
    it('should throw error for unknown tool', async () => {
      await expect(callToolHandler({
        params: {
          name: 'unknown_tool',
          arguments: {}
        }
      })).rejects.toThrow('Unknown tool: unknown_tool');
    });

    it('should throw error when arguments are missing', async () => {
      await expect(callToolHandler({
        params: {
          name: 'list_projects'
        }
      })).rejects.toThrow('Arguments are required');
    });

    it('should handle list_projects tool call', async () => {
      (listProjects as jest.Mock).mockResolvedValueOnce([{ id: 'project1', name: 'Project 1' }]);
      
      const result = await callToolHandler({
        params: {
          name: 'list_projects',
          arguments: { top: 10 }
        }
      });

      expect(result).toEqual([{ id: 'project1', name: 'Project 1' }]);
      expect(listProjects).toHaveBeenCalledWith(expect.any(WebApi), { top: 10 });
    });

    it('should handle get_project tool call', async () => {
      (getProject as jest.Mock).mockResolvedValueOnce({ id: 'project1', name: 'Project 1' });
      
      const result = await callToolHandler({
        params: {
          name: 'get_project',
          arguments: { projectId: 'project1' }
        }
      });

      expect(result).toEqual({ id: 'project1', name: 'Project 1' });
      expect(getProject).toHaveBeenCalledWith(expect.any(WebApi), 'project1');
    });

    it('should handle get_work_item tool call', async () => {
      (getWorkItem as jest.Mock).mockResolvedValueOnce({ id: 123, fields: { 'System.Title': 'Test Work Item' } });
      
      const result = await callToolHandler({
        params: {
          name: 'get_work_item',
          arguments: { workItemId: 123 }
        }
      });

      expect(result).toEqual({ id: 123, fields: { 'System.Title': 'Test Work Item' } });
      expect(getWorkItem).toHaveBeenCalledWith(expect.any(WebApi), 123);
    });

    it('should handle list_work_items tool call', async () => {
      (listWorkItems as jest.Mock).mockResolvedValueOnce([{ id: 123, fields: { 'System.Title': 'Test Work Item' } }]);
      
      const result = await callToolHandler({
        params: {
          name: 'list_work_items',
          arguments: { projectId: 'project1', wiql: 'SELECT * FROM WorkItems' }
        }
      });

      expect(result).toEqual([{ id: 123, fields: { 'System.Title': 'Test Work Item' } }]);
      expect(listWorkItems).toHaveBeenCalledWith(expect.any(WebApi), {
        projectId: 'project1',
        wiql: 'SELECT * FROM WorkItems'
      });
    });

    it('should handle get_repository tool call', async () => {
      (getRepository as jest.Mock).mockResolvedValueOnce({ id: 'repo1', name: 'Repository 1' });
      
      const result = await callToolHandler({
        params: {
          name: 'get_repository',
          arguments: { projectId: 'project1', repositoryId: 'repo1' }
        }
      });

      expect(result).toEqual({ id: 'repo1', name: 'Repository 1' });
      expect(getRepository).toHaveBeenCalledWith(expect.any(WebApi), 'project1', 'repo1');
    });

    it('should handle list_repositories tool call', async () => {
      (listRepositories as jest.Mock).mockResolvedValueOnce([{ id: 'repo1', name: 'Repository 1' }]);
      
      const result = await callToolHandler({
        params: {
          name: 'list_repositories',
          arguments: { projectId: 'project1' }
        }
      });

      expect(result).toEqual([{ id: 'repo1', name: 'Repository 1' }]);
      expect(listRepositories).toHaveBeenCalledWith(expect.any(WebApi), 'project1');
    });
  });
}); 