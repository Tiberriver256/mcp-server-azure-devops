import { Server as NodeHttpServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { createAzureDevOpsServer } from '../server';
import { MCP_HTTP_ENDPOINT } from './config';
import { startHttpTransportServer } from './http';

describe('HTTP transport', () => {
  const baseConfig = {
    organizationUrl: 'https://dev.azure.com/example-org',
  };

  async function startServer() {
    const httpServer = await startHttpTransportServer(
      () => createAzureDevOpsServer(baseConfig),
      {
        transport: 'http',
        host: '127.0.0.1',
        port: 0,
        endpoint: MCP_HTTP_ENDPOINT,
      },
    );

    const address = httpServer.address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}${MCP_HTTP_ENDPOINT}`;

    return {
      httpServer,
      url,
    };
  }

  async function stopServer(server: NodeHttpServer) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  it('returns 405 for GET requests to /mcp', async () => {
    const { httpServer, url } = await startServer();

    try {
      const response = await fetch(url);

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('POST');
    } finally {
      await stopServer(httpServer);
    }
  });

  it('accepts an initialize request over HTTP POST', async () => {
    const { httpServer, url } = await startServer();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: {
              name: 'http-transport-test',
              version: '1.0.0',
            },
          },
        }),
      });

      const body = (await response.json()) as {
        result?: {
          serverInfo?: {
            name?: string;
          };
        };
      };

      expect(response.status).toBe(200);
      expect(body.result?.serverInfo?.name).toBe('azure-devops-mcp');
    } finally {
      await stopServer(httpServer);
    }
  });
});
