import { WebApi } from 'azure-devops-node-api';
import {
  AuthConfig,
  AuthenticationMethod,
  createAuthClient,
} from './auth-factory';
import { AzureDevOpsAuthenticationError } from '../errors/azure-devops-errors';
import { DefaultAzureCredential, AzureCliCredential } from '@azure/identity';

// Mock the azure-devops-node-api module
jest.mock('azure-devops-node-api', () => {
  const mockGetResourceAreas = jest.fn().mockResolvedValue([]);
  const mockGetLocationsApi = jest.fn().mockResolvedValue({
    getResourceAreas: mockGetResourceAreas,
  });
  
  return {
    WebApi: jest.fn().mockImplementation(() => ({
      getLocationsApi: mockGetLocationsApi,
    })),
    getPersonalAccessTokenHandler: jest.fn().mockReturnValue({}),
    getBearerHandler: jest.fn().mockReturnValue({}),
    BearerCredentialHandler: jest.fn().mockImplementation(() => ({})),
  };
});

// Mock Azure Identity
jest.mock('@azure/identity', () => {
  return {
    DefaultAzureCredential: jest.fn().mockImplementation(() => ({
      getToken: jest.fn().mockResolvedValue({ token: 'mock-azure-token' }),
    })),
    AzureCliCredential: jest.fn().mockImplementation(() => ({
      getToken: jest.fn().mockResolvedValue({ token: 'mock-cli-token' }),
    })),
  };
});

// Use the jest mock types directly
const WebApiMock = WebApi as unknown as jest.Mock;
const DefaultAzureCredentialMock = DefaultAzureCredential as unknown as jest.Mock;
const AzureCliCredentialMock = AzureCliCredential as unknown as jest.Mock;

describe('auth-factory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset the WebApi mock to a working implementation for each test
    WebApiMock.mockImplementation(() => ({
      getLocationsApi: jest.fn().mockResolvedValue({
        getResourceAreas: jest.fn().mockResolvedValue([]),
      }),
    }));
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

      expect(WebApiMock).toHaveBeenCalledTimes(1);
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

    it('should throw error for unsupported authentication method', async () => {
      const config: AuthConfig = {
        method: 'unsupported-method' as AuthenticationMethod,
        organizationUrl: 'https://dev.azure.com/org',
      };

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
    });

    it('should create client using AzureIdentity authentication', async () => {
      const config: AuthConfig = {
        method: AuthenticationMethod.AzureIdentity,
        organizationUrl: 'https://dev.azure.com/org',
      };

      const client = await createAuthClient(config);

      expect(DefaultAzureCredentialMock).toHaveBeenCalledTimes(1);
      expect(WebApiMock).toHaveBeenCalledTimes(1);
      expect(client).toBeDefined();
    });

    it('should throw error if AzureIdentity token acquisition fails', async () => {
      DefaultAzureCredentialMock.mockImplementationOnce(() => ({
        getToken: jest.fn().mockRejectedValue(new Error('Token acquisition failed')),
      }));

      const config: AuthConfig = {
        method: AuthenticationMethod.AzureIdentity,
        organizationUrl: 'https://dev.azure.com/org',
      };

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
    });

    it('should throw error if AzureIdentity token is null', async () => {
      DefaultAzureCredentialMock.mockImplementationOnce(() => ({
        getToken: jest.fn().mockResolvedValue({ token: null }),
      }));

      const config: AuthConfig = {
        method: AuthenticationMethod.AzureIdentity,
        organizationUrl: 'https://dev.azure.com/org',
      };

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
    });

    it('should throw error if AzureIdentity token response is undefined', async () => {
      DefaultAzureCredentialMock.mockImplementationOnce(() => ({
        getToken: jest.fn().mockResolvedValue(undefined),
      }));

      const config: AuthConfig = {
        method: AuthenticationMethod.AzureIdentity,
        organizationUrl: 'https://dev.azure.com/org',
      };

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
    });

    it('should throw error if AzureIdentity token is empty string', async () => {
      DefaultAzureCredentialMock.mockImplementationOnce(() => ({
        getToken: jest.fn().mockResolvedValue({ token: '' }),
      }));

      const config: AuthConfig = {
        method: AuthenticationMethod.AzureIdentity,
        organizationUrl: 'https://dev.azure.com/org',
      };

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
    });

    it('should create client using AzureCli authentication', async () => {
      const config: AuthConfig = {
        method: AuthenticationMethod.AzureCli,
        organizationUrl: 'https://dev.azure.com/org',
      };

      const client = await createAuthClient(config);

      expect(AzureCliCredentialMock).toHaveBeenCalledTimes(1);
      expect(WebApiMock).toHaveBeenCalledTimes(1);
      expect(client).toBeDefined();
    });

    it('should throw error if AzureCli token acquisition fails', async () => {
      AzureCliCredentialMock.mockImplementationOnce(() => ({
        getToken: jest.fn().mockRejectedValue(new Error('CLI token acquisition failed')),
      }));

      const config: AuthConfig = {
        method: AuthenticationMethod.AzureCli,
        organizationUrl: 'https://dev.azure.com/org',
      };

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
    });

    it('should throw error if AzureCli token is null', async () => {
      AzureCliCredentialMock.mockImplementationOnce(() => ({
        getToken: jest.fn().mockResolvedValue({ token: null }),
      }));

      const config: AuthConfig = {
        method: AuthenticationMethod.AzureCli,
        organizationUrl: 'https://dev.azure.com/org',
      };

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
    });

    it('should throw error if AzureCli token response is undefined', async () => {
      AzureCliCredentialMock.mockImplementationOnce(() => ({
        getToken: jest.fn().mockResolvedValue(undefined),
      }));

      const config: AuthConfig = {
        method: AuthenticationMethod.AzureCli,
        organizationUrl: 'https://dev.azure.com/org',
      };

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
    });

    it('should throw error if AzureCli token is empty string', async () => {
      AzureCliCredentialMock.mockImplementationOnce(() => ({
        getToken: jest.fn().mockResolvedValue({ token: '' }),
      }));

      const config: AuthConfig = {
        method: AuthenticationMethod.AzureCli,
        organizationUrl: 'https://dev.azure.com/org',
      };

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
    });

    it('should handle non-Error exception in createAuthClient', async () => {
      // Mock the implementation to throw during the connection test
      WebApiMock.mockImplementationOnce(() => ({
        getLocationsApi: jest.fn().mockImplementation(() => {
          throw 'String error';
        }),
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