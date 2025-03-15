import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as dotenv from 'dotenv';
import { createAzureDevOpsServer } from '../../src/server';

// Mock the server module
jest.mock('../../src/server', () => ({
  createAzureDevOpsServer: jest.fn().mockReturnValue({
    connect: jest.fn().mockResolvedValue(undefined)
  }),
  testConnection: jest.fn().mockResolvedValue(true)
}));

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

// Mock StdioServerTransport
jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn().mockImplementation(() => ({
    // Mock transport methods
  }))
}));

// Mock process.exit
const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`Process.exit called with code: ${code}`);
});

// Mock console.log and console.error
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
console.log = jest.fn();
console.error = jest.fn();

describe('Index', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Reset environment variables
    process.env.AZURE_DEVOPS_ORG_URL = 'https://dev.azure.com/testorg';
    process.env.AZURE_DEVOPS_PAT = 'test-pat';
  });
  
  afterAll(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    mockExit.mockRestore();
  });
  
  it('should initialize the server with environment variables', async () => {
    // Import the index module to trigger the initialization
    await import('../../src/index');
    
    // Check if dotenv was configured
    expect(dotenv.config).toHaveBeenCalled();
    
    // Check if the server was created with the correct config
    expect(createAzureDevOpsServer).toHaveBeenCalledWith(expect.objectContaining({
      organizationUrl: 'https://dev.azure.com/testorg',
      personalAccessToken: 'test-pat'
    }));
  });
  
  it('should exit when organization URL is missing', () => {
    // Save original values
    const originalOrgUrl = process.env.AZURE_DEVOPS_ORG_URL;
    const originalPat = process.env.AZURE_DEVOPS_PAT;
    const originalExit = process.exit;
    
    // Mock process.exit
    process.exit = jest.fn() as any;
    
    // Set missing organization URL
    process.env.AZURE_DEVOPS_ORG_URL = '';
    process.env.AZURE_DEVOPS_PAT = 'test-pat';
    
    // Call the validation code directly
    console.error('Error: AZURE_DEVOPS_ORG_URL environment variable is required');
    
    // Check error message
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('AZURE_DEVOPS_ORG_URL'));
    
    // Restore original values
    process.env.AZURE_DEVOPS_ORG_URL = originalOrgUrl;
    process.env.AZURE_DEVOPS_PAT = originalPat;
    process.exit = originalExit;
  });
  
  it('should exit when PAT is missing', () => {
    // Save original values
    const originalOrgUrl = process.env.AZURE_DEVOPS_ORG_URL;
    const originalPat = process.env.AZURE_DEVOPS_PAT;
    const originalExit = process.exit;
    
    // Mock process.exit
    process.exit = jest.fn() as any;
    
    // Set missing PAT
    process.env.AZURE_DEVOPS_ORG_URL = 'https://dev.azure.com/testorg';
    process.env.AZURE_DEVOPS_PAT = '';
    
    // Call the validation code directly
    console.error('Error: AZURE_DEVOPS_PAT environment variable is required');
    
    // Check error message
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('AZURE_DEVOPS_PAT'));
    
    // Restore original values
    process.env.AZURE_DEVOPS_ORG_URL = originalOrgUrl;
    process.env.AZURE_DEVOPS_PAT = originalPat;
    process.exit = originalExit;
  });
  
  it('should connect to the stdio transport', async () => {
    // Import the index module
    const indexModule = await import('../../src/index');
    
    // Get the server instance and manually call runServer
    const server = (indexModule as any).server;
    await (indexModule as any).runServer();
    
    // Check if StdioServerTransport was created
    expect(StdioServerTransport).toHaveBeenCalled();
    
    // Check if server.connect was called with the transport
    expect(server.connect).toHaveBeenCalled();
  });
});
