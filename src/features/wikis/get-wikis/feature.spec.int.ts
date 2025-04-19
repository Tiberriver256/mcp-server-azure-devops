import { WebApi } from 'azure-devops-node-api';
import { getWikis } from './feature';
import { getConnection } from '../../../server';
import { AzureDevOpsConfig } from '../../../shared/types';
import { AuthenticationMethod } from '../../../shared/auth';

// Skip tests if not in integration test environment
const runTests = process.env.RUN_INTEGRATION_TESTS === 'true';

// These tests require a valid Azure DevOps connection
// They are skipped by default and only run when RUN_INTEGRATION_TESTS is set
(runTests ? describe : describe.skip)('getWikis (Integration)', () => {
  let connection: WebApi;
  const projectId = process.env.AZURE_DEVOPS_TEST_PROJECT || '';

  beforeAll(async () => {
    // Skip setup if tests are skipped
    if (!runTests) return;

    // Ensure we have required environment variables
    if (!process.env.AZURE_DEVOPS_ORG_URL) {
      throw new Error('AZURE_DEVOPS_ORG_URL environment variable is required');
    }

    if (!projectId) {
      throw new Error(
        'AZURE_DEVOPS_TEST_PROJECT environment variable is required',
      );
    }

    // Create connection
    const config: AzureDevOpsConfig = {
      organizationUrl: process.env.AZURE_DEVOPS_ORG_URL,
      authMethod:
        (process.env.AZURE_DEVOPS_AUTH_METHOD as AuthenticationMethod) ||
        AuthenticationMethod.PersonalAccessToken,
      personalAccessToken: process.env.AZURE_DEVOPS_PAT,
    };

    connection = await getConnection(config);
  }, 30000);

  it('should get wikis from a project', async () => {
    // Skip if tests are skipped
    if (!runTests) return;

    const result = await getWikis(connection, { projectId });

    // Verify the result structure (even if no wikis exist)
    expect(Array.isArray(result)).toBe(true);

    // If there are wikis, verify their structure

    const firstWiki = result[0];
    expect(firstWiki.id).toBeDefined();
    expect(firstWiki.name).toBeDefined();
    expect(firstWiki.url).toBeDefined();
  }, 30000);

  it('should get wikis from the organization when projectId is not provided', async () => {
    // Skip if tests are skipped
    if (!runTests) return;

    const result = await getWikis(connection, {});

    // Verify the result structure
    expect(Array.isArray(result)).toBe(true);

    // Organization-level query should typically return more wikis or the same
    // number as a project-level query, unless the project has no wikis

    const firstWiki = result[0];
    expect(firstWiki.id).toBeDefined();
    expect(firstWiki.name).toBeDefined();
    expect(firstWiki.url).toBeDefined();
  }, 30000);
});
