import axios from 'axios';
import { listOrganizations } from '../../../../src/operations/organizations';
import { AzureDevOpsConfig } from '../../../../src/types/config';
import { AzureDevOpsAuthenticationError } from '../../../../src/common/errors';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('listOrganizations', () => {
  // Setup test data
  const mockConfig: AzureDevOpsConfig = {
    organizationUrl: 'https://dev.azure.com/testorg',
    personalAccessToken: 'test-pat',
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
  });

  it('should return a list of organizations', async () => {
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

  it('should throw an error if profile API fails', async () => {
    // Create a mock error with profile in the message
    const profileError = new Error('Unable to get user profile');
    
    // Setup axios mocks
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('profiles/me')) {
        return Promise.reject(profileError);
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    // Call the function and expect it to throw
    await expect(listOrganizations(mockConfig)).rejects.toThrow(
      AzureDevOpsAuthenticationError
    );

    // Verify API calls
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('should throw an error if accounts API fails', async () => {
    // Setup axios mocks
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('profiles/me')) {
        return Promise.resolve(mockProfileResponse);
      } else if (url.includes('accounts')) {
        return Promise.reject(new Error('Accounts API error'));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    // Call the function and expect it to throw
    await expect(listOrganizations(mockConfig)).rejects.toThrow();

    // Verify API calls
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it('should throw an error if profile has no publicAlias', async () => {
    // Setup axios mocks
    mockedAxios.get.mockImplementation((url: string) => {
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

    // Verify API calls
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });
}); 