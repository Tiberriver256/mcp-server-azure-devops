import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join } from 'path';
import type { Organization } from './features/organizations/types';
import { loadEnvFile } from './shared/config/load-env';
import { getTextContent } from '@/shared/test/text-content';

loadEnvFile();

describe('Azure DevOps MCP Server E2E Tests', () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    const serverPath = join(process.cwd(), 'dist', 'index.js');

    const orgUrl = process.env.AZURE_DEVOPS_ORG_URL || '';
    const pat = process.env.AZURE_DEVOPS_PAT || '';
    const defaultProject = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || '';
    const authMethod = process.env.AZURE_DEVOPS_AUTH_METHOD || 'pat';

    if (!orgUrl) {
      throw new Error(
        'Cannot start server: AZURE_DEVOPS_ORG_URL is not set in the environment',
      );
    }

    const childEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        childEnv[key] = value;
      }
    }
    childEnv.NODE_ENV = 'test';
    childEnv.AZURE_DEVOPS_ORG_URL = orgUrl;
    childEnv.AZURE_DEVOPS_PAT = pat;
    childEnv.AZURE_DEVOPS_DEFAULT_PROJECT = defaultProject;
    childEnv.AZURE_DEVOPS_AUTH_METHOD = authMethod;

    transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: childEnv,
    });

    client = new Client(
      {
        name: 'e2e-test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      },
    );

    await client.connect(transport);
  });

  afterAll(async () => {
    if (transport) {
      await transport.close();
    }
    if (client) {
      await client.close();
    }
  });

  describe('Parameterless Tools', () => {
    test('should call list_organizations without arguments', async () => {
      const result = await client.callTool({
        name: 'list_organizations',
        arguments: {},
      });

      expect(result).toBeDefined();
      const resultText = getTextContent(result.content);
      if (result.isError && /^Authentication Failed:/i.test(resultText)) {
        console.warn(
          `WARNING: Skipping list_organizations E2E assertions (${resultText}). ` +
            'The VSSPS profile/accounts endpoint requires an "All accessible organizations" PAT, which is intentionally not required in CI.',
        );
        return;
      }

      const organizations: Organization[] = JSON.parse(resultText);
      expect(Array.isArray(organizations)).toBe(true);
      if (organizations.length > 0) {
        const firstOrg = organizations[0];
        expect(firstOrg).toHaveProperty('id');
        expect(firstOrg).toHaveProperty('name');
        expect(firstOrg).toHaveProperty('url');
      }
    });

    test('should call get_me without arguments', async () => {
      const result = await client.callTool({
        name: 'get_me',
        arguments: {},
      });

      const userInfo = JSON.parse(getTextContent(result.content));
      expect(userInfo).toHaveProperty('id');
      expect(userInfo).toHaveProperty('displayName');
    });
  });

  describe('Tools with Optional Parameters', () => {
    test('should call list_projects without arguments', async () => {
      const result = await client.callTool({
        name: 'list_projects',
        arguments: {},
      });

      const projects = JSON.parse(getTextContent(result.content));
      expect(Array.isArray(projects)).toBe(true);
    });

    test('should call get_project without arguments', async () => {
      const result = await client.callTool({
        name: 'get_project',
        arguments: {},
      });

      const project = JSON.parse(getTextContent(result.content));
      expect(project).toHaveProperty('id');
      expect(project).toHaveProperty('name');
    });

    test('should call list_repositories without arguments', async () => {
      const result = await client.callTool({
        name: 'list_repositories',
        arguments: {},
      });

      const repositories = JSON.parse(getTextContent(result.content));
      expect(Array.isArray(repositories)).toBe(true);
    });
  });
});
