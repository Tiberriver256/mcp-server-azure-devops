import { createAzureDevOpsServer, testConnection, getConnection } from '../../src/server';
import { AzureDevOpsConfig } from '../../src/types/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Mock the MCP SDK Server
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  const setRequestHandlerMock = jest.fn();
  
  return {
    Server: jest.fn().mockImplementation(() => ({
      setRequestHandler: setRequestHandlerMock,
      connect: jest.fn(),
      capabilities: {
        tools: {}
      }
    }))
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
    getCoreApi: jest.fn(),
    getGitApi: jest.fn(),
    getWorkItemTrackingApi: jest.fn(),
  }));

  return {
    WebApi: mockedWebApi,
    getPersonalAccessTokenHandler: jest.fn().mockReturnValue({}),
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
      // Mock a failure
      const webApiMock = require('azure-devops-node-api').WebApi;
      webApiMock.mockImplementationOnce(() => ({
        getLocationsApi: jest.fn().mockImplementation(() => {
          throw new Error('Connection failed');
        })
      }));
      
      const result = await testConnection(validConfig);
      expect(result).toBe(false);
    });
  });
}); 