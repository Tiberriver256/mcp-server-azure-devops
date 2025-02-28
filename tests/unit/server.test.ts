import { AzureDevOpsServer } from '../../src/server';
import { AzureDevOpsConfig } from '../../src/types/config';

// Mock the MCP server SDK
jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  // Create a mock for the tool method that captures the handler functions
  const toolMock = jest.fn((name, schema, handler) => {
    // Store the handlers by name for later testing
    if (!toolHandlers[name]) {
      toolHandlers[name] = handler;
    }
    return { name, schema };
  });
  
  // Object to store tool handlers for testing
  global.toolHandlers = {};
  
  return {
    McpServer: jest.fn().mockImplementation(() => ({
      tool: toolMock,
    })),
  };
});

// Mock the azure-devops-node-api
jest.mock('azure-devops-node-api', () => {
  const getLocationsApiMock = jest.fn();
  const getResourceAreasMock = jest.fn();

  const mockedWebApi = jest.fn().mockImplementation(() => ({
    getLocationsApi: getLocationsApiMock,
    getCoreApi: jest.fn(),
    getGitApi: jest.fn(),
    getWorkItemTrackingApi: jest.fn(),
  }));

  return {
    WebApi: mockedWebApi,
    getPersonalAccessTokenHandler: jest.fn().mockReturnValue({}),
    getLocationsApiMock,
    getResourceAreasMock,
  };
});

// Type declaration for global toolHandlers
declare global {
  var toolHandlers: Record<string, Function>;
}

