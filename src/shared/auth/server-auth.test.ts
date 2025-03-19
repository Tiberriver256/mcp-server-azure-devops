import { WebApi } from 'azure-devops-node-api';
import {
  AuthConfig,
  AuthenticationMethod,
  createAuthClient,
} from './auth-factory';
import { AzureDevOpsAuthenticationError } from '../errors/azure-devops-errors';

// Mock the azure-devops-node-api module
jest.mock('azure-devops-node-api', () => {
  return {
    WebApi: jest.fn().mockImplementation(() => ({
      getLocationsApi: jest.fn().mockResolvedValue({
        getResourceAreas: jest.fn().mockResolvedValue([]),
      }),
    })),
    getPersonalAccessTokenHandler: jest.fn().mockReturnValue({}),
    getBearerHandler: jest.fn().mockReturnValue({}),
  };
});

// Use the jest mock types directly
const MockWebApi = jest.mocked(WebApi);
const WebApiMock = WebApi as unknown as jest.Mock;

describe('auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createAuthClient', () => {
    it('should throw error if PAT is missing for PAT authentication', async () => {
      await expect(
        createAuthClient({
          method: AuthenticationMethod.PersonalAccessToken,
          personalAccessToken: '',
          organizationUrl: 'https://dev.azure.com/org',
        }),
      ).rejects.toThrow(AzureDevOpsAuthenticationError);
    });

    it('should throw error if organization URL is missing', async () => {
      await expect(
        createAuthClient({
          method: AuthenticationMethod.PersonalAccessToken,
          personalAccessToken: 'validpat',
          organizationUrl: '',
        }),
      ).rejects.toThrow(AzureDevOpsAuthenticationError);
    });

    it('should create WebApi client with correct configuration', async () => {
      // Set up a mock implementation for this specific test
      const mockGetResourceAreas = jest.fn().mockResolvedValue([]);
      const mockGetLocationsApi = jest.fn().mockResolvedValue({
        getResourceAreas: mockGetResourceAreas,
      });

      // Clear previous mock implementation and set new one
      WebApiMock.mockImplementation(() => ({
        getLocationsApi: mockGetLocationsApi,
      }));

      const config: AuthConfig = {
        method: AuthenticationMethod.PersonalAccessToken,
        personalAccessToken: 'validpat',
        organizationUrl: 'https://dev.azure.com/org',
      };

      const client = await createAuthClient(config);

      expect(MockWebApi).toHaveBeenCalledTimes(1);
      expect(mockGetLocationsApi).toHaveBeenCalledTimes(1);
      expect(client).toBeDefined();
    });

    it('should throw authentication error if API call fails', async () => {
      // Create a mock implementation that fails
      const mockGetResourceAreas = jest
        .fn()
        .mockRejectedValue(new Error('API Error'));
      const mockGetLocationsApi = jest.fn().mockResolvedValue({
        getResourceAreas: mockGetResourceAreas,
      });

      // Set up the mock to throw an error from getResourceAreas
      WebApiMock.mockImplementation(() => ({
        getLocationsApi: mockGetLocationsApi,
      }));

      const config: AuthConfig = {
        method: AuthenticationMethod.PersonalAccessToken,
        personalAccessToken: 'validpat',
        organizationUrl: 'https://dev.azure.com/org',
      };

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
    });
  });
});
