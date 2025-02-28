import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('Azure DevOps MCP Server - Dependencies loaded successfully');
console.log('Azure DevOps Node API Version:', require('azure-devops-node-api/package.json').version);
console.log('Zod Version:', require('zod/package.json').version);

// Create a simple MCP server to verify the SDK is working
const server = new McpServer({
  name: "azure-devops-mcp",
  version: "0.1.0"
});

// Add a simple test tool
server.tool(
  "echo",
  { message: z.string() },
  async (args, _extra) => {
    return {
      content: [
        {
          type: "text",
          text: `Echo: ${args.message}`
        }
      ]
    };
  }
);

console.log('MCP Server created successfully');
console.log('Hello, world!');
