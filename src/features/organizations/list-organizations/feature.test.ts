import axios from 'axios';
import { AzureDevOpsConfig } from '../../../shared/types';
import { AzureDevOpsAuthenticationError } from '../../../shared/errors';
import { DefaultAzureCredential, AzureCliCredential } from '@azure/identity';
import { AuthenticationMethod } from '../../../shared/auth';
import { listOrganizations } from './feature';

// Mock dependencies
jest.mock('axios');
jest.mock('@azure/identity');

describe('listOrganizations', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;
  const mockConfig: AzureDevOpsConfig = {
    organizationUrl: 'https://dev.azure.com/testorg',
    authMethod: AuthenticationMethod.PersonalAccessToken,
    personalAccessToken: 'test-pat',
  };

  const mockProfileResponse = {
    data: {
      publicAlias: 'test-alias',
    },
  };

  const mockOrgsResponse = {
    data: {
      value: [
        {
          accountId: 'org-1',
          accountName: 'Test Organization 1',
          accountUri: 'https://dev.azure.com/org1',
        },
        {
          accountId: 'org-2',
          accountName: 'Test Organization 2',
          accountUri: 'https://dev.azure.com/org2',
        },
      ],
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should list organizations using PAT authentication', async () => {
    mockedAxios.get.mockImplementation((url) => {
      if (url.includes('profiles/me')) {
        return Promise.resolve(mockProfileResponse);
      } else if (url.includes('accounts')) {
        return Promise.resolve(mockOrgsResponse);
      }
      return Promise.reject(new Error('Invalid URL'));
    });

    const result = await listOrganizations(mockConfig);

    // Verify PAT auth header was used
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('profiles/me'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Basic '),
        }),
      }),
    );

    expect(result).toEqual([
      {
        id: 'org-1',
        name: 'Test Organization 1',
        url: 'https://dev.azure.com/org1',
      },
      {
        id: 'org-2',
        name: 'Test Organization 2',
        url: 'https://dev.azure.com/org2',
      },
    ]);
  });

  it('should list organizations using Azure Identity authentication', async () => {
    const azureConfig: AzureDevOpsConfig = {
      ...mockConfig,
      authMethod: AuthenticationMethod.AzureIdentity,
      personalAccessToken: undefined,
    };

    // Mock DefaultAzureCredential
    const mockToken = { token: 'test-token' };
    const mockCredential = {
      getToken: jest.fn().mockResolvedValue(mockToken),
    };
    (DefaultAzureCredential as jest.Mock).mockImplementation(
      () => mockCredential,
    );

    mockedAxios.get.mockImplementation((url) => {
      if (url.includes('profiles/me')) {
        return Promise.resolve(mockProfileResponse);
      } else if (url.includes('accounts')) {
        return Promise.resolve(mockOrgsResponse);
      }
      return Promise.reject(new Error('Invalid URL'));
    });

    const result = await listOrganizations(azureConfig);

    // Verify Bearer token was used
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('profiles/me'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );

    expect(result).toEqual([
      {
        id: 'org-1',
        name: 'Test Organization 1',
        url: 'https://dev.azure.com/org1',
      },
      {
        id: 'org-2',
        name: 'Test Organization 2',
        url: 'https://dev.azure.com/org2',
      },
    ]);
  });

  it('should list organizations using Azure CLI authentication', async () => {
    const azureConfig: AzureDevOpsConfig = {
      ...mockConfig,
      authMethod: AuthenticationMethod.AzureCli,
      personalAccessToken: undefined,
    };

    // Mock AzureCliCredential
    const mockToken = { token: 'test-token' };
    const mockCredential = {
      getToken: jest.fn().mockResolvedValue(mockToken),
    };
    (AzureCliCredential as jest.Mock).mockImplementation(() => mockCredential);

    mockedAxios.get.mockImplementation((url) => {
      if (url.includes('profiles/me')) {
        return Promise.resolve(mockProfileResponse);
      } else if (url.includes('accounts')) {
        return Promise.resolve(mockOrgsResponse);
      }
      return Promise.reject(new Error('Invalid URL'));
    });

    const result = await listOrganizations(azureConfig);

    // Verify Bearer token was used
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('profiles/me'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );

    expect(result).toEqual([
      {
        id: 'org-1',
        name: 'Test Organization 1',
        url: 'https://dev.azure.com/org1',
      },
      {
        id: 'org-2',
        name: 'Test Organization 2',
        url: 'https://dev.azure.com/org2',
      },
    ]);
  });

  it('should throw an error if Azure Identity token acquisition fails', async () => {
    const azureConfig: AzureDevOpsConfig = {
      ...mockConfig,
      authMethod: AuthenticationMethod.AzureIdentity,
      personalAccessToken: undefined,
    };

    // Mock DefaultAzureCredential with failure
    const mockCredential = {
      getToken: jest
        .fn()
        .mockRejectedValue(new Error('Token acquisition failed')),
    };
    (DefaultAzureCredential as jest.Mock).mockImplementation(
      () => mockCredential,
    );

    await expect(listOrganizations(azureConfig)).rejects.toThrow(
      'Failed to list organizations: Token acquisition failed',
    );
  });

  it('should throw an error if Azure Identity returns a null token', async () => {
    const azureConfig: AzureDevOpsConfig = {
      ...mockConfig,
      authMethod: AuthenticationMethod.AzureIdentity,
      personalAccessToken: undefined,
    };

    // Mock DefaultAzureCredential returning null token
    const mockCredential = {
      getToken: jest.fn().mockResolvedValue(null),
    };
    (DefaultAzureCredential as jest.Mock).mockImplementation(
      () => mockCredential,
    );

    await expect(listOrganizations(azureConfig)).rejects.toThrow(
      AzureDevOpsAuthenticationError,
    );
  });

  it('should throw an error if profile API fails', async () => {
    mockedAxios.get.mockImplementation((url) => {
      if (url.includes('profiles/me')) {
        return Promise.reject(new Error('Profile API error'));
      }
      return Promise.reject(new Error('Invalid URL'));
    });

    await expect(listOrganizations(mockConfig)).rejects.toThrow(
      AzureDevOpsAuthenticationError,
    );
  });

  it('should throw an error if profile has no publicAlias', async () => {
    mockedAxios.get.mockImplementation((url) => {
      if (url.includes('profiles/me')) {
        return Promise.resolve({ data: {} }); // No publicAlias
      }
      return Promise.reject(new Error('Invalid URL'));
    });

    await expect(listOrganizations(mockConfig)).rejects.toThrow(
      AzureDevOpsAuthenticationError,
    );
  });

  it('should throw an error when PAT is missing with PAT authentication', async () => {
    const config: AzureDevOpsConfig = {
      organizationUrl: 'https://dev.azure.com/testorg',
      authMethod: AuthenticationMethod.PersonalAccessToken,
      // No PAT provided
    };

    await expect(listOrganizations(config)).rejects.toThrow(
      AzureDevOpsAuthenticationError,
    );
  });
});
