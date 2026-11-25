import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { getConnection } from '../../../server.ts';
import { shouldSkipIntegrationTest } from '../../../shared/test/test-helpers.ts';
import { getAllRepositoriesTree } from './feature.ts';
import type { AzureDevOpsConfig } from '../../../shared/types/index.ts';
import type { WebApi } from 'azure-devops-node-api';
import { AuthenticationMethod } from '../../../shared/auth/index.ts';

const shouldSkip = shouldSkipIntegrationTest();
const projectId =
  process.env.AZURE_DEVOPS_TEST_PROJECT_ID ||
  process.env.AZURE_DEVOPS_DEFAULT_PROJECT ||
  '';
const skipReason = shouldSkip
  ? 'No real Azure DevOps connection available'
  : !projectId
    ? 'AZURE_DEVOPS_TEST_PROJECT_ID or AZURE_DEVOPS_DEFAULT_PROJECT is not set'
    : false;

void describe(
  'getAllRepositoriesTree (Integration)',
  { skip: skipReason },
  () => {
    let connection: WebApi;
    let config: AzureDevOpsConfig;
    let orgId: string;

    before(
      async () => {
        // Configuration values
        config = {
          organizationUrl: process.env.AZURE_DEVOPS_ORG_URL || '',
          authMethod: AuthenticationMethod.PersonalAccessToken,
          personalAccessToken: process.env.AZURE_DEVOPS_PAT || '',
          defaultProject: process.env.AZURE_DEVOPS_DEFAULT_PROJECT || '',
        };
        if (!config.organizationUrl || !config.personalAccessToken) {
          throw new Error(
            'Azure DevOps credentials are required for this test',
          );
        }

        // Extract organization ID from URL
        const url = new URL(config.organizationUrl);
        const pathParts = url.pathname.split('/').filter(Boolean);
        orgId = pathParts[0] || '';

        // Get Azure DevOps connection
        connection = await getConnection(config);
      },
      { timeout: 30000 },
    );

    void it(
      'should retrieve tree for all repositories with maximum depth (default)',
      { timeout: 60000 }, // Longer timeout because max depth can take time
      async () => {
        const result = await getAllRepositoriesTree(connection, {
          organizationId: orgId,
          projectId: projectId,
          // depth defaults to 0 (unlimited)
        });

        assert.notStrictEqual(result, undefined);
        assert.notStrictEqual(result.repositories, undefined);
        assert.strictEqual(Array.isArray(result.repositories), true);
        assert.ok(result.repositories.length > 0);

        // Check that at least one repository has a tree
        const repoWithTree = result.repositories.find((r) => r.tree.length > 0);
        assert.notStrictEqual(repoWithTree, undefined);

        if (repoWithTree) {
          // Verify that deep nesting is included (finding items with level > 2)
          // Note: This might not always be true depending on repos, but there should be at least some nested items
          const deepItems = repoWithTree.tree.filter((item) => item.level > 2);
          assert.ok(deepItems.length > 0);

          // Verify stats are correct
          assert.ok(repoWithTree.stats.directories >= 0);
          assert.ok(repoWithTree.stats.files > 0);
          const dirCount = repoWithTree.tree.filter(
            (item) => item.isFolder,
          ).length;
          const fileCount = repoWithTree.tree.filter(
            (item) => !item.isFolder,
          ).length;
          assert.strictEqual(repoWithTree.stats.directories, dirCount);
          assert.strictEqual(repoWithTree.stats.files, fileCount);
        }
      },
    );

    void it(
      'should retrieve tree for all repositories with limited depth (depth=1)',
      { timeout: 30000 },
      async () => {
        const result = await getAllRepositoriesTree(connection, {
          organizationId: orgId,
          projectId: projectId,
          depth: 1, // Only 1 level deep
        });

        assert.notStrictEqual(result, undefined);
        assert.notStrictEqual(result.repositories, undefined);
        assert.strictEqual(Array.isArray(result.repositories), true);
        assert.ok(result.repositories.length > 0);

        // Check that at least one repository has a tree
        const repoWithTree = result.repositories.find((r) => r.tree.length > 0);
        assert.notStrictEqual(repoWithTree, undefined);

        if (repoWithTree) {
          // Verify that only shallow nesting is included (all items should have level = 1)
          const allItemsLevel1 = repoWithTree.tree.every(
            (item) => item.level === 1,
          );
          assert.strictEqual(allItemsLevel1, true);

          // Verify stats are correct
          assert.ok(repoWithTree.stats.directories >= 0);
          assert.ok(repoWithTree.stats.files >= 0);
          const dirCount = repoWithTree.tree.filter(
            (item) => item.isFolder,
          ).length;
          const fileCount = repoWithTree.tree.filter(
            (item) => !item.isFolder,
          ).length;
          assert.strictEqual(repoWithTree.stats.directories, dirCount);
          assert.strictEqual(repoWithTree.stats.files, fileCount);
        }
      },
    );
  },
);
