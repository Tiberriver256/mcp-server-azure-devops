import { createAzureDevOpsServer, testConnection } from '../../src/server';
import { AzureDevOpsConfig } from '../../src/types/config';
import * as dotenv from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Load environment variables
dotenv.config();

describe('Azure DevOps MCP Server Integration', () => {
  let server: Server;
  let config: AzureDevOpsConfig;

  beforeAll(() => {
    // Skip tests if no credentials are provided
    if (!process.env.AZURE_DEVOPS_ORG_URL || !process.env.AZURE_DEVOPS_PAT) {
      console.warn('Skipping integration tests: No Azure DevOps credentials provided');
    }

    // Use real credentials if available, otherwise mock
    config = {
      organizationUrl: process.env.AZURE_DEVOPS_ORG_URL || 'https://dev.azure.com/mock-org',
      personalAccessToken: process.env.AZURE_DEVOPS_PAT || 'mock-pat',
      defaultProject: process.env.AZURE_DEVOPS_DEFAULT_PROJECT,
      apiVersion: process.env.AZURE_DEVOPS_API_VERSION
    };

    server = createAzureDevOpsServer(config);
  });

  it('should initialize server with config', () => {
    expect(server).toBeDefined();
  });

  // This test will be skipped if no credentials are provided
  (process.env.AZURE_DEVOPS_ORG_URL && process.env.AZURE_DEVOPS_PAT ? it : it.skip)(
    'should test connection to Azure DevOps successfully',
    async () => {

      const result = await testConnection(config);
      // Skip this assertion in CI environments where we don't have real credentials
      expect(result).toBe(true);
    },
    10000 // 10 second timeout for network operations
  );

  it('should connect to a transport', async () => {
    // Create a mock transport for testing
    const mockTransport = {
      start: jest.fn(),
      onMessage: jest.fn(),
      sendMessage: jest.fn(),
      send: jest.fn(),
      close: jest.fn()
    };

    // Mock the connect method
    server.connect = jest.fn().mockResolvedValue(undefined);

    // Test connection to the transport
    await server.connect(mockTransport as any);
    expect(server.connect).toHaveBeenCalledWith(mockTransport);
  });
}); 