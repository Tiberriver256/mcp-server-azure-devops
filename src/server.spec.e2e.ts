import { getMcpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { WebSocketTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import { ToolCall, ToolResponse } from '@modelcontextprotocol/sdk/types.js';
import { createAzureDevOpsServer } from './server';
import { AzureDevOpsConfig } from './shared/types';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

describe('Azure DevOps MCP Server E2E', () => {
  let httpServer: ReturnType<typeof createServer>;
  let wss: WebSocketServer;
  const port = 3456; // Use a different port than default for testing
  
  beforeAll(async () => {
    // Set up the server for E2E testing
    httpServer = createServer();
    wss = new WebSocketServer({ server: httpServer });
    
    const config: AzureDevOpsConfig = {
      orgUrl: process.env.AZURE_DEVOPS_ORG_URL || '',
      authMethod: 'pat',
      pat: process.env.AZURE_DEVOPS_PAT,
      defaultProject: process.env.AZURE_DEVOPS_DEFAULT_PROJECT,
    };
    
    const mcpServer = createAzureDevOpsServer(config);
    
    // Handle WebSocket connections
    wss.on('connection', (ws) => {
      const send = (message: string) => ws.send(message);
      const onMessage = (message: string) => mcpServer.handleMessage(message, send);
      ws.on('message', (data) => onMessage(data.toString()));
    });
    
    await new Promise<void>((resolve) => {
      httpServer.listen(port, 'localhost', resolve);
    });
  });
  
  afterAll(async () => {
    // Clean up the server
    await new Promise<void>((resolve) => {
      wss.close();
      httpServer.close(() => resolve());
    });
  });
  
  test('should return list of available tools', async () => {
    // Skip if no credentials are available
    if (!process.env.AZURE_DEVOPS_ORG_URL || !process.env.AZURE_DEVOPS_PAT) {
      console.log('Skipping test: No real Azure DevOps connection available');
      return;
    }
    
    // Create a client to interact with the server
    const transport = new WebSocketTransport(`ws://localhost:${port}`);
    const client = getMcpClient(transport);
    
    await client.ready();
    
    // Get the available tools through the MCP client
    const tools = await client.getTools();
    
    // Assert on the tools
    expect(tools).toBeDefined();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
    
    // Should include at least one tool from each feature
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain('list_projects');
    expect(toolNames).toContain('get_work_item');
  });
  
  test('should execute a simple tool call', async () => {
    // Skip test if we don't have Azure DevOps credentials
    if (!process.env.AZURE_DEVOPS_ORG_URL || !process.env.AZURE_DEVOPS_PAT) {
      console.log('Skipping test: No real Azure DevOps connection available');
      return;
    }
    
    // Create a client to interact with the server
    const transport = new WebSocketTransport(`ws://localhost:${port}`);
    const client = getMcpClient(transport);
    
    await client.ready();
    
    // Create a tool call for list_projects
    const toolCall: ToolCall = {
      id: '1',
      name: 'list_projects',
      parameters: {}
    };
    
    // Execute the tool call
    const response = await client.executeTool(toolCall) as ToolResponse;
    
    // Assert on the response
    expect(response).toBeDefined();
    expect(response.status).toBe('success');
    expect(response.result).toBeDefined();
    
    // Result should be an array of projects
    const projects = response.result;
    expect(Array.isArray(projects)).toBe(true);
    
    // If projects exist, check their structure
    if (projects.length > 0) {
      const firstProject = projects[0];
      expect(firstProject.id).toBeDefined();
      expect(firstProject.name).toBeDefined();
    }
  });
}); 