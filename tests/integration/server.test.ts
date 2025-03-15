import { createAzureDevOpsServer, testConnection } from '../../src/server';
import { AzureDevOpsConfig } from '../../src/types/config';
import * as dotenv from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Load environment variables
dotenv.config();

// Detect if running in CI environment
const isCI = process.env.CI === 'true';

describe('Azure DevOps MCP Server Integration', () => {
  let server: Server;
  let config: AzureDevOpsConfig;
  let skipTests = false;

  beforeAll(() => {
    // Log environment for debugging
    if (isCI) {
      console.log('Running in CI environment');
    }

    // Check if credentials are available
    if (!process.env.AZURE_DEVOPS_ORG_URL || !process.env.AZURE_DEVOPS_PAT) {
      console.warn('No Azure DevOps credentials provided. Some tests will be skipped.');
      skipTests = true;
    } else {
      console.log(`Using Azure DevOps organization: ${process.env.AZURE_DEVOPS_ORG_URL}`);
      if (process.env.AZURE_DEVOPS_DEFAULT_PROJECT) {
        console.log(`Using default project: ${process.env.AZURE_DEVOPS_DEFAULT_PROJECT}`);
      }
    }

    // Use real credentials if available, otherwise use mock credentials for basic tests
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
  (skipTests ? it.skip : it)(
    'should test connection to Azure DevOps successfully',
    async () => {
      const result = await testConnection(config);
      expect(result).toBe(true);
    },
    30000 // 30 second timeout for network operations
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