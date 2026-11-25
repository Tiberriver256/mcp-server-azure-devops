import {
  createAuthClient,
  createAuthProvider,
  AuthenticationMethod,
  formatOrgUrlForLog,
  isLocationLookupFailure,
} from './auth-factory';
import { createAzureDevOpsSession } from '../session/azure-devops-session';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsValidationError,
} from '../errors';
import type { WebApi } from 'azure-devops-node-api';

const mockGetResourceAreas = jest.fn();
const mockGetLocationsApi = jest.fn();
const mockGetToken = jest.fn();

jest.mock('azure-devops-node-api', () => ({
  WebApi: jest.fn().mockImplementation(() => ({
    getLocationsApi: (...args: unknown[]) => mockGetLocationsApi(...args),
  })),
  getPersonalAccessTokenHandler: jest.fn().mockReturnValue({}),
}));

jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest
    .fn()
    .mockImplementation(() => ({ getToken: mockGetToken })),
  AzureCliCredential: jest
    .fn()
    .mockImplementation(() => ({ getToken: mockGetToken })),
}));

describe('createAuthClient server auth guard', () => {
  beforeEach(() => {
    mockGetResourceAreas.mockReset().mockResolvedValue([]);
    mockGetLocationsApi.mockReset().mockResolvedValue({
      getResourceAreas: mockGetResourceAreas,
    });
    mockGetToken.mockReset();
  });

  it('rejects Azure Identity and Azure CLI for Azure DevOps Server URLs', async () => {
    await expect(
      createAuthClient({
        method: AuthenticationMethod.AzureIdentity,
        organizationUrl: 'https://ado.local/tfs/DefaultCollection',
      }),
    ).rejects.toThrow(AzureDevOpsAuthenticationError);

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

describe('createAuthClient location lookup classification', () => {
  beforeEach(() => {
    mockGetResourceAreas.mockReset();
    mockGetLocationsApi.mockReset().mockResolvedValue({
      getResourceAreas: mockGetResourceAreas,
    });
  });

  it('throws ValidationError (not AuthenticationError) for location-id failures', async () => {
    mockGetResourceAreas.mockRejectedValue(
      new Error(
        'Failed to find api location for area: Location id: e81700f7-3be2-46de-8624-2eb35882fcaa',
      ),
    );

    const err = await createAuthClient({
      method: AuthenticationMethod.PersonalAccessToken,
      organizationUrl: 'https://dev.azure.com/example-org',
      personalAccessToken: 'test-pat',
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AzureDevOpsValidationError);
    expect(err).not.toBeInstanceOf(AzureDevOpsAuthenticationError);
    expect((err as Error).message).toContain('Failed to find api location');
    expect((err as Error).message).toContain('dev.azure.com/example-org');
    expect((err as Error).message).toMatch(/not a credential failure/i);
    expect((err as Error).cause).toBeInstanceOf(Error);
  });

  it('throws AuthenticationError for HTTP 401-style failures', async () => {
    mockGetResourceAreas.mockRejectedValue(
      new Error('Request failed with status code 401'),
    );

    await expect(
      createAuthClient({
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: 'https://dev.azure.com/example-org',
        personalAccessToken: 'test-pat',
      }),
    ).rejects.toBeInstanceOf(AzureDevOpsAuthenticationError);
  });

  it('throws AzureDevOpsError for other connection failures', async () => {
    mockGetResourceAreas.mockRejectedValue(new Error('ECONNREFUSED'));

    const err = await createAuthClient({
      method: AuthenticationMethod.PersonalAccessToken,
      organizationUrl: 'https://dev.azure.com/example-org',
      personalAccessToken: 'test-pat',
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AzureDevOpsError);
    expect(err).not.toBeInstanceOf(AzureDevOpsAuthenticationError);
    expect(err).not.toBeInstanceOf(AzureDevOpsValidationError);
    expect((err as Error).message).toContain('ECONNREFUSED');
  });
});

describe('createAuthProvider token caching & AzureDevOpsSession recovery', () => {
  beforeEach(() => {
    mockGetToken.mockReset();
  });

  it('caches Entra tokens and deduplicates concurrent getAuthorizationHeader calls', async () => {
    mockGetToken.mockResolvedValue({
      token: 'entra-token-1',
      expiresOnTimestamp: Date.now() + 60 * 60 * 1000,
    });

    const provider = createAuthProvider({
      method: AuthenticationMethod.AzureCli,
      organizationUrl: 'https://dev.azure.com/example-org',
    });

    const [h1, h2, h3] = await Promise.all([
      provider.getAuthorizationHeader(),
      provider.getAuthorizationHeader(),
      provider.getAuthorizationHeader(),
    ]);

    expect(h1).toBe('Bearer entra-token-1');
    expect(h2).toBe('Bearer entra-token-1');
    expect(h3).toBe('Bearer entra-token-1');
    expect(mockGetToken).toHaveBeenCalledTimes(1);
  });

  it('evicts failed WebApi promises from AzureDevOpsSession so subsequent calls recover', async () => {
    const fakeApi = { serverUrl: 'https://dev.azure.com/org' } as WebApi;
    const webApiFactory = jest
      .fn()
      .mockRejectedValueOnce(new Error('transient network error'))
      .mockResolvedValueOnce(fakeApi);

    const session = createAzureDevOpsSession(
      {
        organizationUrl: 'https://dev.azure.com/org',
        authMethod: AuthenticationMethod.PersonalAccessToken,
        personalAccessToken: 'pat',
      },
      { webApiFactory },
    );

    await expect(session.getWebApi()).rejects.toThrow(
      'transient network error',
    );
    expect(await session.getWebApi()).toBe(fakeApi);
    expect(await session.getWebApi()).toBe(fakeApi);
    expect(webApiFactory).toHaveBeenCalledTimes(2);
  });
});

describe('formatOrgUrlForLog / isLocationLookupFailure', () => {
  it('formats host and pathname without credentials and detects location lookup errors', () => {
    expect(formatOrgUrlForLog('https://dev.azure.com/myorg/')).toBe(
      'dev.azure.com/myorg',
    );
    expect(
      isLocationLookupFailure(
        new Error('Failed to find api location for area: Location id: abc'),
      ),
    ).toBe(true);
    expect(isLocationLookupFailure(new Error('401 Unauthorized'))).toBe(false);
  });
});
