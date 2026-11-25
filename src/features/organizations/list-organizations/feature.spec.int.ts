import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { listOrganizations } from './feature.ts';
import { AzureDevOpsAuthenticationError } from '../../../shared/errors/index.ts';
import {
  getTestConfig,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'listOrganizations integration',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    void test('should list organizations accessible to the authenticated user', async (t) => {
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
          t.skip(
            'VSSPS profile/accounts endpoint requires an "All accessible organizations" PAT',
          );
          return;
        }
        throw error;
      }

      // Assert on the actual response
      assert.notStrictEqual(result, undefined);
      assert.strictEqual(Array.isArray(result), true);
      assert.ok(result.length > 0);

      // Check structure of returned organizations
      const firstOrg = result[0];
      assert.notStrictEqual(firstOrg.id, undefined);
      assert.notStrictEqual(firstOrg.name, undefined);
      assert.notStrictEqual(firstOrg.url, undefined);

      // The organization URL in the config should match one of the returned organizations
      // Extract the organization name from the URL
      const orgUrlParts = config.organizationUrl.split('/');
      const configOrgName = orgUrlParts[orgUrlParts.length - 1];

      // Find matching organization
      const matchingOrg = result.find(
        (org) => org.name.toLowerCase() === configOrgName.toLowerCase(),
      );
      assert.notStrictEqual(matchingOrg, undefined);
    });
  },
);
