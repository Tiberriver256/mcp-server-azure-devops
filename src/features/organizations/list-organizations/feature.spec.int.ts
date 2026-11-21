import { listOrganizations } from './feature';
import { AzureDevOpsAuthenticationError } from '@/shared/errors';
import {
  getTestConfig,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('listOrganizations integration', () => {
  test('should list organizations accessible to the authenticated user', async () => {
    // Get test configuration
    const config = getTestConfig();
    if (!config) {
      throw new Error(
        'Configuration should be available when test is not skipped',
      );
    }

    // Act - make an actual API call to Azure DevOps
    let result;
    try {
      result = await listOrganizations(config);
    } catch (error) {
      if (error instanceof AzureDevOpsAuthenticationError) {
        console.warn(
          `WARNING: Skipping listOrganizations integration assertions (${error.message}). ` +
            'The VSSPS profile/accounts endpoint requires an "All accessible organizations" PAT, which is intentionally not required in CI.',
        );
        return;
      }
      throw error;
    }

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
