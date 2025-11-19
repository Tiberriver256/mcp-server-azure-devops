import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import { join } from 'path';
import dotenv from 'dotenv';
import { Organization } from './features/organizations/types';
import fs from 'fs';

// Load environment variables from .env file
dotenv.config();

/**
 * Helper function to create a client with custom CLI arguments
 */
async function createClientWithArgs(
  args: string[] = [],
): Promise<{ client: Client; transport: StdioClientTransport }> {
  const serverPath = join(process.cwd(), 'dist', 'index.js');
  const tempEnvFile = join(process.cwd(), '.env.e2e-test');

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['-r', 'dotenv/config', serverPath, ...args],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DOTENV_CONFIG_PATH: tempEnvFile,
    },
  });

  const client = new Client(
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
  return { client, transport };
}

describe('Azure DevOps MCP Server E2E Tests', () => {
  let client: Client;
  let serverProcess: ReturnType<typeof spawn>;
  let transport: StdioClientTransport;
  let tempEnvFile: string | null = null;

  beforeAll(async () => {
    // Debug: Log environment variables
    console.error('E2E TEST ENVIRONMENT VARIABLES:');
    console.error(
      `AZURE_DEVOPS_ORG_URL: ${process.env.AZURE_DEVOPS_ORG_URL || 'NOT SET'}`,
    );
    console.error(
      `AZURE_DEVOPS_PAT: ${process.env.AZURE_DEVOPS_PAT ? 'SET (hidden value)' : 'NOT SET'}`,
    );
    console.error(
      `AZURE_DEVOPS_DEFAULT_PROJECT: ${process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'NOT SET'}`,
    );
    console.error(
      `AZURE_DEVOPS_AUTH_METHOD: ${process.env.AZURE_DEVOPS_AUTH_METHOD || 'NOT SET'}`,
    );

    // Start the MCP server process
    const serverPath = join(process.cwd(), 'dist', 'index.js');

    // Create a temporary .env file for testing if needed
    const orgUrl = process.env.AZURE_DEVOPS_ORG_URL || '';
    const pat = process.env.AZURE_DEVOPS_PAT || '';
    const defaultProject = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || '';
    const authMethod = process.env.AZURE_DEVOPS_AUTH_METHOD || 'pat';

    if (orgUrl) {
      // Create a temporary .env file for the test
      tempEnvFile = join(process.cwd(), '.env.e2e-test');

      const envFileContent = `
AZURE_DEVOPS_ORG_URL=${orgUrl}
AZURE_DEVOPS_PAT=${pat}
AZURE_DEVOPS_DEFAULT_PROJECT=${defaultProject}
AZURE_DEVOPS_AUTH_METHOD=${authMethod}
`;

      fs.writeFileSync(tempEnvFile, envFileContent);
      console.error(`Created temporary .env file at ${tempEnvFile}`);

      // Start server with explicit file path to the temp .env file
      serverProcess = spawn('node', ['-r', 'dotenv/config', serverPath], {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DOTENV_CONFIG_PATH: tempEnvFile,
        },
      });
    } else {
      throw new Error(
        'Cannot start server: AZURE_DEVOPS_ORG_URL is not set in the environment',
      );
    }

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
      args: ['-r', 'dotenv/config', serverPath],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DOTENV_CONFIG_PATH: tempEnvFile,
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

    // Clean up temporary env file
    if (tempEnvFile && fs.existsSync(tempEnvFile)) {
      fs.unlinkSync(tempEnvFile);
      console.error(`Deleted temporary .env file at ${tempEnvFile}`);
    }

    // Force exit to clean up any remaining handles
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 500);
    });
  });

  describe('Domain Filtering', () => {
    test('should load all 43 tools by default (no filtering)', async () => {
      // Arrange - use default client without any domain args
      const tools = await client.listTools();

      // Assert
      expect(tools.tools).toBeDefined();
      expect(tools.tools.length).toBe(43);
    });

    test('should load only 5 work-items tools when --domains work-items', async () => {
      // Arrange
      const { client: filteredClient, transport: filteredTransport } =
        await createClientWithArgs(['--domains', 'work-items']);

      try {
        // Act
        const tools = await filteredClient.listTools();

        // Assert
        expect(tools.tools).toBeDefined();
        expect(tools.tools.length).toBe(5);

        const toolNames = tools.tools.map((t) => t.name);
        expect(toolNames).toContain('list_work_items');
        expect(toolNames).toContain('get_work_item');
        expect(toolNames).toContain('create_work_item');
        expect(toolNames).toContain('update_work_item');
        expect(toolNames).toContain('manage_work_item_link');

        // Should not contain tools from other domains
        expect(toolNames).not.toContain('list_repositories');
        expect(toolNames).not.toContain('list_projects');
        expect(toolNames).not.toContain('list_pipelines');
      } finally {
        await filteredClient.close();
        await filteredTransport.close();
      }
    });

    test('should load 9 tools when --domains core work-items', async () => {
      // Arrange
      const { client: filteredClient, transport: filteredTransport } =
        await createClientWithArgs(['--domains', 'core', 'work-items']);

      try {
        // Act
        const tools = await filteredClient.listTools();

        // Assert
        expect(tools.tools).toBeDefined();
        expect(tools.tools.length).toBe(9);

        const toolNames = tools.tools.map((t) => t.name);

        // Core domain tools (4)
        expect(toolNames).toContain('list_organizations');
        expect(toolNames).toContain('list_projects');
        expect(toolNames).toContain('get_project');
        expect(toolNames).toContain('get_me');

        // Work items domain tools (5)
        expect(toolNames).toContain('list_work_items');
        expect(toolNames).toContain('get_work_item');

        // Should not contain tools from other domains
        expect(toolNames).not.toContain('list_repositories');
        expect(toolNames).not.toContain('list_pipelines');
      } finally {
        await filteredClient.close();
        await filteredTransport.close();
      }
    });

    test('should support comma-separated domains', async () => {
      // Arrange
      const { client: filteredClient, transport: filteredTransport } =
        await createClientWithArgs(['--domains', 'core,work-items']);

      try {
        // Act
        const tools = await filteredClient.listTools();

        // Assert - should be same as space-separated
        expect(tools.tools).toBeDefined();
        expect(tools.tools.length).toBe(9);
      } finally {
        await filteredClient.close();
        await filteredTransport.close();
      }
    });
  });

  describe('Read-Only Mode', () => {
    test('should filter out write operations when --read-only', async () => {
      // Arrange
      const { client: readOnlyClient, transport: readOnlyTransport } =
        await createClientWithArgs(['--read-only']);

      try {
        // Act
        const tools = await readOnlyClient.listTools();

        // Assert
        const toolNames = tools.tools.map((t) => t.name);

        // Should contain read-only tools
        expect(toolNames).toContain('list_work_items');
        expect(toolNames).toContain('get_work_item');
        expect(toolNames).toContain('list_repositories');
        expect(toolNames).toContain('get_repository');
        expect(toolNames).toContain('list_projects');
        expect(toolNames).toContain('get_project');

        // Should NOT contain write operations
        expect(toolNames).not.toContain('create_work_item');
        expect(toolNames).not.toContain('update_work_item');
        expect(toolNames).not.toContain('create_branch');
        expect(toolNames).not.toContain('create_commit');
        expect(toolNames).not.toContain('create_pull_request');
        expect(toolNames).not.toContain('update_pull_request');
        expect(toolNames).not.toContain('trigger_pipeline');
        expect(toolNames).not.toContain('create_wiki');
        expect(toolNames).not.toContain('update_wiki_page');

        // Verify we filtered out approximately half the tools
        expect(tools.tools.length).toBeGreaterThanOrEqual(20);
        expect(tools.tools.length).toBeLessThanOrEqual(25);
      } finally {
        await readOnlyClient.close();
        await readOnlyTransport.close();
      }
    });
  });

  describe('Combined Filtering (Domain + Read-Only)', () => {
    test('should load only 2 tools when --domains work-items --read-only', async () => {
      // Arrange
      const { client: filteredClient, transport: filteredTransport } =
        await createClientWithArgs([
          '--domains',
          'work-items',
          '--read-only',
        ]);

      try {
        // Act
        const tools = await filteredClient.listTools();

        // Assert - 95% reduction! (43 -> 2)
        expect(tools.tools).toBeDefined();
        expect(tools.tools.length).toBe(2);

        const toolNames = tools.tools.map((t) => t.name);
        expect(toolNames).toContain('list_work_items');
        expect(toolNames).toContain('get_work_item');

        // Should not contain write operations
        expect(toolNames).not.toContain('create_work_item');
        expect(toolNames).not.toContain('update_work_item');

        // Should not contain tools from other domains
        expect(toolNames).not.toContain('list_repositories');
        expect(toolNames).not.toContain('list_projects');
      } finally {
        await filteredClient.close();
        await filteredTransport.close();
      }
    });

    test('should handle multiple domains with read-only mode', async () => {
      // Arrange
      const { client: filteredClient, transport: filteredTransport } =
        await createClientWithArgs([
          '--domains',
          'core',
          'repositories',
          '--read-only',
        ]);

      try {
        // Act
        const tools = await filteredClient.listTools();

        // Assert
        const toolNames = tools.tools.map((t) => t.name);

        // Core domain read-only tools
        expect(toolNames).toContain('list_organizations');
        expect(toolNames).toContain('list_projects');
        expect(toolNames).toContain('get_project');
        expect(toolNames).toContain('get_me');

        // Repositories domain read-only tools
        expect(toolNames).toContain('list_repositories');
        expect(toolNames).toContain('get_repository');
        expect(toolNames).toContain('get_file_content');

        // Should not contain write operations
        expect(toolNames).not.toContain('create_branch');
        expect(toolNames).not.toContain('create_commit');

        // Should not contain tools from other domains
        expect(toolNames).not.toContain('list_work_items');
        expect(toolNames).not.toContain('list_pipelines');
      } finally {
        await filteredClient.close();
        await filteredTransport.close();
      }
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

  describe('Parameterless Tools', () => {
    test('should call list_organizations without arguments', async () => {
      // Act - call the tool without providing arguments
      const result = await client.callTool({
        name: 'list_organizations',
        // No arguments provided
        arguments: {},
      });

      // Assert
      expect(result).toBeDefined();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(0);

      // Verify we got a valid JSON response
      const resultText = content[0].text;
      const organizations = JSON.parse(resultText);
      expect(Array.isArray(organizations)).toBe(true);
    });

    test('should call get_me without arguments', async () => {
      // Act - call the tool without providing arguments
      const result = await client.callTool({
        name: 'get_me',
        // No arguments provided
        arguments: {},
      });

      // Assert
      expect(result).toBeDefined();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(0);

      // Verify we got a valid JSON response with user info
      const resultText = content[0].text;
      const userInfo = JSON.parse(resultText);
      expect(userInfo).toHaveProperty('id');
      expect(userInfo).toHaveProperty('displayName');
    });
  });

  describe('Tools with Optional Parameters', () => {
    test('should call list_projects without arguments', async () => {
      // Act - call the tool without providing arguments
      const result = await client.callTool({
        name: 'list_projects',
        // No arguments provided
        arguments: {},
      });

      // Assert
      expect(result).toBeDefined();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(0);

      // Verify we got a valid JSON response
      const resultText = content[0].text;
      const projects = JSON.parse(resultText);
      expect(Array.isArray(projects)).toBe(true);
    });

    test('should call get_project without arguments', async () => {
      // Act - call the tool without providing arguments
      const result = await client.callTool({
        name: 'get_project',
        // No arguments provided
        arguments: {},
      });

      // Assert
      expect(result).toBeDefined();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(0);

      // Verify we got a valid JSON response with project info
      const resultText = content[0].text;
      const project = JSON.parse(resultText);
      expect(project).toHaveProperty('id');
      expect(project).toHaveProperty('name');
    });

    test('should call list_repositories without arguments', async () => {
      // Act - call the tool without providing arguments
      const result = await client.callTool({
        name: 'list_repositories',
        // No arguments provided
        arguments: {},
      });

      // Assert
      expect(result).toBeDefined();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(0);

      // Verify we got a valid JSON response
      const resultText = content[0].text;
      const repositories = JSON.parse(resultText);
      expect(Array.isArray(repositories)).toBe(true);
    });
  });
});
