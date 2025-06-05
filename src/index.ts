#!/usr/bin/env node
/**
 * Entry point for the Azure DevOps MCP Server
 */

import { createAzureDevOpsServer } from './server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { AzureDevOpsConfig, TransportProtocol } from './shared/types';
import { AuthenticationMethod } from './shared/auth/auth-factory';
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';

/**
 * Normalize auth method string to a valid AuthenticationMethod enum value
 * in a case-insensitive manner
 *
 * @param authMethodStr The auth method string from environment variable
 * @returns A valid AuthenticationMethod value
 */
export function normalizeAuthMethod(
  authMethodStr?: string,
): AuthenticationMethod {
  if (!authMethodStr) {
    return AuthenticationMethod.AzureIdentity; // Default
  }

  // Convert to lowercase for case-insensitive comparison
  const normalizedMethod = authMethodStr.toLowerCase();

  // Check against known enum values (as lowercase strings)
  if (
    normalizedMethod === AuthenticationMethod.PersonalAccessToken.toLowerCase()
  ) {
    return AuthenticationMethod.PersonalAccessToken;
  } else if (
    normalizedMethod === AuthenticationMethod.AzureIdentity.toLowerCase()
  ) {
    return AuthenticationMethod.AzureIdentity;
  } else if (normalizedMethod === AuthenticationMethod.AzureCli.toLowerCase()) {
    return AuthenticationMethod.AzureCli;
  }

  // If not recognized, log a warning and use the default
  process.stderr.write(
    `WARNING: Unrecognized auth method '${authMethodStr}'. Using default (${AuthenticationMethod.AzureIdentity}).\n`,
  );
  return AuthenticationMethod.AzureIdentity;
}

/**
 * Normalize transport protocol string to a valid TransportMethod enum value
 * in a case-insensitive manner
 */
export function normalizeTransportProtocol(
  transportProtocolStr?: string,
): TransportProtocol {
  const normalizedProtocol = transportProtocolStr?.toLowerCase();

  if (normalizedProtocol === TransportProtocol.Stdio.toLowerCase()) {
    return TransportProtocol.Stdio;
  } else if (normalizedProtocol === TransportProtocol.Http.toLowerCase()) {
    return TransportProtocol.Http;
  }

  process.stderr.write(
    `WARNING: Unrecognized transport protocol '${transportProtocolStr}'. Using default (${TransportProtocol.Stdio}).\n`,
  );
  return TransportProtocol.Stdio;
}

export function normalizeHttpPort(httpPortStr?: string): number {
  const normalizedPort = Number(httpPortStr);

  if (!Number.isInteger(normalizedPort)) {
    process.stderr.write(
      `WARNING: Unrecognized port '${httpPortStr}'. Using default (8000).\n`,
    );
    return 8000;
  }

  return normalizedPort;
}

// Load environment variables
dotenv.config();

function getConfig(): AzureDevOpsConfig {
  // Debug log the environment variables to help diagnose issues
  process.stderr.write(`DEBUG - Environment variables in getConfig():
  AZURE_DEVOPS_ORG_URL: ${process.env.AZURE_DEVOPS_ORG_URL || 'NOT SET'}
  AZURE_DEVOPS_AUTH_METHOD: ${process.env.AZURE_DEVOPS_AUTH_METHOD || 'NOT SET'}
  AZURE_DEVOPS_PAT: ${process.env.AZURE_DEVOPS_PAT ? 'SET (hidden)' : 'NOT SET'}
  AZURE_DEVOPS_DEFAULT_PROJECT: ${process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'NOT SET'}
  AZURE_DEVOPS_API_VERSION: ${process.env.AZURE_DEVOPS_API_VERSION || 'NOT SET'}
  NODE_ENV: ${process.env.NODE_ENV || 'NOT SET'}
  TRANSPORT: ${process.env.TRANSPORT || 'NOT SET'}
  HTTP_PORT: ${process.env.TRANSPORT == 'http' ? process.env.HTTP_PORT : 'NOT USED (use TRANSPORT=http)'}
\n`);

  return {
    organizationUrl: process.env.AZURE_DEVOPS_ORG_URL || '',
    authMethod: normalizeAuthMethod(process.env.AZURE_DEVOPS_AUTH_METHOD),
    personalAccessToken: process.env.AZURE_DEVOPS_PAT,
    defaultProject: process.env.AZURE_DEVOPS_DEFAULT_PROJECT,
    apiVersion: process.env.AZURE_DEVOPS_API_VERSION,
    transport: normalizeTransportProtocol(process.env.TRANSPORT),
    http_port: normalizeHttpPort(process.env.HTTP_PORT),
  };
}

// Set up the Express transport server.
async function connectHttpTransport(server: Server, port: number) {
  const app = express();
  app.use(express.json());

  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          transports[sessionId] = transport;
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
        }
      };

      await server.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -3200,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  });

  const handleSessionRequest = async (
    req: express.Request,
    res: express.Response,
  ) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  };

  app.get('/mcp', handleSessionRequest);
  app.delete('/mcp', handleSessionRequest);

  process.stderr.write(`INFO: Azure DevOPS MCP Server running on :${port}`);
  app.listen(port);
}

async function connectStdioTransport(server: Server) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('Azure DevOps MCP Server running on stdio\n');
}
async function main() {
  try {
    // Create the server with configuration
    const config = getConfig();
    const server = createAzureDevOpsServer(config);

    if (config.transport === TransportProtocol.Http) {
      await connectHttpTransport(server, config.http_port);
    } else {
      await connectStdioTransport(server);
    }
  } catch (error) {
    process.stderr.write(`Error starting server: ${error}\n`);
    process.exit(1);
  }
}

// Start the server when this script is run directly
if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Fatal error in main(): ${error}\n`);
    process.exit(1);
  });
}

// Export the server and related components
export * from './server';
