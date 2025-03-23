import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import { join } from 'path';
import dotenv from 'dotenv';
import { Organization } from './features/organizations/types';

// Load environment variables from .env file
dotenv.config();

describe('Azure DevOps MCP Server E2E Tests', () => {
  let client: Client;
  let serverProcess: ReturnType<typeof spawn>;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    // Start the MCP server process
    const serverPath = join(process.cwd(), 'dist', 'index.js');
    
    // Check for required environment variables
    if (!process.env.AZURE_DEVOPS_ORG_URL) {
      console.error('AZURE_DEVOPS_ORG_URL environment variable is missing in E2E tests');
      throw new Error('AZURE_DEVOPS_ORG_URL is required for E2E tests');
    }
    
    serverProcess = spawn('node', [serverPath], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        AZURE_DEVOPS_ORG_URL: process.env.AZURE_DEVOPS_ORG_URL || '',
        AZURE_DEVOPS_PAT: process.env.AZURE_DEVOPS_PAT || '',
        AZURE_DEVOPS_DEFAULT_PROJECT: process.env.AZURE_DEVOPS_DEFAULT_PROJECT || '',
        AZURE_DEVOPS_AUTH_METHOD: process.env.AZURE_DEVOPS_AUTH_METHOD || 'pat',
      },
    });

    // Capture server output for debugging
    if (serverProcess && serverProcess.stderr) {
      serverProcess.stderr.on('data', (data) => {
        console.error(`Server error: ${data.toString()}`);
      });
    }

    // Give the server a moment to start
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Connect the MCP client to the server
    transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        AZURE_DEVOPS_ORG_URL: process.env.AZURE_DEVOPS_ORG_URL || '',
        AZURE_DEVOPS_PAT: process.env.AZURE_DEVOPS_PAT || '',
        AZURE_DEVOPS_DEFAULT_PROJECT: process.env.AZURE_DEVOPS_DEFAULT_PROJECT || '',
        AZURE_DEVOPS_AUTH_METHOD: process.env.AZURE_DEVOPS_AUTH_METHOD || 'pat',
      },
    });

    client = new Client(
      {
        name: 'e2e-test-client',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    await client.connect(transport);
  });

  afterAll(async () => {
    // Clean up the client transport
    if (transport) {
      await transport.close();
    }

    // Clean up the client
    if (client) {
      await client.close();
    }

    // Clean up the server process
    if (serverProcess) {
      serverProcess.kill();
    }

    // Force exit to clean up any remaining handles
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 500);
    });
  });

  describe('Organizations', () => {
    test('should list organizations', async () => {
      // Arrange
      // No specific arrangement needed for this test as we're just listing organizations

      // Act
      const result = await client.callTool({
        name: 'list_organizations',
        arguments: {},
      });

      // Assert
      expect(result).toBeDefined();

      // Access the content safely
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(0);

      // Parse the result content
      const resultText = content[0].text;
      const organizations: Organization[] = JSON.parse(resultText);

      // Verify the response structure
      expect(Array.isArray(organizations)).toBe(true);
      if (organizations.length > 0) {
        const firstOrg = organizations[0];
        expect(firstOrg).toHaveProperty('id');
        expect(firstOrg).toHaveProperty('name');
        expect(firstOrg).toHaveProperty('url');
      }
    });
  });
});
