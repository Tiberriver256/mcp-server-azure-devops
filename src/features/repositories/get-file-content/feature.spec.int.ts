import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { getConnection } from '../../../server.ts';
import { shouldSkipIntegrationTest } from '../../../shared/test/test-helpers.ts';
import { getFileContent } from './feature.ts';
import { GitVersionType } from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import type { AzureDevOpsConfig } from '../../../shared/types/index.ts';
import type { WebApi } from 'azure-devops-node-api';
import { AuthenticationMethod } from '../../../shared/auth/index.ts';
import type { GitItem } from 'azure-devops-node-api/interfaces/GitInterfaces.js';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'getFileContent (Integration)',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    let connection: WebApi;
    let config: AzureDevOpsConfig;
    let projectId: string;
    let repositoryId: string;
    let knownFilePath: string;

    before(
      async () => {
        projectId =
          process.env.AZURE_DEVOPS_TEST_PROJECT_ID ||
          process.env.AZURE_DEVOPS_DEFAULT_PROJECT ||
          '';

        if (!projectId) {
          throw new Error(
            'AZURE_DEVOPS_DEFAULT_PROJECT must be set (or AZURE_DEVOPS_TEST_PROJECT_ID) for this test',
          );
        }

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

        connection = await getConnection(config);

        const gitApi = await connection.getGitApi();

        repositoryId =
          process.env.AZURE_DEVOPS_TEST_REPOSITORY_ID ||
          process.env.AZURE_DEVOPS_DEFAULT_REPOSITORY ||
          '';

        if (!repositoryId) {
          const repos = await gitApi.getRepositories(projectId);
          if (!repos || repos.length === 0 || !repos[0].id) {
            throw new Error(
              'No repositories found. Set AZURE_DEVOPS_DEFAULT_REPOSITORY or AZURE_DEVOPS_TEST_REPOSITORY_ID to run this test.',
            );
          }
          repositoryId = repos[0].id;
        }

        knownFilePath = process.env.AZURE_DEVOPS_TEST_FILE_PATH || '';

        // If no explicit file path, discover a file at repo root
        if (!knownFilePath) {
          const root = await getFileContent(
            connection,
            projectId,
            repositoryId,
            '/',
          );
          if (!root.isDirectory) {
            knownFilePath = '/README.md';
          } else {
            const items = JSON.parse(root.content) as GitItem[];
            const firstFile = items.find((i) => i.path && i.isFolder === false);
            knownFilePath = firstFile?.path || '/README.md';
          }
        }
      },
      { timeout: 30000 },
    );

    void it(
      'should retrieve file content from the default branch',
      { timeout: 30000 },
      async () => {
        const result = await getFileContent(
          connection,
          projectId,
          repositoryId,
          knownFilePath,
        );

        assert.notStrictEqual(result, undefined);
        assert.notStrictEqual(result.content, undefined);
        assert.strictEqual(typeof result.content, 'string');
        assert.strictEqual(result.isDirectory, false);
      },
    );

    void it(
      'should retrieve directory content',
      { timeout: 30000 },
      async () => {
        const result = await getFileContent(
          connection,
          projectId,
          repositoryId,
          '/',
        );

        assert.notStrictEqual(result, undefined);
        assert.notStrictEqual(result.content, undefined);
        assert.strictEqual(result.isDirectory, true);

        const items = JSON.parse(result.content);
        assert.strictEqual(Array.isArray(items), true);
      },
    );

    void it(
      'should handle specific version (branch)',
      { timeout: 30000 },
      async () => {
        const branchName = process.env.AZURE_DEVOPS_TEST_BRANCH || 'main';

        const result = await getFileContent(
          connection,
          projectId,
          repositoryId,
          knownFilePath,
          {
            versionType: GitVersionType.Branch,
            version: branchName,
          },
        );

        assert.notStrictEqual(result, undefined);
        assert.notStrictEqual(result.content, undefined);
        assert.strictEqual(result.isDirectory, false);
      },
    );
  },
);
