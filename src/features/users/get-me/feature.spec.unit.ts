import { WebApi } from 'azure-devops-node-api';
import axios, { AxiosError } from 'axios';
import { getMe } from './feature';
import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
} from '@/shared/errors';

// Mock axios
jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

// Mock env variables
const originalEnv = process.env;

describe('getMe', () => {
  let mockConnection: WebApi;

  beforeEach(() => {
    // Reset mocks
    jest.resetAllMocks();

    // Mock WebApi with a server URL
    mockConnection = {
      serverUrl: 'https://dev.azure.com/testorg',
    } as WebApi;

    // Mock environment variables for PAT authentication
    process.env = {
      ...originalEnv,
      AZURE_DEVOPS_AUTH_METHOD: 'pat',
      AZURE_DEVOPS_PAT: 'test-pat',
    };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  it('should return user profile with id, displayName, and email', async () => {
    // Arrange
    const mockProfile = {
      id: 'user-id-123',
      displayName: 'Test User',
      emailAddress: 'test.user@example.com',
      coreRevision: 1647,
      timeStamp: '2023-01-01T00:00:00.000Z',
      revision: 1647,
    };

    // Mock axios get to return profile data
    mockAxios.get.mockResolvedValue({ data: mockProfile });

    // Act
    const result = await getMe(mockConnection);

    // Assert
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://vssps.dev.azure.com/testorg/_apis/profile/profiles/me?api-version=7.1',
      expect.any(Object),
    );

    expect(result).toEqual({
      id: 'user-id-123',
      displayName: 'Test User',
      email: 'test.user@example.com',
    });
  });

  it('should handle missing email', async () => {
    // Arrange
    const mockProfile = {
      id: 'user-id-123',
      displayName: 'Test User',
      // No emailAddress
      coreRevision: 1647,
      timeStamp: '2023-01-01T00:00:00.000Z',
      revision: 1647,
    };

    // Mock axios get to return profile data
    mockAxios.get.mockResolvedValue({ data: mockProfile });

    // Act
    const result = await getMe(mockConnection);

    // Assert
    expect(result.email).toBe('');
  });

  it('should handle missing display name', async () => {
    // Arrange
    const mockProfile = {
      id: 'user-id-123',
      // No displayName
      emailAddress: 'test.user@example.com',
      coreRevision: 1647,
      timeStamp: '2023-01-01T00:00:00.000Z',
      revision: 1647,
    };

    // Mock axios get to return profile data
    mockAxios.get.mockResolvedValue({ data: mockProfile });

    // Act
    const result = await getMe(mockConnection);

    // Assert
    expect(result.displayName).toBe('');
  });

  it('should handle authentication errors', async () => {
    // Arrange
    const axiosError = {
      isAxiosError: true,
      response: {
        status: 401,
        data: { message: 'Unauthorized' },
      },
      message: 'Request failed with status code 401',
    } as AxiosError;

    // Mock axios get to throw error
    mockAxios.get.mockRejectedValue(axiosError);

    // Mock axios.isAxiosError function
    jest.spyOn(axios, 'isAxiosError').mockImplementation(() => true);

    // Act & Assert
    await expect(getMe(mockConnection)).rejects.toThrow(
      AzureDevOpsAuthenticationError,
    );
    await expect(getMe(mockConnection)).rejects.toThrow(
      /Authentication failed/,
    );
  });

  it('should wrap general errors in AzureDevOpsError', async () => {
    // Arrange
    const testError = new Error('Test API error');
    mockAxios.get.mockRejectedValue(testError);

    // Mock axios.isAxiosError function
    jest.spyOn(axios, 'isAxiosError').mockImplementation(() => false);

    // Act & Assert
    await expect(getMe(mockConnection)).rejects.toThrow(AzureDevOpsError);
    await expect(getMe(mockConnection)).rejects.toThrow(
      'Failed to get user information: Test API error',
    );
  });
});
