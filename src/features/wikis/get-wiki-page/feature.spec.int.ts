import { getWikiPage } from './feature';

// Skip tests if not in integration test environment
const runTests = process.env.RUN_INTEGRATION_TESTS === 'true';

// These tests require a valid Azure DevOps connection
// They are skipped by default and only run when RUN_INTEGRATION_TESTS is set
(runTests ? describe : describe.skip)('getWikiPage (Integration)', () => {
  const organizationId = process.env.AZURE_DEVOPS_TEST_ORG || '';
  const projectId = process.env.AZURE_DEVOPS_TEST_PROJECT || '';
  const wikiId = process.env.AZURE_DEVOPS_TEST_WIKI || '';

  beforeAll(async () => {
    // Skip setup if tests are skipped
    if (!runTests) return;

    // Ensure we have required environment variables
    if (!process.env.AZURE_DEVOPS_ORG_URL) {
      throw new Error('AZURE_DEVOPS_ORG_URL environment variable is required');
    }

    if (!projectId) {
      throw new Error(
        'AZURE_DEVOPS_TEST_PROJECT environment variable is required',
      );
    }

    if (!wikiId) {
      throw new Error(
        'AZURE_DEVOPS_TEST_WIKI environment variable is required',
      );
    }
  }, 30000);

  it('should get a wiki page by path', async () => {
    // Skip if tests are skipped
    if (!runTests) return;

    // Attempt to get the root wiki page
    const result = await getWikiPage({
      organizationId,
      projectId,
      wikiId,
      pagePath: '/',
    });

    // Check that the result is a non-empty string
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  }, 30000);

  it('should throw when wiki page does not exist', async () => {
    // Skip if tests are skipped
    if (!runTests) return;

    // Try to get a non-existent page
    await expect(
      getWikiPage({
        organizationId,
        projectId,
        wikiId,
        pagePath: '/This/Path/Should/Not/Exist/' + Date.now(),
      }),
    ).rejects.toThrow();
  }, 30000);
});
