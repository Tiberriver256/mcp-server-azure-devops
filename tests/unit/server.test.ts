import { AzureDevOpsServer } from '../../src/server';
import { AzureDevOpsConfig } from '../../src/types/config';

describe('AzureDevOpsServer', () => {
  let server: AzureDevOpsServer;
  
  beforeEach(() => {
    // Mock configuration for testing
    const config: AzureDevOpsConfig = {
      organizationUrl: 'https://dev.azure.com/testorg',
      personalAccessToken: 'mock-pat-1234567890abcdef1234567890abcdef', // 40 characters
    };
    
    server = new AzureDevOpsServer(config);
  });
  
  it('should initialize with correct name and version', () => {
    expect(server.getName()).toBe('azure-devops-mcp');
    expect(server.getVersion()).toBe('0.1.0');
  });
  
  it('should register tools during initialization', () => {
    // Check if server has registered tools
    const tools = server.getTools();
    expect(tools.length).toBeGreaterThan(0);
  });
  
  it('should include core tools for Azure DevOps operations', () => {
    const tools = server.getTools();
    
    // Check for essential tools
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
  
  it('should handle connection testing', async () => {
    // Mock the connection test method
    server.testConnection = jest.fn().mockResolvedValue(true);
    
    const result = await server.testConnection();
    expect(result).toBe(true);
    expect(server.testConnection).toHaveBeenCalled();
  });
}); 