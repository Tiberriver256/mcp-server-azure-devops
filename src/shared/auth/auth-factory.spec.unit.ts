import {
  createAuthClient,
  AuthenticationMethod,
  formatOrgUrlForLog,
  isLocationLookupFailure,
} from './auth-factory';
import {
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
  AzureDevOpsValidationError,
} from '../errors';

const mockGetResourceAreas = jest.fn();
const mockGetLocationsApi = jest.fn();

jest.mock('azure-devops-node-api', () => ({
  WebApi: jest.fn().mockImplementation(() => ({
    getLocationsApi: (...args: unknown[]) => mockGetLocationsApi(...args),
  })),
  getPersonalAccessTokenHandler: jest.fn().mockReturnValue({}),
}));

jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn(),
  AzureCliCredential: jest.fn(),
}));

describe('createAuthClient server auth guard', () => {
  beforeEach(() => {
    mockGetResourceAreas.mockReset().mockResolvedValue([]);
    mockGetLocationsApi.mockReset().mockResolvedValue({
      getResourceAreas: mockGetResourceAreas,
    });
  });

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

describe('formatOrgUrlForLog / isLocationLookupFailure', () => {
  it('formats host and pathname without credentials', () => {
    expect(formatOrgUrlForLog('https://dev.azure.com/myorg')).toBe(
      'dev.azure.com/myorg',
    );
    expect(formatOrgUrlForLog('https://dev.azure.com/myorg/')).toBe(
      'dev.azure.com/myorg',
    );
  });

  it('detects location lookup failures', () => {
    expect(
      isLocationLookupFailure(
        new Error('Failed to find api location for area: Location id: abc'),
      ),
    ).toBe(true);
    expect(isLocationLookupFailure(new Error('401 Unauthorized'))).toBe(false);
  });
});
