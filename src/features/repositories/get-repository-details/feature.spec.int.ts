import { WebApi } from 'azure-devops-node-api';
import { getRepositoryDetails } from './feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';

describe('getRepositoryDetails integration', () => {
  let connection: WebApi | null = null;
  let projectName: string;

  beforeAll(async () => {
    // Get a real connection using environment variables
    connection = await getTestConnection();
    projectName = process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
  });

  test('should retrieve repository details from Azure DevOps', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      return;
    }

    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error(
        'Connection should be available when test is not skipped',
      );
    }

    // First, get a list of repos to find one to test with
    const gitApi = await connection.getGitApi();
    const repos = await gitApi.getRepositories(projectName);

    // Skip if no repos are available
    if (!repos || repos.length === 0) {
      console.log('Skipping test: No repositories available in the project');
      return;
    }

    // Use the first repo as a test subject
    const testRepo = repos[0];

    // Act - make an actual API call to Azure DevOps
    const result = await getRepositoryDetails(connection, {
      projectId: projectName,
      repositoryId: testRepo.name || testRepo.id || '',
    });

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.repository).toBeDefined();
    expect(result.repository.id).toBe(testRepo.id);
    expect(result.repository.name).toBe(testRepo.name);
    expect(result.repository.project).toBeDefined();
    if (result.repository.project) {
      expect(result.repository.project.name).toBe(projectName);
    }
  });

  test('should retrieve repository details with statistics', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      return;
    }

    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error(
        'Connection should be available when test is not skipped',
      );
    }

    // First, get a list of repos to find one to test with
    const gitApi = await connection.getGitApi();
    const repos = await gitApi.getRepositories(projectName);

    // Skip if no repos are available
    if (!repos || repos.length === 0) {
      console.log('Skipping test: No repositories available in the project');
      return;
    }

    // Use the first repo as a test subject
    const testRepo = repos[0];

    // Act - make an actual API call to Azure DevOps
    const result = await getRepositoryDetails(connection, {
      projectId: projectName,
      repositoryId: testRepo.name || testRepo.id || '',
      includeStatistics: true,
    });

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.repository).toBeDefined();
    expect(result.repository.id).toBe(testRepo.id);
    expect(result.statistics).toBeDefined();
    expect(Array.isArray(result.statistics?.branches)).toBe(true);
  });

  test('should retrieve repository details with refs', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      return;
    }

    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error(
        'Connection should be available when test is not skipped',
      );
    }

    // First, get a list of repos to find one to test with
    const gitApi = await connection.getGitApi();
    const repos = await gitApi.getRepositories(projectName);

    // Skip if no repos are available
    if (!repos || repos.length === 0) {
      console.log('Skipping test: No repositories available in the project');
      return;
    }

    // Use the first repo as a test subject
    const testRepo = repos[0];

    // Act - make an actual API call to Azure DevOps
    const result = await getRepositoryDetails(connection, {
      projectId: projectName,
      repositoryId: testRepo.name || testRepo.id || '',
      includeRefs: true,
    });

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.repository).toBeDefined();
    expect(result.repository.id).toBe(testRepo.id);
    expect(result.refs).toBeDefined();
    expect(result.refs?.value).toBeDefined();
    expect(Array.isArray(result.refs?.value)).toBe(true);
    expect(typeof result.refs?.count).toBe('number');
  });

  test('should retrieve repository details with refs filtered by heads/', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      return;
    }

    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error(
        'Connection should be available when test is not skipped',
      );
    }

    // First, get a list of repos to find one to test with
    const gitApi = await connection.getGitApi();
    const repos = await gitApi.getRepositories(projectName);

    // Skip if no repos are available
    if (!repos || repos.length === 0) {
      console.log('Skipping test: No repositories available in the project');
      return;
    }

    // Use the first repo as a test subject
    const testRepo = repos[0];

    // Act - make an actual API call to Azure DevOps
    const result = await getRepositoryDetails(connection, {
      projectId: projectName,
      repositoryId: testRepo.name || testRepo.id || '',
      includeRefs: true,
      refFilter: 'heads/',
    });

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.repository).toBeDefined();
    expect(result.refs).toBeDefined();
    expect(result.refs?.value).toBeDefined();

    // All refs should start with refs/heads/
    if (result.refs && result.refs.value.length > 0) {
      result.refs.value.forEach((ref) => {
        expect(ref.name).toMatch(/^refs\/heads\//);
      });
    }
  });

  test('should throw error when repository is not found', async () => {
    // Skip if no connection is available
    if (shouldSkipIntegrationTest()) {
      return;
    }

    // This connection must be available if we didn't skip
    if (!connection) {
      throw new Error(
        'Connection should be available when test is not skipped',
      );
    }

    // Use a non-existent repository name
    const nonExistentRepoName = 'non-existent-repo-' + Date.now();

    // Act & Assert - should throw an error for non-existent repo
    await expect(
      getRepositoryDetails(connection, {
        projectId: projectName,
        repositoryId: nonExistentRepoName,
      }),
    ).rejects.toThrow(/not found|Failed to get repository/);
  });
});
