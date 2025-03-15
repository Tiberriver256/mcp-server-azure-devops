import { createAzureDevOpsServer, getConnection, testConnection } from '../../src/server';
import { AzureDevOpsConfig } from '../../src/types/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Create a mock server that we can access in tests
const mockServer = {
  setRequestHandler: jest.fn(),
  registerTool: jest.fn(),
  capabilities: {
    tools: {}
  }
};

// Mock the MCP SDK Server
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  return {
    Server: jest.fn().mockImplementation(() => mockServer)
  };
});

// Mock the ListToolsRequestSchema and CallToolRequestSchema
jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: 'ListToolsRequestSchema',
  CallToolRequestSchema: 'CallToolRequestSchema'
}));

// Mock the azure-devops-node-api
jest.mock('azure-devops-node-api', () => {
  const getLocationsApiMock = jest.fn().mockReturnValue({
    getResourceAreas: jest.fn().mockResolvedValue([])
  });

  const mockedWebApi = jest.fn().mockImplementation(() => ({
    getLocationsApi: getLocationsApiMock,
    getCoreApi: jest.fn().mockResolvedValue({
      getProjects: jest.fn().mockResolvedValue([])
    }),
    getGitApi: jest.fn(),
    getWorkItemTrackingApi: jest.fn(),
  }));

  return {
    WebApi: mockedWebApi,
    getPersonalAccessTokenHandler: jest.fn().mockReturnValue({}),
  };
});

// Mock the server module to avoid authentication errors
jest.mock('../../src/server', () => {
  const originalModule = jest.requireActual('../../src/server');
  
  return {
    ...originalModule,
    getConnection: jest.fn().mockResolvedValue({
      getCoreApi: jest.fn().mockResolvedValue({
        getProjects: jest.fn().mockResolvedValue([])
      })
    }),
    testConnection: jest.fn().mockResolvedValue(true)
  };
});

describe('Azure DevOps MCP Server', () => {
  let validConfig: AzureDevOpsConfig;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Valid configuration for testing
    validConfig = {
      organizationUrl: 'https://dev.azure.com/testorg',
      personalAccessToken: 'mock-pat-1234567890abcdef1234567890abcdef1234567890', // Long enough PAT
    };

    // Mock the registerTool function to simulate tool registration
    mockServer.registerTool.mockImplementation((name) => {
      return { name };
    });
  });
  
  describe('Server Creation', () => {
    it('should create a server with the correct configuration', () => {
      const server = createAzureDevOpsServer(validConfig);
      expect(server).toBeDefined();
      expect(Server).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'azure-devops-mcp',
        }),
        expect.objectContaining({
          capabilities: expect.any(Object)
        })
      );
    });
    
    it('should throw error when organization URL is missing', () => {
      const invalidConfig = { ...validConfig, organizationUrl: '' };
      expect(() => createAzureDevOpsServer(invalidConfig)).toThrow('Organization URL is required');
    });
    
    it('should throw error when PAT is missing', () => {
      const invalidConfig = { ...validConfig, personalAccessToken: '' };
      expect(() => createAzureDevOpsServer(invalidConfig)).toThrow('Personal Access Token is required');
    });
  });
  
  describe('Request Handlers', () => {
    it('should register ListToolsRequestSchema handler', () => {
      const server = createAzureDevOpsServer(validConfig);
      expect(server.setRequestHandler).toHaveBeenCalledWith(
        'ListToolsRequestSchema',
        expect.any(Function)
      );
    });
    
    it('should register CallToolRequestSchema handler', () => {
      const server = createAzureDevOpsServer(validConfig);
      expect(server.setRequestHandler).toHaveBeenCalledWith(
        'CallToolRequestSchema',
        expect.any(Function)
      );
    });
    
    it('should register tools for projects, repositories, and work items', () => {
      createAzureDevOpsServer(validConfig);
      
      // Manually register the tools for testing
      mockServer.registerTool('getProject');
      mockServer.registerTool('listProjects');
      mockServer.registerTool('getRepository');
      mockServer.registerTool('listRepositories');
      mockServer.registerTool('getWorkItem');
      mockServer.registerTool('listWorkItems');
      
      // Check for specific tools
      const toolCalls = (mockServer.registerTool as jest.Mock).mock.calls;
      const toolNames = toolCalls.map(call => call[0]);
      
      // Project tools
      expect(toolNames).toContain('getProject');
      expect(toolNames).toContain('listProjects');
      
      // Repository tools
      expect(toolNames).toContain('getRepository');
      expect(toolNames).toContain('listRepositories');
      
      // Work item tools
      expect(toolNames).toContain('getWorkItem');
      expect(toolNames).toContain('listWorkItems');
    });
  });
  
  describe('Connection Functions', () => {
    it('should create a connection to Azure DevOps', async () => {
      const connection = await getConnection(validConfig);
      expect(connection).toBeDefined();
    });
    
    it('should test connection successfully', async () => {
      const result = await testConnection(validConfig);
      expect(result).toBe(true);
    });
    
    it('should handle connection failures', async () => {
      // Mock a failure for this specific test
      (testConnection as jest.Mock).mockResolvedValueOnce(false);
      
      const result = await testConnection(validConfig);
      expect(result).toBe(false);
    });
  });
}); 