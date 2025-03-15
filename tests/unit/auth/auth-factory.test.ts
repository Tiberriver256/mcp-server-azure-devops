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

    it('should create a client with Azure Identity authentication', async () => {
      const config: AuthConfig = {
        method: AuthenticationMethod.AzureIdentity,
        organizationUrl: orgUrl
      };

      const client = await createAuthClient(config);
      
      expect(client).toBeInstanceOf(MockWebApi);
      expect(WebApi).toHaveBeenCalledWith(orgUrl, expect.anything());
    });

    it('should create a client with Azure CLI authentication', async () => {
      const config: AuthConfig = {
        method: AuthenticationMethod.AzureCli,
        organizationUrl: orgUrl
      };

      const client = await createAuthClient(config);
      
      expect(client).toBeInstanceOf(MockWebApi);
      expect(WebApi).toHaveBeenCalledWith(orgUrl, expect.anything());
    });

    it('should throw an error for unsupported authentication method', async () => {
      const config: AuthConfig = {
        method: 'invalid-method' as AuthenticationMethod,
        organizationUrl: orgUrl
      };

      await expect(createAuthClient(config)).rejects.toThrow(AzureDevOpsAuthenticationError);
      await expect(createAuthClient(config)).rejects.toThrow(/Unsupported authentication method/);
    });

    it('should throw an error if Azure Identity token acquisition fails', async () => {
      // Mock DefaultAzureCredential to throw an error
      const mockDefaultAzureCredential = jest.fn().mockImplementationOnce(() => {
        return {
          getToken: jest.fn().mockRejectedValue(new Error('Token acquisition failed'))
        };
      });
      const { DefaultAzureCredential } = require('@azure/identity');
      const originalDefaultAzureCredential = DefaultAzureCredential;
      (require('@azure/identity').DefaultAzureCredential as unknown) = mockDefaultAzureCredential;

      const config: AuthConfig = {
        method: AuthenticationMethod.AzureIdentity,
        organizationUrl: orgUrl
      };

      try {
        await expect(createAuthClient(config)).rejects.toThrow(AzureDevOpsAuthenticationError);
        await expect(createAuthClient(config)).rejects.toThrow(/Failed to acquire Azure Identity token/);
      } finally {
        // Restore the original DefaultAzureCredential
        (require('@azure/identity').DefaultAzureCredential as unknown) = originalDefaultAzureCredential;
      }
    });

    it('should throw an error if Azure CLI token acquisition fails', async () => {
      // Mock AzureCliCredential to throw an error
      const mockAzureCliCredential = jest.fn().mockImplementationOnce(() => {
        return {
          getToken: jest.fn().mockRejectedValue(new Error('CLI token acquisition failed'))
        };
      });
      const { AzureCliCredential } = require('@azure/identity');
      const originalAzureCliCredential = AzureCliCredential;
      (require('@azure/identity').AzureCliCredential as unknown) = mockAzureCliCredential;

      const config: AuthConfig = {
        method: AuthenticationMethod.AzureCli,
        organizationUrl: orgUrl
      };

      try {
        await expect(createAuthClient(config)).rejects.toThrow(AzureDevOpsAuthenticationError);
        await expect(createAuthClient(config)).rejects.toThrow(/Failed to acquire Azure CLI token/);
      } finally {
        // Restore the original AzureCliCredential
        (require('@azure/identity').AzureCliCredential as unknown) = originalAzureCliCredential;
      }
    });

    it('should throw an error if Azure Identity returns a null token', async () => {
      // Mock DefaultAzureCredential to return null token
      const mockDefaultAzureCredential = jest.fn().mockImplementationOnce(() => {
        return {
          getToken: jest.fn().mockResolvedValue({ token: null })
        };
      });
      const { DefaultAzureCredential } = require('@azure/identity');
      const originalDefaultAzureCredential = DefaultAzureCredential;
      (require('@azure/identity').DefaultAzureCredential as unknown) = mockDefaultAzureCredential;

      const config: AuthConfig = {
        method: AuthenticationMethod.AzureIdentity,
        organizationUrl: orgUrl
      };

      try {
        await expect(createAuthClient(config)).rejects.toThrow(AzureDevOpsAuthenticationError);
      } finally {
        // Restore the original DefaultAzureCredential
        (require('@azure/identity').DefaultAzureCredential as unknown) = originalDefaultAzureCredential;
      }
    });
    
    it('should throw an error if Azure CLI returns a null token', async () => {
      // Mock AzureCliCredential to return null token
      const mockAzureCliCredential = jest.fn().mockImplementationOnce(() => {
        return {
          getToken: jest.fn().mockResolvedValue({ token: null })
        };
      });
      const { AzureCliCredential } = require('@azure/identity');
      const originalAzureCliCredential = AzureCliCredential;
      (require('@azure/identity').AzureCliCredential as unknown) = mockAzureCliCredential;

      const config: AuthConfig = {
        method: AuthenticationMethod.AzureCli,
        organizationUrl: orgUrl
      };

      try {
        await expect(createAuthClient(config)).rejects.toThrow(AzureDevOpsAuthenticationError);
      } finally {
        // Restore the original AzureCliCredential
        (require('@azure/identity').AzureCliCredential as unknown) = originalAzureCliCredential;
      }
    });
  });
}); 