describe('AzureDevOpsServer', () => {
  let server: AzureDevOpsServer;
  let validConfig: AzureDevOpsConfig;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Clear stored handlers
    global.toolHandlers = {};
    
    // Valid configuration for testing
    validConfig = {
      organizationUrl: 'https://dev.azure.com/testorg',
      personalAccessToken: 'mock-pat-1234567890abcdef1234567890abcdef1234567890', // Long enough PAT
    };
    
    server = new AzureDevOpsServer(validConfig);
  });
  
  describe('Constructor and Initialization', () => {
    it('should initialize with correct name and version', () => {
      expect(server.getName()).toBe('azure-devops-mcp');
      expect(server.getVersion()).not.toBe('');
    });
    
    it('should register tools during initialization', () => {
      // Check if server has registered tools
      const tools = server.getTools();
      expect(tools.length).toBeGreaterThan(0);
    });
    
    it('should throw error when organization URL is missing', () => {
      const invalidConfig = { ...validConfig, organizationUrl: '' };
      expect(() => new AzureDevOpsServer(invalidConfig)).toThrow('Organization URL is required');
    });
    
    it('should throw error when organization URL is invalid', () => {
      const invalidConfig = { ...validConfig, organizationUrl: 'not-a-url' };
      expect(() => new AzureDevOpsServer(invalidConfig)).toThrow('Invalid organization URL');
    });
    
    it('should throw error for non-Azure DevOps domains', () => {
      const invalidConfig = { ...validConfig, organizationUrl: 'https://example.com/org' };
      expect(() => new AzureDevOpsServer(invalidConfig)).toThrow('Invalid organization URL domain');
    });
    
    it('should throw error when PAT is missing', () => {
      const invalidConfig = { ...validConfig, personalAccessToken: '' };
      expect(() => new AzureDevOpsServer(invalidConfig)).toThrow('Personal Access Token is required');
    });
    
    it('should throw error when PAT is too short', () => {
      const invalidConfig = { ...validConfig, personalAccessToken: '1234' };
      expect(() => new AzureDevOpsServer(invalidConfig)).toThrow('Personal Access Token appears to be too short');
    });
    
    it('should throw error when API version is invalid', () => {
      const invalidConfig = { ...validConfig, apiVersion: 'bad-version' };
      expect(() => new AzureDevOpsServer(invalidConfig)).toThrow('Invalid API version format');
    });
    
    it('should accept valid API versions', () => {
      const configWithVersion = { ...validConfig, apiVersion: '6.0' };
      expect(() => new AzureDevOpsServer(configWithVersion)).not.toThrow();
      
      const configWithPreview = { ...validConfig, apiVersion: '6.0-preview.1' };
      expect(() => new AzureDevOpsServer(configWithPreview)).not.toThrow();
    });
  });
  
  describe('Tools Registration', () => {
    it('should include core tools for Azure DevOps operations', () => {
      const tools = server.getTools();
      const toolNames = tools.map(tool => tool.name);
      
      // Core functionality tools
      expect(toolNames).toContain('get_project');
      expect(toolNames).toContain('list_projects');
      
      // Work item tools
      expect(toolNames).toContain('get_work_item');
      expect(toolNames).toContain('create_work_item');
      
      // Repository tools
      expect(toolNames).toContain('get_repository');
      expect(toolNames).toContain('list_repositories');
    });
    
    // New tests for tool handlers
    describe('Project Tool Handlers', () => {
      it('should handle list_projects tool call', async () => {
        // Get the stored handler function
        const handler = global.toolHandlers['list_projects'];
        expect(handler).toBeDefined();
        
        // Call the handler and check response format
        const response = await handler({}, {});
        expect(response).toHaveProperty('content');
        expect(Array.isArray(response.content)).toBe(true);
        expect(response.content.length).toBeGreaterThan(0);
        expect(response.content[0]).toHaveProperty('type', 'text');
      });
      
      it('should handle get_project tool call', async () => {
        // Get the stored handler function
        const handler = global.toolHandlers['get_project'];
        expect(handler).toBeDefined();
        
        // Call the handler with a project ID
        const projectId = 'test-project';
        const response = await handler({ projectId }, {});
        
        expect(response).toHaveProperty('content');
        expect(Array.isArray(response.content)).toBe(true);
        expect(response.content.length).toBeGreaterThan(0);
        expect(response.content[0]).toHaveProperty('type', 'text');
        expect(response.content[0].text).toContain(projectId);
      });
    });
    
    describe('Work Item Tool Handlers', () => {
      it('should handle get_work_item tool call', async () => {
        // Get the stored handler function
        const handler = global.toolHandlers['get_work_item'];
        expect(handler).toBeDefined();
        
        // Call the handler with a work item ID
        const workItemId = 123;
        const response = await handler({ workItemId }, {});
        
        expect(response).toHaveProperty('content');
        expect(Array.isArray(response.content)).toBe(true);
        expect(response.content.length).toBeGreaterThan(0);
        expect(response.content[0]).toHaveProperty('type', 'text');
        expect(response.content[0].text).toContain(workItemId.toString());
      });
      
      it('should handle create_work_item tool call', async () => {
        // Get the stored handler function
        const handler = global.toolHandlers['create_work_item'];
        expect(handler).toBeDefined();
        
        // Call the handler with work item details
        const args = {
          project: 'test-project',
          title: 'Test Bug',
          workItemType: 'Bug',
          description: 'This is a test bug'
        };
        
        const response = await handler(args, {});
        
        expect(response).toHaveProperty('content');
        expect(Array.isArray(response.content)).toBe(true);
        expect(response.content.length).toBeGreaterThan(0);
        expect(response.content[0]).toHaveProperty('type', 'text');
        expect(response.content[0].text).toContain(args.title);
      });
    });
    
    describe('Repository Tool Handlers', () => {
      it('should handle list_repositories tool call', async () => {
        // Get the stored handler function
        const handler = global.toolHandlers['list_repositories'];
        expect(handler).toBeDefined();
        
        // Call with a specific project
        const project = 'test-project';
        let response = await handler({ project }, {});
        
        expect(response).toHaveProperty('content');
        expect(Array.isArray(response.content)).toBe(true);
        expect(response.content.length).toBeGreaterThan(0);
        expect(response.content[0]).toHaveProperty('type', 'text');
        expect(response.content[0].text).toContain(project);
        
        // Call without a project (should use default)
        response = await handler({}, {});
        expect(response.content[0].text).toContain('default');
      });
      
      it('should handle get_repository tool call', async () => {
        // Get the stored handler function
        const handler = global.toolHandlers['get_repository'];
        expect(handler).toBeDefined();
        
        // Call the handler with a repository ID
        const repositoryId = 'test-repo';
        const response = await handler({ repositoryId }, {});
        
        expect(response).toHaveProperty('content');
        expect(Array.isArray(response.content)).toBe(true);
        expect(response.content.length).toBeGreaterThan(0);
        expect(response.content[0]).toHaveProperty('type', 'text');
        expect(response.content[0].text).toContain(repositoryId);
      });
    });
  });
  
  describe('Connection Testing', () => {
    it('should return false when no connection is available', async () => {
      // Force connection to be null
      Object.defineProperty(server, 'connection', {
        value: null,
        writable: true
      });
      
      const result = await server.testConnection();
      expect(result).toBe(false);
    });
    
    it('should return true when connection test succeeds', async () => {
      // Mock successful connection test
      const mockLocationsApi = {
        getResourceAreas: jest.fn().mockResolvedValue([{ id: 'test', locationUrl: 'url' }])
      };
      
      const mockWebApi = {
        getLocationsApi: jest.fn().mockResolvedValue(mockLocationsApi)
      };
      
      Object.defineProperty(server, 'connection', {
        value: mockWebApi,
        writable: true
      });
      
      const result = await server.testConnection();
      expect(result).toBe(true);
      expect(mockWebApi.getLocationsApi).toHaveBeenCalled();
      expect(mockLocationsApi.getResourceAreas).toHaveBeenCalled();
    });
    
    it('should return false when connection test fails', async () => {
      // Mock failed connection test
      const mockLocationsApi = {
        getResourceAreas: jest.fn().mockRejectedValue(new Error('Connection failed'))
      };
      
      const mockWebApi = {
        getLocationsApi: jest.fn().mockResolvedValue(mockLocationsApi)
      };
      
      Object.defineProperty(server, 'connection', {
        value: mockWebApi,
        writable: true
      });
      
      const result = await server.testConnection();
      expect(result).toBe(false);
      expect(mockWebApi.getLocationsApi).toHaveBeenCalled();
      expect(mockLocationsApi.getResourceAreas).toHaveBeenCalled();
    });
  });
  
  describe('Transport Connection', () => {
    it('should connect to a transport', async () => {
      // Create a mock transport for testing
      const mockTransport = {
        start: jest.fn(),
        onMessage: jest.fn(),
        sendMessage: jest.fn(),
      };
      
      await server.connect(mockTransport);
      expect(mockTransport.start).toHaveBeenCalled();
      expect(mockTransport.onMessage).toHaveBeenCalled();
    });
  });
}); 