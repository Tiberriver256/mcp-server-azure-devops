import { getConnection } from '../../../server';
import { shouldSkipIntegrationTest } from '../../../shared/test/test-helpers';
import { getFileContent } from './feature';
import { GitVersionType } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzureDevOpsConfig } from '../../../shared/types';
import { WebApi } from 'azure-devops-node-api';
import { AuthenticationMethod } from '../../../shared/auth';
import type { GitItem } from 'azure-devops-node-api/interfaces/GitInterfaces';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('getFileContent (Integration)', () => {
  let connection: WebApi;
  let config: AzureDevOpsConfig;
  let projectId: string;
  let repositoryId: string;
  let knownFilePath: string;

  beforeAll(async () => {
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
      throw new Error('Azure DevOps credentials are required for this test');
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
  }, 30000);

  it('should retrieve file content from the default branch', async () => {
    const result = await getFileContent(
      connection,
      projectId,
      repositoryId,
      knownFilePath,
    );

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(typeof result.content).toBe('string');
    expect(result.isDirectory).toBe(false);
  }, 30000);

  it('should retrieve directory content', async () => {
    const result = await getFileContent(
      connection,
      projectId,
      repositoryId,
      '/',
    );

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.isDirectory).toBe(true);

    const items = JSON.parse(result.content);
    expect(Array.isArray(items)).toBe(true);
  }, 30000);

  it('should handle specific version (branch)', async () => {
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

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.isDirectory).toBe(false);
  }, 30000);
});
