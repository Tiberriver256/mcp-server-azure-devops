import { WebApi } from 'azure-devops-node-api';
import {
  AuthenticationMethod,
  createAuthClient,
  AuthConfig,
} from './auth-factory';
import { AzureDevOpsAuthenticationError } from '../errors';

// Create a mock WebApi class
class MockWebApi {
  constructor(
    public orgUrl: string,
    public authHandler: any,
  ) {}

  async getLocationsApi() {
    return {
      getResourceAreas: jest.fn().mockResolvedValue([]),
    };
  }
}

// Mock the azure-devops-node-api module
jest.mock('azure-devops-node-api', () => {
  return {
    WebApi: jest.fn().mockImplementation((orgUrl, authHandler) => {
      return new MockWebApi(orgUrl, authHandler);
    }),
    getPersonalAccessTokenHandler: jest
      .fn()
      .mockImplementation(() => 'pat-handler'),
  };
});

// Mock the azure-devops-node-api/handlers/bearertoken module
jest.mock('azure-devops-node-api/handlers/bearertoken', () => {
  return {
    BearerCredentialHandler: jest.fn().mockReturnValue('bearer-handler'),
  };
});

// Mock the @azure/identity module
jest.mock('@azure/identity', () => {
  return {
    DefaultAzureCredential: jest.fn().mockImplementation(() => {
      return {
        getToken: jest.fn().mockResolvedValue({ token: 'mock-token' }),
      };
    }),
    AzureCliCredential: jest.fn().mockImplementation(() => {
      return {
        getToken: jest.fn().mockResolvedValue({ token: 'mock-cli-token' }),
      };
    }),
  };
});

describe('Authentication Factory', () => {
  const orgUrl = 'https://dev.azure.com/testorg';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createAuthClient', () => {
    it('should create a client with PAT authentication', async () => {
      const config: AuthConfig = {
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: orgUrl,
        personalAccessToken: 'test-pat',
      };

      const client = await createAuthClient(config);

      expect(client).toBeInstanceOf(MockWebApi);
      expect(WebApi).toHaveBeenCalledWith(orgUrl, 'pat-handler');
      expect(client.orgUrl).toBe(orgUrl);
      expect(client.authHandler).toBe('pat-handler');
    });

    it('should throw an error if PAT is not provided for PAT authentication', async () => {
      const config: AuthConfig = {
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: orgUrl,
      };

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
      await expect(createAuthClient(config)).rejects.toThrow(
        'Personal Access Token is required',
      );
    });

    it('should create a client with Azure Identity authentication', async () => {
      const config: AuthConfig = {
        method: AuthenticationMethod.AzureIdentity,
        organizationUrl: orgUrl,
      };

      const client = await createAuthClient(config);

      expect(client).toBeInstanceOf(MockWebApi);
      expect(WebApi).toHaveBeenCalledWith(orgUrl, 'bearer-handler');
      expect(client.orgUrl).toBe(orgUrl);
      expect(client.authHandler).toBe('bearer-handler');
    });

    it('should create a client with Azure CLI authentication', async () => {
      const config: AuthConfig = {
        method: AuthenticationMethod.AzureCli,
        organizationUrl: orgUrl,
      };

      const client = await createAuthClient(config);

      expect(client).toBeInstanceOf(MockWebApi);
      expect(WebApi).toHaveBeenCalledWith(orgUrl, 'bearer-handler');
      expect(client.orgUrl).toBe(orgUrl);
      expect(client.authHandler).toBe('bearer-handler');
    });

    it('should throw an error if organization URL is not provided', async () => {
      const config = {
        method: AuthenticationMethod.PersonalAccessToken,
        personalAccessToken: 'test-pat',
      } as AuthConfig;

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
      await expect(createAuthClient(config)).rejects.toThrow(
        'Organization URL is required',
      );
    });

    it('should throw an error for unsupported authentication method', async () => {
      const config = {
        method: 'unsupported-method' as AuthenticationMethod,
        organizationUrl: orgUrl,
      };

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
      await expect(createAuthClient(config)).rejects.toThrow(
        'Unsupported authentication method',
      );
    });

    it('should handle errors from the WebApi construction', async () => {
      const config: AuthConfig = {
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: orgUrl,
        personalAccessToken: 'test-pat',
      };

      // Mock WebApi constructor to throw an error
      const originalWebApi = WebApi;
      (WebApi as jest.Mock).mockImplementationOnce(() => {
        throw new Error('WebApi construction error');
      });

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
      await expect(createAuthClient(config)).rejects.toThrow(
        'Failed to authenticate with Azure DevOps: WebApi construction error',
      );

      // Restore original mock
      (WebApi as jest.Mock).mockImplementation(originalWebApi);
    });

    it('should handle errors from getLocationsApi', async () => {
      const config: AuthConfig = {
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: orgUrl,
        personalAccessToken: 'test-pat',
      };

      // Mock getLocationsApi to throw an error
      const originalMockWebApi = MockWebApi;
      jest
        .spyOn(MockWebApi.prototype, 'getLocationsApi')
        .mockImplementationOnce(() => {
          throw new Error('Get locations API error');
        });

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
      await expect(createAuthClient(config)).rejects.toThrow(
        'Failed to authenticate with Azure DevOps: Get locations API error',
      );
    });

    it('should handle non-Error objects in catch', async () => {
      const config: AuthConfig = {
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: orgUrl,
        personalAccessToken: 'test-pat',
      };

      // Mock WebApi constructor to throw a non-Error
      const originalWebApi = WebApi;
      (WebApi as jest.Mock).mockImplementationOnce(() => {
        throw 'String error'; // not an Error object
      });

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
      await expect(createAuthClient(config)).rejects.toThrow(
        'Failed to authenticate with Azure DevOps: String error',
      );

      // Restore original mock
      (WebApi as jest.Mock).mockImplementation(originalWebApi);
    });
  });
});
