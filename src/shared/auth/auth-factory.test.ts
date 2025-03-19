import { WebApi } from 'azure-devops-node-api';
import {
  AuthenticationMethod,
  createAuthClient,
  AuthConfig,
} from './auth-factory';
import { AzureDevOpsAuthenticationError } from '../errors';

// Create Mock WebApi type that matches our test expectations
type MockedWebApi = {
  orgUrl: string;
  authHandler: any;
  getLocationsApi(): Promise<{
    getResourceAreas: jest.Mock;
  }>;
};

// Cast the WebApi object to a jest.Mock for mocking operations
const MockedWebApiClass = WebApi as unknown as jest.Mock;

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

      const client = (await createAuthClient(
        config,
      )) as unknown as MockedWebApi;

      expect(client).toBeDefined();
      expect(MockedWebApiClass).toHaveBeenCalledWith(orgUrl, 'pat-handler');
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

      const client = (await createAuthClient(
        config,
      )) as unknown as MockedWebApi;

      expect(client).toBeDefined();
      expect(MockedWebApiClass).toHaveBeenCalledWith(orgUrl, 'bearer-handler');
      expect(client.orgUrl).toBe(orgUrl);
      expect(client.authHandler).toBe('bearer-handler');
    });

    it('should create a client with Azure CLI authentication', async () => {
      const config: AuthConfig = {
        method: AuthenticationMethod.AzureCli,
        organizationUrl: orgUrl,
      };

      const client = (await createAuthClient(
        config,
      )) as unknown as MockedWebApi;

      expect(client).toBeDefined();
      expect(MockedWebApiClass).toHaveBeenCalledWith(orgUrl, 'bearer-handler');
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

      // Save original implementation
      const origImpl = MockedWebApiClass.mockImplementation;

      // Set up the mock to throw an error
      MockedWebApiClass.mockImplementationOnce(() => {
        throw new Error('WebApi construction error');
      });

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
      await expect(createAuthClient(config)).rejects.toThrow(
        'Failed to authenticate with Azure DevOps: WebApi construction error',
      );

      // Restore original implementation
      MockedWebApiClass.mockImplementation = origImpl;
    });

    it('should handle errors from getLocationsApi', async () => {
      const config: AuthConfig = {
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: orgUrl,
        personalAccessToken: 'test-pat',
      };

      // Mock getLocationsApi to throw an error
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

      // Save original implementation
      const origImpl = MockedWebApiClass.mockImplementation;

      // Set up the mock to throw a non-Error
      MockedWebApiClass.mockImplementationOnce(() => {
        throw 'String error'; // not an Error object
      });

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
      await expect(createAuthClient(config)).rejects.toThrow(
        'Failed to authenticate with Azure DevOps: String error',
      );

      // Restore original implementation
      MockedWebApiClass.mockImplementation = origImpl;
    });
  });
});
