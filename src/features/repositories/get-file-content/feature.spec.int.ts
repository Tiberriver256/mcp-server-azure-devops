import { getConnection } from '../../../server';
import { shouldSkipIntegrationTest } from '../../../shared/test/test-helpers';
import { getFileContent } from './feature';
import { GitVersionType } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzureDevOpsConfig } from '../../../shared/types';
import { WebApi } from 'azure-devops-node-api';
import { AuthenticationMethod } from '../../../shared/auth';

// Skip tests if no PAT is available
const hasPat = process.env.AZURE_DEVOPS_PAT && process.env.AZURE_DEVOPS_ORG_URL;
const describeOrSkip = hasPat ? describe : describe.skip;

describeOrSkip('getFileContent (Integration)', () => {
  let connection: WebApi;
  let config: AzureDevOpsConfig;
  let repositoryId: string;
  let projectId: string;
  let knownFilePath: string;

  beforeAll(async () => {
    if (shouldSkipIntegrationTest()) {
      return;
    }

    // Configuration values
    config = {
      organizationUrl: process.env.AZURE_DEVOPS_ORG_URL || '',
      authMethod: AuthenticationMethod.PersonalAccessToken,
      personalAccessToken: process.env.AZURE_DEVOPS_PAT || '',
      defaultProject: process.env.AZURE_DEVOPS_DEFAULT_PROJECT || '',
    };

    // Use a test repository/project - should be defined in .env file
    projectId =
      process.env.AZURE_DEVOPS_TEST_PROJECT_ID ||
      process.env.AZURE_DEVOPS_DEFAULT_PROJECT ||
      '';
    repositoryId = process.env.AZURE_DEVOPS_TEST_REPOSITORY_ID || '';
    knownFilePath = process.env.AZURE_DEVOPS_TEST_FILE_PATH || '/README.md';

    // Get Azure DevOps connection
    connection = await getConnection(config);

    // Skip tests if no repository ID is set
    if (!repositoryId) {
      console.warn('Skipping integration tests: No test repository ID set');
    }
  }, 30000);

  // Skip all tests if integration tests are disabled
  beforeEach(() => {
    if (shouldSkipIntegrationTest()) {
      jest.resetAllMocks();
      return;
    }
  });

  it('should retrieve file content from the default branch', async () => {
    // Skip test if no repository ID or if integration tests are disabled
    if (shouldSkipIntegrationTest() || !repositoryId) {
      return;
    }

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
    // Skip test if no repository ID or if integration tests are disabled
    if (shouldSkipIntegrationTest() || !repositoryId) {
      return;
    }

    // Assume the root directory exists
    const result = await getFileContent(
      connection,
      projectId,
      repositoryId,
      '/',
    );

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.isDirectory).toBe(true);
    // Directory content is returned as JSON string of items
    const items = JSON.parse(result.content);
    expect(Array.isArray(items)).toBe(true);
  }, 30000);

  it('should handle specific version (branch)', async () => {
    // Skip test if no repository ID or if integration tests are disabled
    if (shouldSkipIntegrationTest() || !repositoryId) {
      return;
    }

    // Use main/master branch
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
