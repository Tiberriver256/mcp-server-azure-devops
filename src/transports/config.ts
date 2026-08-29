import { AzureDevOpsValidationError } from '../shared/errors';

export const DEFAULT_MCP_TRANSPORT = 'stdio';
export const DEFAULT_HTTP_HOST = '127.0.0.1';
export const DEFAULT_HTTP_PORT = 3000;
export const MCP_HTTP_ENDPOINT = '/mcp';

export type McpTransportKind = 'stdio' | 'http';

export interface StdioTransportConfig {
  transport: 'stdio';
}

export interface HttpTransportConfig {
  transport: 'http';
  host: string;
  port: number;
  endpoint: string;
}

export type McpTransportConfig = StdioTransportConfig | HttpTransportConfig;

function getCliOptionValue(
  args: string[],
  optionName: string,
): string | undefined {
  const normalizedPrefix = `--${optionName}=`;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument.startsWith(normalizedPrefix)) {
      return argument.slice(normalizedPrefix.length);
    }

    if (argument === `--${optionName}`) {
      return args[index + 1];
    }
  }

  return undefined;
}

function getConfiguredValue(
  args: string[],
  env: NodeJS.ProcessEnv,
  optionName: string,
  envName: string,
): string | undefined {
  const cliValue = getCliOptionValue(args, optionName);

  if (cliValue !== undefined) {
    return cliValue;
  }

  return env[envName];
}

export function normalizeTransport(transportValue?: string): McpTransportKind {
  if (!transportValue) {
    return DEFAULT_MCP_TRANSPORT;
  }

  const normalizedTransport = transportValue.toLowerCase();

  if (normalizedTransport === 'stdio' || normalizedTransport === 'http') {
    return normalizedTransport;
  }

  throw new AzureDevOpsValidationError(
    `Invalid MCP transport '${transportValue}'. Expected 'stdio' or 'http'.`,
  );
}

export function normalizeHttpHost(hostValue?: string): string {
  if (!hostValue) {
    return DEFAULT_HTTP_HOST;
  }

  const trimmedHost = hostValue.trim();

  if (!trimmedHost) {
    throw new AzureDevOpsValidationError(
      'Invalid MCP host. The value must not be empty.',
    );
  }

  return trimmedHost;
}

export function normalizeHttpPort(portValue?: string): number {
  if (!portValue) {
    return DEFAULT_HTTP_PORT;
  }

  if (!/^\d+$/.test(portValue)) {
    throw new AzureDevOpsValidationError(
      `Invalid MCP port '${portValue}'. Expected an integer between 1 and 65535.`,
    );
  }

  const parsedPort = Number.parseInt(portValue, 10);

  if (parsedPort < 1 || parsedPort > 65535) {
    throw new AzureDevOpsValidationError(
      `Invalid MCP port '${portValue}'. Expected an integer between 1 and 65535.`,
    );
  }

  return parsedPort;
}

export function getTransportConfig(
  args: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): McpTransportConfig {
  const transport = normalizeTransport(
    getConfiguredValue(args, env, 'transport', 'MCP_TRANSPORT'),
  );

  if (transport === 'stdio') {
    return { transport };
  }

  return {
    transport,
    host: normalizeHttpHost(getConfiguredValue(args, env, 'host', 'MCP_HOST')),
    port: normalizeHttpPort(getConfiguredValue(args, env, 'port', 'MCP_PORT')),
    endpoint: MCP_HTTP_ENDPOINT,
  };
}
