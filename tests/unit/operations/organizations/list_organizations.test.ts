import axios from 'axios';
import { listOrganizations } from '../../../../src/operations/organizations';
import { AzureDevOpsConfig } from '../../../../src/types/config';
import { AzureDevOpsAuthenticationError } from '../../../../src/common/errors';
import { AuthenticationMethod } from '../../../../src/auth/auth-factory';
import { DefaultAzureCredential, AzureCliCredential } from '@azure/identity';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock @azure/identity
jest.mock('@azure/identity', () => {
  return {
    DefaultAzureCredential: jest.fn().mockImplementation(() => ({
      getToken: jest.fn().mockResolvedValue({ token: 'mock-token' })
    })),
    AzureCliCredential: jest.fn().mockImplementation(() => ({
      getToken: jest.fn().mockResolvedValue({ token: 'mock-cli-token' })
    }))
  };
});

const mockedDefaultAzureCredential = DefaultAzureCredential as jest.Mock;
const mockedAzureCliCredential = AzureCliCredential as jest.Mock;

describe('listOrganizations', () => {
  // Setup test data
  const mockConfig: AzureDevOpsConfig = {
    organizationUrl: 'https://dev.azure.com/testorg',
    personalAccessToken: 'test-pat',
  };

  const mockAzureIdentityConfig: AzureDevOpsConfig = {
    organizationUrl: 'https://dev.azure.com/testorg',
    authMethod: AuthenticationMethod.AzureIdentity,
  };

  const mockAzureCliConfig: AzureDevOpsConfig = {
    organizationUrl: 'https://dev.azure.com/testorg',
    authMethod: AuthenticationMethod.AzureCli,
  };

  const mockProfileResponse = {
    data: {
      displayName: 'Test User',
      publicAlias: 'test-user-id',
      emailAddress: 'test@example.com',
      id: 'test-user-id',
    }
  };

  const mockOrganizationsResponse = {
    data: {
      count: 2,
      value: [
        {
          accountId: 'org1-id',
          accountName: 'org1-name',
          accountUri: 'https://dev.azure.com/org1-name',
        },
        {
          accountId: 'org2-id',
          accountName: 'org2-name',
          accountUri: 'https://dev.azure.com/org2-name',
        }
      ]
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.get.mockReset();
  });

  it('should return a list of organizations using PAT authentication', async () => {
    // Setup axios mocks
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('profiles/me')) {
        return Promise.resolve(mockProfileResponse);
      } else if (url.includes('accounts')) {
        return Promise.resolve(mockOrganizationsResponse);
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    // Call the function
    const result = await listOrganizations(mockConfig);

    // Verify results
    expect(result).toEqual([
      {
        id: 'org1-id',
        name: 'org1-name',
        url: 'https://dev.azure.com/org1-name',
      },
      {
        id: 'org2-id',
        name: 'org2-name',
        url: 'https://dev.azure.com/org2-name',
      }
    ]);

    // Verify API calls
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      1,
      'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.any(String),
        }),
      })
    );
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      2,
      'https://app.vssps.visualstudio.com/_apis/accounts?memberId=test-user-id&api-version=6.0',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.any(String),
        }),
      })
    );
  });

  it('should return a list of organizations using Azure Identity authentication', async () => {
    // Setup axios mocks
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('profiles/me')) {
        return Promise.resolve(mockProfileResponse);
      } else if (url.includes('accounts')) {
        return Promise.resolve(mockOrganizationsResponse);
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    // Call the function
    const result = await listOrganizations(mockAzureIdentityConfig);

    // Verify results
    expect(result).toEqual([
      {
        id: 'org1-id',
        name: 'org1-name',
        url: 'https://dev.azure.com/org1-name',
      },
      {
        id: 'org2-id',
        name: 'org2-name',
        url: 'https://dev.azure.com/org2-name',
      }
    ]);

    // Verify DefaultAzureCredential was called
    expect(mockedDefaultAzureCredential).toHaveBeenCalledTimes(1);
    
    // Verify API calls used Bearer token
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      1,
      'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-token',
        }),
      })
    );
  });

  it('should return a list of organizations using Azure CLI authentication', async () => {
    // Setup axios mocks
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('profiles/me')) {
        return Promise.resolve(mockProfileResponse);
      } else if (url.includes('accounts')) {
        return Promise.resolve(mockOrganizationsResponse);
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    // Call the function
    const result = await listOrganizations(mockAzureCliConfig);

    // Verify results
    expect(result).toEqual([
      {
        id: 'org1-id',
        name: 'org1-name',
        url: 'https://dev.azure.com/org1-name',
      },
      {
        id: 'org2-id',
        name: 'org2-name',
        url: 'https://dev.azure.com/org2-name',
      }
    ]);

    // Verify AzureCliCredential was called
    expect(mockedAzureCliCredential).toHaveBeenCalledTimes(1);
    
    // Verify API calls used Bearer token
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      1,
      'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-cli-token',
        }),
      })
    );
  });

  it('should throw an error if Azure Identity token acquisition fails', async () => {
    // Mock token acquisition failure
    const originalModule = jest.requireActual('@azure/identity');
    jest.resetModules();
    jest.doMock('@azure/identity', () => {
      return {
        DefaultAzureCredential: jest.fn().mockImplementation(() => ({
          getToken: jest.fn().mockRejectedValue(new AzureDevOpsAuthenticationError('Token acquisition failed'))
        })),
        AzureCliCredential: jest.fn()
      };
    });
    
    // Re-import listOrganizations with mocked dependencies
    const { listOrganizations: mockedListOrgs } = require('../../../../src/operations/organizations');

    // Call the function and expect it to throw
    await expect(mockedListOrgs(mockAzureIdentityConfig)).rejects.toThrow(
      AzureDevOpsAuthenticationError
    );
    
    // Reset mocks for subsequent tests
    jest.resetModules();
    jest.doMock('@azure/identity', () => originalModule);
  });

  it('should throw an error if Azure Identity returns a null token', async () => {
    // Mock with null token
    const mockGetToken = jest.fn().mockResolvedValue(null);
    mockedDefaultAzureCredential.mockImplementation(() => ({
      getToken: mockGetToken
    }));

    // Call the function and expect it to throw
    await expect(listOrganizations(mockAzureIdentityConfig)).rejects.toThrow(
      AzureDevOpsAuthenticationError
    );
  });

  it('should throw an error if Azure CLI token acquisition fails', async () => {
    // Mock token acquisition failure
    const originalModule = jest.requireActual('@azure/identity');
    jest.resetModules();
    jest.doMock('@azure/identity', () => {
      return {
        DefaultAzureCredential: jest.fn(),
        AzureCliCredential: jest.fn().mockImplementation(() => ({
          getToken: jest.fn().mockRejectedValue(new AzureDevOpsAuthenticationError('CLI token acquisition failed'))
        }))
      };
    });
    
    // Re-import listOrganizations with mocked dependencies
    const { listOrganizations: mockedListOrgs } = require('../../../../src/operations/organizations');

    // Call the function and expect it to throw
    await expect(mockedListOrgs(mockAzureCliConfig)).rejects.toThrow(
      AzureDevOpsAuthenticationError
    );
    
    // Reset mocks for subsequent tests
    jest.resetModules();
    jest.doMock('@azure/identity', () => originalModule);
  });

  it('should throw an error if profile API fails', async () => {
    // Create a mock error with profile in the message
    const profileError = new Error('Unable to get user profile');
    
    // Setup axios mocks
    mockedAxios.get.mockImplementationOnce((url: string) => {
      if (url.includes('profiles/me')) {
        return Promise.reject(profileError);
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    // Call the function and expect it to throw
    await expect(listOrganizations(mockConfig)).rejects.toThrow(
      AzureDevOpsAuthenticationError
    );
  });

  it('should throw an error if accounts API fails', async () => {
    // Setup axios mocks
    mockedAxios.get.mockImplementationOnce((url: string) => {
      if (url.includes('profiles/me')) {
        return Promise.resolve(mockProfileResponse);
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    mockedAxios.get.mockImplementationOnce((url: string) => {
      if (url.includes('accounts')) {
        return Promise.reject(new Error('Accounts API error'));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    // Call the function and expect it to throw
    await expect(listOrganizations(mockConfig)).rejects.toThrow();
  });

  it('should throw an error if profile has no publicAlias', async () => {
    // Setup axios mocks
    mockedAxios.get.mockImplementationOnce((url: string) => {
      if (url.includes('profiles/me')) {
        return Promise.resolve({
          data: {
            displayName: 'Test User',
            // Missing publicAlias
            emailAddress: 'test@example.com',
          }
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    // Call the function and expect it to throw
    await expect(listOrganizations(mockConfig)).rejects.toThrow();
  });

  it('should throw an error when PAT is missing with PAT authentication', async () => {
    // Create config without PAT
    const configWithoutPat: AzureDevOpsConfig = {
      organizationUrl: 'https://dev.azure.com/testorg',
      authMethod: AuthenticationMethod.PersonalAccessToken,
      // No PAT
    };

    // Call the function and expect it to throw
    await expect(listOrganizations(configWithoutPat)).rejects.toThrow(
      'Personal Access Token (PAT) is required when using PAT authentication'
    );
  });
}); 