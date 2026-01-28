import { WebApi } from 'azure-devops-node-api';
import { getRepository } from './feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('getRepository integration', () => {
  let connection: WebApi;
  let projectName: string;

  beforeAll(async () => {
    // Get a real connection using environment variables
    const testConnection = await getTestConnection();
    if (!testConnection) {
      throw new Error(
        'Connection should be available when integration tests are enabled',
      );
    }
    connection = testConnection;
    projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
  });

  test('should retrieve a real repository from Azure DevOps', async () => {
    // First, get a list of repos to find one to test with
    const gitApi = await connection.getGitApi();
    const repos = await gitApi.getRepositories(projectName);

    expect(repos.length).toBeGreaterThan(0);

    // Use the first repo as a test subject
    const testRepo = repos[0];

    // Act - make an actual API call to Azure DevOps
    const result = await getRepository(
      connection,
      projectName,
      testRepo.name || testRepo.id || '',
    );

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.id).toBe(testRepo.id);
    expect(result.name).toBe(testRepo.name);
    expect(result.project).toBeDefined();
    if (result.project) {
      expect(result.project.name).toBe(projectName);
    }
  });

  test('should throw error when repository is not found', async () => {
    // Use a non-existent repository name
    const nonExistentRepoName = 'non-existent-repo-' + Date.now();

    // Act & Assert - should throw an error for non-existent repo
    await expect(
      getRepository(connection, projectName, nonExistentRepoName),
    ).rejects.toThrow(/not found|Failed to get repository/);
  });
});
