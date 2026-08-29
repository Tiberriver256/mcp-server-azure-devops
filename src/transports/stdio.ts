import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

function safeLog(message: string) {
  process.stderr.write(`${message}\n`);
}

export async function runStdioTransport(server: Server): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  safeLog('Azure DevOps MCP Server running on stdio');
}
