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

// Setup mock configurations
let mockCreateWebApiThrowsError = false;
let mockGetLocationApiThrowsError = false;
let mockThrowAsString = false;
let currentAuthHandler = 'pat-handler';

// Mock variables for token validation tests
let mockAzureIdentityTokenNullOrInvalid = false;
let mockAzureCliTokenNullOrInvalid = false;

// Mock the azure-devops-node-api module
jest.mock('azure-devops-node-api', () => {
  // Create mock for WebApi class
  const mockWebApi = jest.fn().mockImplementation((orgUrl, _) => {
    if (mockCreateWebApiThrowsError) {
      if (mockThrowAsString) {
        throw 'String error';
      } else {
        throw new Error('WebApi construction error');
      }
    }
    
    const instance = new MockWebApi(orgUrl, currentAuthHandler);
    
    if (mockGetLocationApiThrowsError) {
      instance.getLocationsApi = jest.fn().mockImplementation(() => {
        throw new Error('Get locations API error');
      });
    }
    
    return instance;
  });

  return {
    WebApi: mockWebApi,
    getPersonalAccessTokenHandler: jest.fn().mockReturnValue('pat-handler'),
    getBearerHandler: jest.fn().mockReturnValue('bearer-handler'),
  };
});

// Mock the azure-devops-node-api/handlers/bearertoken module
jest.mock('azure-devops-node-api/handlers/bearertoken', () => {
  return {
    BearerCredentialHandler: jest.fn().mockImplementation(() => 'bearer-handler'),
  };
});

// Mock the @azure/identity module
jest.mock('@azure/identity', () => {
  return {
    DefaultAzureCredential: jest.fn().mockImplementation(() => {
      return {
        getToken: jest.fn().mockImplementation(() => {
          if (mockAzureIdentityTokenNullOrInvalid) {
            return Promise.resolve(null);
          }
          return Promise.resolve({ token: 'mock-token' });
        }),
      };
    }),
    AzureCliCredential: jest.fn().mockImplementation(() => {
      return {
        getToken: jest.fn().mockImplementation(() => {
          if (mockAzureCliTokenNullOrInvalid) {
            return Promise.resolve({ });  // Missing token property
          }
          return Promise.resolve({ token: 'mock-cli-token' });
        }),
      };
    }),
  };
});

describe('Authentication Factory', () => {
  const orgUrl = 'https://dev.azure.com/testorg';

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateWebApiThrowsError = false;
    mockGetLocationApiThrowsError = false;
    mockThrowAsString = false;
    currentAuthHandler = 'pat-handler';
    mockAzureIdentityTokenNullOrInvalid = false;
    mockAzureCliTokenNullOrInvalid = false;
  });

  describe('createAuthClient', () => {
    it('should create a client with PAT authentication', async () => {
      const config: AuthConfig = {
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: orgUrl,
        personalAccessToken: 'test-pat',
      };

      const client = await createAuthClient(config) as unknown as MockedWebApi;

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
      // Reset all mock implementations
      jest.clearAllMocks();
      
      // Set our current auth handler
      const mockedBearerToken = 'azure-identity-bearer-handler';
      currentAuthHandler = mockedBearerToken;
      
      // Mock the BearerCredentialHandler to return our handler
      require('azure-devops-node-api/handlers/bearertoken').BearerCredentialHandler.mockImplementation(
        () => mockedBearerToken
      );

      const config: AuthConfig = {
        method: AuthenticationMethod.AzureIdentity,
        organizationUrl: orgUrl,
      };

      const client = await createAuthClient(config) as unknown as MockedWebApi;

      expect(client).toBeDefined();
      expect(client.orgUrl).toBe(orgUrl);
      expect(client.authHandler).toBe(mockedBearerToken);
    });

    it('should throw an error if Azure Identity token is null', async () => {
      mockAzureIdentityTokenNullOrInvalid = true;
      
      const config: AuthConfig = {
        method: AuthenticationMethod.AzureIdentity,
        organizationUrl: orgUrl,
      };

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
      await expect(createAuthClient(config)).rejects.toThrow(
        'Failed to acquire Azure Identity token: Failed to acquire token',
      );
    });

    it('should create a client with Azure CLI authentication', async () => {
      // Reset all mock implementations
      jest.clearAllMocks();
      
      // Set our current auth handler
      const mockedBearerToken = 'azure-cli-bearer-handler';
      currentAuthHandler = mockedBearerToken;
      
      // Mock the BearerCredentialHandler to return our handler
      require('azure-devops-node-api/handlers/bearertoken').BearerCredentialHandler.mockImplementation(
        () => mockedBearerToken
      );

      const config: AuthConfig = {
        method: AuthenticationMethod.AzureCli,
        organizationUrl: orgUrl,
      };

      const client = await createAuthClient(config) as unknown as MockedWebApi;

      expect(client).toBeDefined();
      expect(client.orgUrl).toBe(orgUrl);
      expect(client.authHandler).toBe(mockedBearerToken);
    });

    it('should throw an error if Azure CLI token is missing token property', async () => {
      mockAzureCliTokenNullOrInvalid = true;
      
      const config: AuthConfig = {
        method: AuthenticationMethod.AzureCli,
        organizationUrl: orgUrl,
      };

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
      await expect(createAuthClient(config)).rejects.toThrow(
        'Failed to acquire Azure CLI token: Failed to acquire token',
      );
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
      mockCreateWebApiThrowsError = true;
      
      const config: AuthConfig = {
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: orgUrl,
        personalAccessToken: 'test-pat',
      };

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
      await expect(createAuthClient(config)).rejects.toThrow(
        'Failed to authenticate with Azure DevOps: WebApi construction error',
      );
    });

    it('should handle errors from getLocationsApi', async () => {
      mockGetLocationApiThrowsError = true;
      
      const config: AuthConfig = {
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: orgUrl,
        personalAccessToken: 'test-pat',
      };

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
      await expect(createAuthClient(config)).rejects.toThrow(
        'Failed to authenticate with Azure DevOps: Get locations API error',
      );
    });

    it('should handle non-Error objects in catch', async () => {
      mockCreateWebApiThrowsError = true;
      mockThrowAsString = true;
      
      const config: AuthConfig = {
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: orgUrl,
        personalAccessToken: 'test-pat',
      };

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
      await expect(createAuthClient(config)).rejects.toThrow(
        'Failed to authenticate with Azure DevOps: String error',
      );
    });
  });
});
