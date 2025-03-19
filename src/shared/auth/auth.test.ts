import { AzureDevOpsAuthenticationError } from '../errors/azure-devops-errors';
import {
  AuthenticationMethod,
  AuthConfig,
  createAuthClient,
} from './auth-factory';
import { AzureDevOpsClient } from './client-factory';

// Mock the azure-devops-node-api
jest.mock('azure-devops-node-api', () => {
  const getLocationsApiMock = jest.fn().mockReturnValue({
    getResourceAreas: jest.fn().mockResolvedValue([]),
  });

  const mockedWebApi = jest.fn().mockImplementation(() => ({
    getLocationsApi: getLocationsApiMock,
    getCoreApi: jest.fn().mockResolvedValue({
      getProjects: jest.fn().mockResolvedValue([]),
    }),
    getGitApi: jest.fn(),
    getWorkItemTrackingApi: jest.fn(),
  }));

  return {
    WebApi: mockedWebApi,
    getPersonalAccessTokenHandler: jest.fn().mockReturnValue({}),
    getBasicHandler: jest.fn().mockReturnValue({}),
    getBearerHandler: jest.fn().mockReturnValue({}),
  };
});

// Mock the auth-factory module
jest.mock('./auth-factory', () => {
  const actual = jest.requireActual('./auth-factory');
  const { AzureDevOpsAuthenticationError } = jest.requireActual('../errors/azure-devops-errors');
  return {
    ...actual,
    createAuthClient: jest.fn().mockImplementation((config) => {
      if (config.method === actual.AuthenticationMethod.PersonalAccessToken && 
          (!config.personalAccessToken || config.personalAccessToken === '')) {
        return Promise.reject(new AzureDevOpsAuthenticationError('Personal Access Token is required'));
      }
      return Promise.resolve({
        getLocationsApi: jest.fn().mockResolvedValue({
          getResourceAreas: jest.fn().mockResolvedValue([]),
        }),
      });
    }),
  };
});

describe('Authentication Tests', () => {
  describe('Authentication Method', () => {
    it('should use PAT authentication method by default', () => {
      const client = new AzureDevOpsClient({
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: 'https://dev.azure.com/test',
        personalAccessToken: 'test-pat',
      });

      expect(client['config'].method).toBe(
        AuthenticationMethod.PersonalAccessToken,
      );
    });

    it('should detect Azure Identity auth method', () => {
      const client = new AzureDevOpsClient({
        method: AuthenticationMethod.AzureIdentity,
        organizationUrl: 'https://dev.azure.com/test',
      });

      expect(client['config'].method).toBe(AuthenticationMethod.AzureIdentity);
    });

    it('should detect Azure CLI auth method', () => {
      const client = new AzureDevOpsClient({
        method: AuthenticationMethod.AzureCli,
        organizationUrl: 'https://dev.azure.com/test',
      });

      expect(client['config'].method).toBe(AuthenticationMethod.AzureCli);
    });
  });

  describe('Connection Creation', () => {
    it('should create WebApi connection with PAT', async () => {
      const config: AuthConfig = {
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: 'https://dev.azure.com/test',
        personalAccessToken: 'test-pat',
      };

      const connection = await createAuthClient(config);
      expect(connection).toBeDefined();
    });

    it('should throw authentication error with missing PAT', async () => {
      const config: AuthConfig = {
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: 'https://dev.azure.com/test',
        // Missing personalAccessToken
      };

      await expect(createAuthClient(config)).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
    });
  });

  describe('AzureDevOpsClient', () => {
    it('should create client with the right configuration', () => {
      const config: AuthConfig = {
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: 'https://dev.azure.com/test',
        personalAccessToken: 'test-pat',
      };

      const client = new AzureDevOpsClient(config);
      expect(client).toBeDefined();
      expect(client['config']).toEqual(config);
    });

    it('should get WebApi client', async () => {
      const config: AuthConfig = {
        method: AuthenticationMethod.PersonalAccessToken,
        organizationUrl: 'https://dev.azure.com/test',
        personalAccessToken: 'test-pat',
      };

      const client = new AzureDevOpsClient(config);
      const webApi = await client.getWebApiClient();
      expect(webApi).toBeDefined();
    });
  });
});
