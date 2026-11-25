import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join } from 'path';
import type { Organization } from './features/organizations/types.ts';
import { loadEnvFile } from './shared/config/load-env.ts';
import { getTextContent } from './shared/test/text-content.ts';

loadEnvFile();

const hasOrgUrl = Boolean(process.env.AZURE_DEVOPS_ORG_URL);
const authMethodForSkip = (process.env.AZURE_DEVOPS_AUTH_METHOD || 'pat')
  .trim()
  .toLowerCase();
const hasPat = Boolean(process.env.AZURE_DEVOPS_PAT);
const skipReason = !hasOrgUrl
  ? 'AZURE_DEVOPS_ORG_URL is not set in the environment'
  : authMethodForSkip === 'pat' && !hasPat
    ? 'AZURE_DEVOPS_PAT is not set for PAT authentication'
    : false;

void describe('Azure DevOps MCP Server E2E Tests', { skip: skipReason }, () => {
  let client: Client;
  let transport: StdioClientTransport;

  before(async () => {
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

  after(async () => {
    if (transport) {
      await transport.close();
    }
    if (client) {
      await client.close();
    }
  });

  void describe('Parameterless Tools', () => {
    void test('should call list_organizations without arguments', async (t) => {
      const result = await client.callTool({
        name: 'list_organizations',
        arguments: {},
      });

      assert.notStrictEqual(result, undefined);
      const resultText = getTextContent(result.content);
      if (result.isError && /^Authentication Failed:/i.test(resultText)) {
        console.warn(
          `WARNING: Skipping list_organizations E2E assertions (${resultText}). ` +
            'The VSSPS profile/accounts endpoint requires an "All accessible organizations" PAT, which is intentionally not required in CI.',
        );
        t.skip(
          'VSSPS profile/accounts endpoint requires an "All accessible organizations" PAT',
        );
        return;
      }

      const organizations: Organization[] = JSON.parse(resultText);
      assert.strictEqual(Array.isArray(organizations), true);
      if (organizations.length > 0) {
        const firstOrg = organizations[0];
        assert.ok(Object.hasOwn(firstOrg, 'id'));
        assert.ok(Object.hasOwn(firstOrg, 'name'));
        assert.ok(Object.hasOwn(firstOrg, 'url'));
      }
    });

    void test('should call get_me without arguments', async () => {
      const result = await client.callTool({
        name: 'get_me',
        arguments: {},
      });

      const userInfo = JSON.parse(getTextContent(result.content));
      assert.ok(Object.hasOwn(userInfo, 'id'));
      assert.ok(Object.hasOwn(userInfo, 'displayName'));
    });
  });

  void describe('Tools with Optional Parameters', () => {
    void test('should call list_projects without arguments', async () => {
      const result = await client.callTool({
        name: 'list_projects',
        arguments: {},
      });

      const projects = JSON.parse(getTextContent(result.content));
      assert.strictEqual(Array.isArray(projects), true);
    });

    void test('should call get_project without arguments', async () => {
      const result = await client.callTool({
        name: 'get_project',
        arguments: {},
      });

      const project = JSON.parse(getTextContent(result.content));
      assert.ok(Object.hasOwn(project, 'id'));
      assert.ok(Object.hasOwn(project, 'name'));
    });

    void test('should call list_repositories without arguments', async () => {
      const result = await client.callTool({
        name: 'list_repositories',
        arguments: {},
      });

      const repositories = JSON.parse(getTextContent(result.content));
      assert.strictEqual(Array.isArray(repositories), true);
    });
  });
});
