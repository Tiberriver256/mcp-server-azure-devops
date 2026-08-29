import { getTestConfig, shouldSkipAzureDevOpsTests } from './test-helpers';

describe('shared test helpers', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('skips tests when Azure DevOps credentials are missing', () => {
    delete process.env.AZURE_DEVOPS_ORG_URL;
    delete process.env.AZURE_DEVOPS_PAT;

    expect(shouldSkipAzureDevOpsTests()).toBe(true);
    expect(getTestConfig()).toBeNull();
  });

  it('skips tests when Azure DevOps example placeholder values are present', () => {
    process.env.AZURE_DEVOPS_ORG_URL =
      'https://dev.azure.com/your-organization';
    process.env.AZURE_DEVOPS_PAT = 'your-personal-access-token';
    process.env.AZURE_DEVOPS_DEFAULT_PROJECT = 'your-default-project';

    expect(shouldSkipAzureDevOpsTests()).toBe(true);
    expect(getTestConfig()).toBeNull();
  });

  it('does not skip tests when Azure DevOps PAT credentials are configured', () => {
    process.env.AZURE_DEVOPS_ORG_URL = 'https://dev.azure.com/example-org';
    process.env.AZURE_DEVOPS_PAT = 'example-pat';
    process.env.AZURE_DEVOPS_DEFAULT_PROJECT = 'example-project';

    expect(shouldSkipAzureDevOpsTests()).toBe(false);
    expect(getTestConfig()).toEqual({
      organizationUrl: 'https://dev.azure.com/example-org',
      authMethod: 'pat',
      personalAccessToken: 'example-pat',
      defaultProject: 'example-project',
    });
  });
});
