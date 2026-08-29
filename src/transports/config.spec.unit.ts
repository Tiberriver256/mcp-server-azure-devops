import {
  DEFAULT_HTTP_HOST,
  DEFAULT_HTTP_PORT,
  getTransportConfig,
  normalizeHttpPort,
  normalizeTransport,
} from './config';
import { AzureDevOpsValidationError } from '../shared/errors';

describe('transport config', () => {
  it('defaults to stdio when no transport is configured', () => {
    const result = getTransportConfig([], {});

    expect(result).toEqual({ transport: 'stdio' });
  });

  it('uses explicit HTTP transport from CLI arguments', () => {
    const result = getTransportConfig(
      ['--transport', 'http', '--host', '0.0.0.0', '--port', '8080'],
      {},
    );

    expect(result).toEqual({
      transport: 'http',
      host: '0.0.0.0',
      port: 8080,
      endpoint: '/mcp',
    });
  });

  it('uses HTTP defaults when enabled from environment variables', () => {
    const result = getTransportConfig([], {
      MCP_TRANSPORT: 'http',
    });

    expect(result).toEqual({
      transport: 'http',
      host: DEFAULT_HTTP_HOST,
      port: DEFAULT_HTTP_PORT,
      endpoint: '/mcp',
    });
  });

  it('prefers CLI values over environment variables', () => {
    const result = getTransportConfig(
      ['--transport=http', '--host=127.0.0.1', '--port=9090'],
      {
        MCP_TRANSPORT: 'stdio',
        MCP_HOST: '0.0.0.0',
        MCP_PORT: '8080',
      },
    );

    expect(result).toEqual({
      transport: 'http',
      host: '127.0.0.1',
      port: 9090,
      endpoint: '/mcp',
    });
  });

  it('rejects an unsupported transport value', () => {
    expect(() => normalizeTransport('sse')).toThrow(AzureDevOpsValidationError);
  });

  it('rejects invalid HTTP port values', () => {
    expect(() => normalizeHttpPort('0')).toThrow(AzureDevOpsValidationError);
    expect(() => normalizeHttpPort('65536')).toThrow(
      AzureDevOpsValidationError,
    );
    expect(() => normalizeHttpPort('abc')).toThrow(AzureDevOpsValidationError);
  });
});
