import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { WebApi } from 'azure-devops-node-api';
import { getRepositoryDetails } from './feature.ts';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '../../../shared/test/test-helpers.ts';

const shouldSkip = shouldSkipIntegrationTest();

void describe(
  'getRepositoryDetails integration',
  {
    skip: shouldSkip ? 'No real Azure DevOps connection available' : false,
  },
  () => {
    let connection: WebApi;
    let projectName: string;

    before(async () => {
      // Get a real connection using environment variables
      const testConnection = await getTestConnection();
      if (!testConnection) {
        throw new Error(
          'Connection should be available when integration tests are enabled',
        );
      }
      connection = testConnection;
      projectName =
        process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
    });

    void test('should retrieve repository details from Azure DevOps', async () => {
      // First, get a list of repos to find one to test with
      const gitApi = await connection.getGitApi();
      const repos = await gitApi.getRepositories(projectName);

      assert.ok(repos.length > 0);

      // Use the first repo as a test subject
      const testRepo = repos[0];

      // Act - make an actual API call to Azure DevOps
      const result = await getRepositoryDetails(connection, {
        projectId: projectName,
        repositoryId: testRepo.name || testRepo.id || '',
      });

      // Assert on the actual response
      assert.notStrictEqual(result, undefined);
      assert.notStrictEqual(result.repository, undefined);
      assert.strictEqual(result.repository.id, testRepo.id);
      assert.strictEqual(result.repository.name, testRepo.name);
      assert.notStrictEqual(result.repository.project, undefined);
      if (result.repository.project) {
        assert.strictEqual(result.repository.project.name, projectName);
      }
    });

    void test('should retrieve repository details with statistics', async () => {
      // First, get a list of repos to find one to test with
      const gitApi = await connection.getGitApi();
      const repos = await gitApi.getRepositories(projectName);

      assert.ok(repos.length > 0);

      // Use the first repo as a test subject
      const testRepo = repos[0];

      // Act - make an actual API call to Azure DevOps
      const result = await getRepositoryDetails(connection, {
        projectId: projectName,
        repositoryId: testRepo.name || testRepo.id || '',
        includeStatistics: true,
      });

      // Assert on the actual response
      assert.notStrictEqual(result, undefined);
      assert.notStrictEqual(result.repository, undefined);
      assert.strictEqual(result.repository.id, testRepo.id);
      assert.notStrictEqual(result.statistics, undefined);
      assert.strictEqual(Array.isArray(result.statistics?.branches), true);
    });

    void test('should retrieve repository details with refs', async () => {
      // First, get a list of repos to find one to test with
      const gitApi = await connection.getGitApi();
      const repos = await gitApi.getRepositories(projectName);

      assert.ok(repos.length > 0);

      // Use the first repo as a test subject
      const testRepo = repos[0];

      // Act - make an actual API call to Azure DevOps
      const result = await getRepositoryDetails(connection, {
        projectId: projectName,
        repositoryId: testRepo.name || testRepo.id || '',
        includeRefs: true,
      });

      // Assert on the actual response
      assert.notStrictEqual(result, undefined);
      assert.notStrictEqual(result.repository, undefined);
      assert.strictEqual(result.repository.id, testRepo.id);
      assert.notStrictEqual(result.refs, undefined);
      assert.notStrictEqual(result.refs?.value, undefined);
      assert.strictEqual(Array.isArray(result.refs?.value), true);
      assert.strictEqual(typeof result.refs?.count, 'number');
    });

    void test('should retrieve repository details with refs filtered by heads/', async () => {
      // First, get a list of repos to find one to test with
      const gitApi = await connection.getGitApi();
      const repos = await gitApi.getRepositories(projectName);

      assert.ok(repos.length > 0);

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
      assert.notStrictEqual(result, undefined);
      assert.notStrictEqual(result.repository, undefined);
      assert.notStrictEqual(result.refs, undefined);
      assert.notStrictEqual(result.refs?.value, undefined);

      // All refs should start with refs/heads/
      if (result.refs && result.refs.value.length > 0) {
        result.refs.value.forEach((ref) => {
          assert.ok(typeof ref.name === 'string');
          assert.match(ref.name, /^refs\/heads\//);
        });
      }
    });

    void test('should throw error when repository is not found', async () => {
      // Use a non-existent repository name
      const nonExistentRepoName = 'non-existent-repo-' + Date.now();

      // Act & Assert - should throw an error for non-existent repo
      await assert.rejects(
        () =>
          getRepositoryDetails(connection, {
            projectId: projectName,
            repositoryId: nonExistentRepoName,
          }),
        /not found|Failed to get repository/,
      );
    });
  },
);
