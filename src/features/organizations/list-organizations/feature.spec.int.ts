import { listOrganizations } from './feature';
import {
  getTestConfig,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';

describe('listOrganizations integration', () => {
  test('should list organizations accessible to the authenticated user', async () => {
    // Skip if no credentials are available
    if (shouldSkipIntegrationTest()) {
      return;
    }

    // Get test configuration
    const config = getTestConfig();
    if (!config) {
      throw new Error(
        'Configuration should be available when test is not skipped',
      );
    }

    // Act - make an actual API call to Azure DevOps
    const result = await listOrganizations(config);

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    // Check structure of returned organizations
    const firstOrg = result[0];
    expect(firstOrg.id).toBeDefined();
    expect(firstOrg.name).toBeDefined();
    expect(firstOrg.url).toBeDefined();

    // The organization URL in the config should match one of the returned organizations
    // Extract the organization name from the URL
    const orgUrlParts = config.organizationUrl.split('/');
    const configOrgName = orgUrlParts[orgUrlParts.length - 1];

    // Find matching organization
    const matchingOrg = result.find(
      (org) => org.name.toLowerCase() === configOrgName.toLowerCase(),
    );
    expect(matchingOrg).toBeDefined();
  });
});
