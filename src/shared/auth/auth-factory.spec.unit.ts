import { createAuthClient, AuthenticationMethod } from './auth-factory';
import { AzureDevOpsAuthenticationError } from '../errors';

jest.mock('azure-devops-node-api', () => ({
  WebApi: jest.fn().mockImplementation(() => ({
    getLocationsApi: jest.fn().mockResolvedValue({
      getResourceAreas: jest.fn().mockResolvedValue([]),
    }),
  })),
  getPersonalAccessTokenHandler: jest.fn().mockReturnValue({}),
}));

jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn(),
  AzureCliCredential: jest.fn(),
}));

describe('createAuthClient server auth guard', () => {
  it('rejects Azure Identity for Azure DevOps Server URLs', async () => {
    await expect(
      createAuthClient({
        method: AuthenticationMethod.AzureIdentity,
        organizationUrl: 'https://ado.local/tfs/DefaultCollection',
      }),
    ).rejects.toThrow(AzureDevOpsAuthenticationError);
  });

  it('rejects Azure CLI auth for Azure DevOps Server URLs', async () => {
    await expect(
      createAuthClient({
        method: AuthenticationMethod.AzureCli,
        organizationUrl: 'https://ado.local/tfs/DefaultCollection',
      }),
    ).rejects.toThrow(AzureDevOpsAuthenticationError);
  });

  it('allows PAT auth for Azure DevOps Server URLs', async () => {
    await expect(
      createAuthClient({
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: 'https://ado.local/tfs/DefaultCollection',
        personalAccessToken: 'test-pat',
      }),
    ).resolves.toBeDefined();
  });
});
