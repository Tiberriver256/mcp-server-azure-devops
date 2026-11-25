import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { createWiki } from './feature.ts';
import { WikiType } from '../schemas.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';
import { getWikis } from '../get-wikis/feature.ts';
import { AzureDevOpsError } from '../../../shared/errors/index.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'createWiki (Integration)',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    let connection: WebApi;
    let projectName: string;

    before(async () => {
      const testConnection = await getTestConnection();
      if (!testConnection) {
        throw new Error(
          'Connection should be available when integration tests are enabled',
        );
      }
      connection = testConnection;

      projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || '';
      if (!projectName) {
        throw new Error(
          'AZURE_DEVOPS_DEFAULT_PROJECT must be set for this test',
        );
      }
    });

    void test(
      'should create a project wiki or report that it already exists',
      { timeout: 60000 },
      async () => {
        const existing = await getWikis(connection, { projectId: projectName });
        const expectedProjectWikiName = `${projectName}.wiki`;
        const hasProjectWiki = existing.some(
          (w) => w.name === expectedProjectWikiName,
        );

        const options = {
          name: `${projectName}.wiki`,
          projectId: projectName,
          type: WikiType.ProjectWiki,
        };

        if (hasProjectWiki) {
          await assert.rejects(
            () => createWiki(connection, options),
            AzureDevOpsError,
          );
        } else {
          const wiki = await createWiki(connection, options);

          assert.notStrictEqual(wiki, undefined);
          assert.notStrictEqual(wiki.projectId, undefined);
          assert.strictEqual(String(wiki.type), 'projectWiki');
        }
      },
    );
  },
);
