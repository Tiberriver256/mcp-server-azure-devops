import { listOrganizations } from './feature';
import { AzureDevOpsAuthenticationError } from '../../../shared/errors';
import axios from 'axios';
import { AuthenticationMethod } from '../../../shared/auth';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock Azure Identity
jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn().mockImplementation(() => ({
    getToken: jest.fn().mockResolvedValue({ token: 'mock-token' }),
  })),
  AzureCliCredential: jest.fn().mockImplementation(() => ({
    getToken: jest.fn().mockResolvedValue({ token: 'mock-token' }),
  })),
}));

// Define an interface for axios error
interface AxiosErrorLike extends Error {
  config: { url: string };
}

describe('listOrganizations unit', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should throw error when PAT is not provided with PAT auth method', async () => {
    // Arrange
    const config = {
      organizationUrl: 'https://dev.azure.com/test-org',
      authMethod: AuthenticationMethod.PersonalAccessToken,
      // No PAT provided
    };

    // Act & Assert
    await expect(listOrganizations(config)).rejects.toThrow(
      AzureDevOpsAuthenticationError,
    );
    await expect(listOrganizations(config)).rejects.toThrow(
      'Personal Access Token (PAT) is required',
    );
  });

  test('should throw authentication error when profile API fails', async () => {
    // Arrange
    const config = {
      organizationUrl: 'https://dev.azure.com/test-org',
      authMethod: AuthenticationMethod.PersonalAccessToken,
      personalAccessToken: 'test-pat',
    };

    // Mock axios to throw on the profile API call
    mockedAxios.get.mockImplementationOnce(() => {
      const error = new Error('Unauthorized') as AxiosErrorLike;
      error.config = { url: 'profiles/me' };
      throw error;
    });

    // Act & Assert
    await expect(listOrganizations(config)).rejects.toThrow(
      AzureDevOpsAuthenticationError,
    );
    await expect(listOrganizations(config)).rejects.toThrow(
      'Authentication failed',
    );
  });

  test('should transform organization response correctly', async () => {
    // Arrange
    const config = {
      organizationUrl: 'https://dev.azure.com/test-org',
      authMethod: AuthenticationMethod.PersonalAccessToken,
      personalAccessToken: 'test-pat',
    };

    // Mock profile API response
    mockedAxios.get.mockImplementationOnce(() =>
      Promise.resolve({
        data: {
          publicAlias: 'test-alias',
        },
      }),
    );

    // Mock organizations API response
    mockedAxios.get.mockImplementationOnce(() =>
      Promise.resolve({
        data: {
          value: [
            {
              accountId: 'org-id-1',
              accountName: 'org-name-1',
              accountUri: 'https://dev.azure.com/org-name-1',
            },
            {
              accountId: 'org-id-2',
              accountName: 'org-name-2',
              accountUri: 'https://dev.azure.com/org-name-2',
            },
          ],
        },
      }),
    );

    // Act
    const result = await listOrganizations(config);

    // Assert
    expect(result).toEqual([
      {
        id: 'org-id-1',
        name: 'org-name-1',
        url: 'https://dev.azure.com/org-name-1',
      },
      {
        id: 'org-id-2',
        name: 'org-name-2',
        url: 'https://dev.azure.com/org-name-2',
      },
    ]);
  });
});
