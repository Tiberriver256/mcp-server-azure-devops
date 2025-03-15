import { WebApi } from 'azure-devops-node-api';
import { AuthenticationMethod, createAuthClient, AuthConfig } from '../../../src/auth/auth-factory';
import { AzureDevOpsAuthenticationError } from '../../../src/common/errors';

// Create a mock WebApi class
class MockWebApi {
  constructor(public orgUrl: string, public authHandler: any) {}
  
  async getLocationsApi() {
    return {
      getResourceAreas: jest.fn().mockResolvedValue([])
    };
  }
}

// Mock the azure-devops-node-api module
jest.mock('azure-devops-node-api', () => {
  return {
    WebApi: jest.fn().mockImplementation((orgUrl, authHandler) => {
      return new MockWebApi(orgUrl, authHandler);
    }),
    getPersonalAccessTokenHandler: jest.fn().mockImplementation(() => 'pat-handler')
  };
});

// Mock the azure-devops-node-api/handlers/bearertoken module
jest.mock('azure-devops-node-api/handlers/bearertoken', () => {
  return {
    BearerCredentialHandler: jest.fn().mockReturnValue('bearer-handler')
  };
});

// Mock the @azure/identity module
jest.mock('@azure/identity', () => {
  return {
    DefaultAzureCredential: jest.fn().mockImplementation(() => {
      return {
        getToken: jest.fn().mockResolvedValue({ token: 'mock-token' })
      };
    }),
    AzureCliCredential: jest.fn().mockImplementation(() => {
      return {
        getToken: jest.fn().mockResolvedValue({ token: 'mock-cli-token' })
      };
    })
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
        personalAccessToken: 'test-pat'
      };

      const client = await createAuthClient(config);
      
      expect(client).toBeInstanceOf(MockWebApi);
      expect(WebApi).toHaveBeenCalledWith(orgUrl, 'pat-handler');
    });

    it('should throw an error if PAT is missing with PAT authentication', async () => {
      const config: AuthConfig = {
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: orgUrl,
        personalAccessToken: ''
      };

      await expect(createAuthClient(config)).rejects.toThrow(AzureDevOpsAuthenticationError);
      await expect(createAuthClient(config)).rejects.toThrow('Personal Access Token (PAT) is required');
    });

    it('should throw an error if organization URL is missing', async () => {
      const config: AuthConfig = {
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: '',
        personalAccessToken: 'test-pat'
      };

      await expect(createAuthClient(config)).rejects.toThrow(AzureDevOpsAuthenticationError);
      await expect(createAuthClient(config)).rejects.toThrow('Organization URL is required');
    });

    it('should throw an error if authentication fails', async () => {
      // Mock WebApi to throw an error
      const mockWebApi = jest.fn() as unknown as jest.Mock;
      mockWebApi.mockImplementationOnce(() => {
        return {
          getLocationsApi: jest.fn().mockRejectedValue(new Error('Auth failed'))
        };
      });
      const originalWebApi = WebApi;
      (WebApi as unknown) = mockWebApi;

      const config: AuthConfig = {
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: orgUrl,
        personalAccessToken: 'test-pat'
      };

      try {
        await expect(createAuthClient(config)).rejects.toThrow(AzureDevOpsAuthenticationError);
        await expect(createAuthClient(config)).rejects.toThrow('Failed to authenticate with Azure DevOps');
      } finally {
        // Restore the original WebApi
        (WebApi as unknown) = originalWebApi;
      }
    });
  });
}); 