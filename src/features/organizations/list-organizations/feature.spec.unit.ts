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

    // Mock axios to throw an error with properties expected by axios.isAxiosError
    const axiosError = new Error('Unauthorized');
    // Add axios error properties
    (axiosError as any).isAxiosError = true;
    (axiosError as any).config = {
      url: 'https://app.vssps.visualstudio.com/_apis/profile/profiles/me',
    };

    // Setup the mock for the first call
    mockedAxios.get.mockRejectedValueOnce(axiosError);

    // Act & Assert - Test with a fresh call each time to avoid test sequence issues
    await expect(listOrganizations(config)).rejects.toThrow(
      AzureDevOpsAuthenticationError,
    );

    // Reset mock and set it up again for the second call
    mockedAxios.get.mockReset();
    mockedAxios.get.mockRejectedValueOnce(axiosError);

    await expect(listOrganizations(config)).rejects.toThrow(
      /Authentication failed/,
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
