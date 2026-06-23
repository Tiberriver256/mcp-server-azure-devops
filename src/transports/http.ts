import {
  IncomingMessage,
  Server as HttpServer,
  ServerResponse,
} from 'node:http';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { HttpTransportConfig } from './config';

type ServerFactory = () => McpServer;

const INTERNAL_SERVER_ERROR_RESPONSE = {
  jsonrpc: '2.0',
  error: {
    code: -32603,
    message: 'Internal server error',
  },
  id: null,
};

const METHOD_NOT_ALLOWED_RESPONSE = {
  jsonrpc: '2.0',
  error: {
    code: -32000,
    message:
      'Method not allowed. This HTTP transport only supports POST requests to /mcp.',
  },
  id: null,
};

function safeLog(message: string) {
  process.stderr.write(`${message}\n`);
}

function writeJsonResponse(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');

  Object.entries(headers).forEach(([key, value]) => {
    response.setHeader(key, value);
  });

  response.end(JSON.stringify(body));
}

function isLoopbackHost(host: string): boolean {
  return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host);
}

async function closeResources(
  server: McpServer,
  transport: StreamableHTTPServerTransport,
): Promise<void> {
  await Promise.allSettled([server.close(), transport.close()]);
}

export function createHttpApp(
  createServer: ServerFactory,
  options: HttpTransportConfig,
) {
  const app = createMcpExpressApp({ host: options.host });

  app.post(
    options.endpoint,
    async (req: IncomingMessage, res: ServerResponse) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      const server = createServer();
      let resourcesClosed = false;

      const finalize = async () => {
        if (resourcesClosed) {
          return;
        }

        resourcesClosed = true;
        await closeResources(server, transport);
      };

      res.on('close', () => {
        void finalize();
      });

      try {
        await server.connect(transport);
        await transport.handleRequest(
          req,
          res,
          (req as IncomingMessage & { body?: unknown }).body,
        );
      } catch (error) {
        safeLog(`Error handling MCP HTTP request: ${error}`);
        await finalize();

        if (!res.headersSent) {
          writeJsonResponse(res, 500, INTERNAL_SERVER_ERROR_RESPONSE);
        }
      }
    },
  );

  app.all(options.endpoint, (_req: IncomingMessage, res: ServerResponse) => {
    writeJsonResponse(res, 405, METHOD_NOT_ALLOWED_RESPONSE, {
      Allow: 'POST',
    });
  });

  return app;
}

export async function startHttpTransportServer(
  createServer: ServerFactory,
  options: HttpTransportConfig,
): Promise<HttpServer> {
  const app = createHttpApp(createServer, options);

  const server = await new Promise<HttpServer>((resolve, reject) => {
    const httpServer = app.listen(options.port, options.host, () => {
      safeLog(
        `Azure DevOps MCP Server running on HTTP http://${options.host}:${options.port}${options.endpoint}`,
      );

      if (!isLoopbackHost(options.host)) {
        safeLog(
          'WARNING: HTTP transport is bound to a non-loopback host. Protect this server with a reverse proxy or trusted network boundary.',
        );
      }

      resolve(httpServer);
    });

    httpServer.once('error', reject);
  });

  return server;
}

export async function runHttpTransport(
  createServer: ServerFactory,
  options: HttpTransportConfig,
): Promise<HttpServer> {
  const server = await startHttpTransportServer(createServer, options);
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    safeLog(`Received ${signal}. Shutting down HTTP transport...`);
    server.close((error) => {
      if (error) {
        safeLog(`Error while shutting down HTTP transport: ${error}`);
        process.exitCode = 1;
      } else {
        safeLog('HTTP transport stopped');
      }
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}
