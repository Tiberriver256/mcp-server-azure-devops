import { WebApi } from 'azure-devops-node-api';
import { AzureDevOpsClient } from '../../../src/api/client';
import { AzureDevOpsAuthenticationError, AzureDevOpsError } from '../../../src/common/errors';
import * as auth from '../../../src/api/auth';

// Mock the azure-devops-node-api module
jest.mock('azure-devops-node-api');
// Mock the auth module
jest.mock('../../../src/api/auth');

const MockWebApi = WebApi as jest.MockedClass<typeof WebApi>;
const mockCreateAuthenticatedClient = auth.createAuthenticatedClient as jest.MockedFunction<typeof auth.createAuthenticatedClient>;

describe('AzureDevOpsClient', () => {
  const config = {
    pat: 'validpat',
    orgUrl: 'https://dev.azure.com/org'
  };

  let client: AzureDevOpsClient;
  let mockWebApiInstance: any;
  let mockGetCoreApi: jest.Mock;
  let mockGetGitApi: jest.Mock;
  let mockGetWorkItemTrackingApi: jest.Mock;
  let mockGetBuildApi: jest.Mock;
  let mockGetTestApi: jest.Mock;
  let mockGetReleaseApi: jest.Mock;
  let mockGetTaskAgentApi: jest.Mock;
  let mockGetTaskApi: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock API methods
    mockGetCoreApi = jest.fn().mockResolvedValue({});
    mockGetGitApi = jest.fn().mockResolvedValue({});
    mockGetWorkItemTrackingApi = jest.fn().mockResolvedValue({});
    mockGetBuildApi = jest.fn().mockResolvedValue({});
    mockGetTestApi = jest.fn().mockResolvedValue({});
    mockGetReleaseApi = jest.fn().mockResolvedValue({});
    mockGetTaskAgentApi = jest.fn().mockResolvedValue({});
    mockGetTaskApi = jest.fn().mockResolvedValue({});

    mockWebApiInstance = {
      getCoreApi: mockGetCoreApi,
      getGitApi: mockGetGitApi,
      getWorkItemTrackingApi: mockGetWorkItemTrackingApi,
      getBuildApi: mockGetBuildApi,
      getTestApi: mockGetTestApi,
      getReleaseApi: mockGetReleaseApi,
      getTaskAgentApi: mockGetTaskAgentApi,
      getTaskApi: mockGetTaskApi
    };

    MockWebApi.mockImplementation(() => mockWebApiInstance);
    
    // Mock the createAuthenticatedClient function to return our mockWebApiInstance
    mockCreateAuthenticatedClient.mockResolvedValue(mockWebApiInstance);

    client = new AzureDevOpsClient(config);
  });

  describe('getClient', () => {
    it('should create WebApi client only once', async () => {
      await client.getCoreApi();
      await client.getCoreApi();

      expect(mockCreateAuthenticatedClient).toHaveBeenCalledTimes(1);
      expect(mockCreateAuthenticatedClient).toHaveBeenCalledWith(config);
    });
    
    it('should re-use the cached client for multiple API calls', async () => {
      await client.getCoreApi();
      await client.getGitApi();
      await client.getWorkItemTrackingApi();
      
      expect(mockCreateAuthenticatedClient).toHaveBeenCalledTimes(1);
    });

    it('should handle authentication errors when creating client', async () => {
      mockCreateAuthenticatedClient.mockRejectedValueOnce(new AzureDevOpsAuthenticationError('Authentication failed'));
      
      await expect(client.getCoreApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
      expect(mockCreateAuthenticatedClient).toHaveBeenCalledTimes(1);
    });
    
    it('should handle generic errors when creating client', async () => {
      mockCreateAuthenticatedClient.mockRejectedValueOnce(new Error('Network error'));
      
      await expect(client.getCoreApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
      expect(mockCreateAuthenticatedClient).toHaveBeenCalledTimes(1);
    });
    
    it('should handle non-Error instances when creating client', async () => {
      mockCreateAuthenticatedClient.mockRejectedValueOnce('String error');
      
      await expect(client.getCoreApi()).rejects.toThrow('Authentication failed: Unknown error');
      expect(mockCreateAuthenticatedClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('API client getters', () => {
    it('should get Core API client', async () => {
      const coreApi = await client.getCoreApi();
      expect(coreApi).toBeDefined();
      expect(mockGetCoreApi).toHaveBeenCalledTimes(1);
    });

    it('should get Git API client', async () => {
      const gitApi = await client.getGitApi();
      expect(gitApi).toBeDefined();
      expect(mockGetGitApi).toHaveBeenCalledTimes(1);
    });

    it('should get Work Item Tracking API client', async () => {
      const witApi = await client.getWorkItemTrackingApi();
      expect(witApi).toBeDefined();
      expect(mockGetWorkItemTrackingApi).toHaveBeenCalledTimes(1);
    });

    it('should get Build API client', async () => {
      const buildApi = await client.getBuildApi();
      expect(buildApi).toBeDefined();
      expect(mockGetBuildApi).toHaveBeenCalledTimes(1);
    });

    it('should get Test API client', async () => {
      const testApi = await client.getTestApi();
      expect(testApi).toBeDefined();
      expect(mockGetTestApi).toHaveBeenCalledTimes(1);
    });

    it('should get Release API client', async () => {
      const releaseApi = await client.getReleaseApi();
      expect(releaseApi).toBeDefined();
      expect(mockGetReleaseApi).toHaveBeenCalledTimes(1);
    });

    it('should get Task Agent API client', async () => {
      const taskAgentApi = await client.getTaskAgentApi();
      expect(taskAgentApi).toBeDefined();
      expect(mockGetTaskAgentApi).toHaveBeenCalledTimes(1);
    });

    it('should get Task API client', async () => {
      const taskApi = await client.getTaskApi();
      expect(taskApi).toBeDefined();
      expect(mockGetTaskApi).toHaveBeenCalledTimes(1);
    });

    it('should throw authentication error if API call fails', async () => {
      mockGetCoreApi.mockRejectedValue(new Error('API Error'));
      await expect(client.getCoreApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
    });
    
    it('should rethrow AzureDevOpsError if API call fails with that error type', async () => {
      const apiError = new AzureDevOpsError('API Error');
      mockGetCoreApi.mockRejectedValue(apiError);
      await expect(client.getCoreApi()).rejects.toThrow(apiError);
    });
    
    it('should handle error in getGitApi', async () => {
      mockGetGitApi.mockRejectedValue(new Error('Git API Error'));
      await expect(client.getGitApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
      await expect(client.getGitApi()).rejects.toThrow('Failed to get Git API');
    });
    
    it('should handle non-Error instance in getGitApi', async () => {
      mockGetGitApi.mockRejectedValue('String error');
      await expect(client.getGitApi()).rejects.toThrow('Failed to get Git API: Unknown error');
    });
    
    it('should handle error in getWorkItemTrackingApi', async () => {
      mockGetWorkItemTrackingApi.mockRejectedValue(new Error('Work Item API Error'));
      await expect(client.getWorkItemTrackingApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
      await expect(client.getWorkItemTrackingApi()).rejects.toThrow('Failed to get Work Item Tracking API');
    });
    
    it('should handle non-Error instance in getWorkItemTrackingApi', async () => {
      mockGetWorkItemTrackingApi.mockRejectedValue('String error');
      await expect(client.getWorkItemTrackingApi()).rejects.toThrow('Failed to get Work Item Tracking API: Unknown error');
    });
    
    it('should handle error in getBuildApi', async () => {
      mockGetBuildApi.mockRejectedValue(new Error('Build API Error'));
      await expect(client.getBuildApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
      await expect(client.getBuildApi()).rejects.toThrow('Failed to get Build API');
    });
    
    it('should handle non-Error instance in getBuildApi', async () => {
      mockGetBuildApi.mockRejectedValue('String error');
      await expect(client.getBuildApi()).rejects.toThrow('Failed to get Build API: Unknown error');
    });
    
    it('should handle error in getTestApi', async () => {
      mockGetTestApi.mockRejectedValue(new Error('Test API Error'));
      await expect(client.getTestApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
      await expect(client.getTestApi()).rejects.toThrow('Failed to get Test API');
    });
    
    it('should handle non-Error instance in getTestApi', async () => {
      mockGetTestApi.mockRejectedValue('String error');
      await expect(client.getTestApi()).rejects.toThrow('Failed to get Test API: Unknown error');
    });
    
    it('should handle error in getReleaseApi', async () => {
      mockGetReleaseApi.mockRejectedValue(new Error('Release API Error'));
      await expect(client.getReleaseApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
      await expect(client.getReleaseApi()).rejects.toThrow('Failed to get Release API');
    });
    
    it('should handle non-Error instance in getReleaseApi', async () => {
      mockGetReleaseApi.mockRejectedValue('String error');
      await expect(client.getReleaseApi()).rejects.toThrow('Failed to get Release API: Unknown error');
    });
    
    it('should handle error in getTaskAgentApi', async () => {
      mockGetTaskAgentApi.mockRejectedValue(new Error('Task Agent API Error'));
      await expect(client.getTaskAgentApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
      await expect(client.getTaskAgentApi()).rejects.toThrow('Failed to get Task Agent API');
    });
    
    it('should handle non-Error instance in getTaskAgentApi', async () => {
      mockGetTaskAgentApi.mockRejectedValue('String error');
      await expect(client.getTaskAgentApi()).rejects.toThrow('Failed to get Task Agent API: Unknown error');
    });
    
    it('should handle error in getTaskApi', async () => {
      mockGetTaskApi.mockRejectedValue(new Error('Task API Error'));
      await expect(client.getTaskApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
      await expect(client.getTaskApi()).rejects.toThrow('Failed to get Task API');
    });
    
    it('should handle non-Error instance in getTaskApi', async () => {
      mockGetTaskApi.mockRejectedValue('String error');
      await expect(client.getTaskApi()).rejects.toThrow('Failed to get Task API: Unknown error');
    });
  });

  describe('isAuthenticated', () => {
    it('should return true if Core API is accessible', async () => {
      const isAuth = await client.isAuthenticated();
      expect(isAuth).toBe(true);
      expect(mockCreateAuthenticatedClient).toHaveBeenCalledTimes(1);
    });

    it('should return false if Core API is not accessible', async () => {
      mockCreateAuthenticatedClient.mockRejectedValueOnce(new Error('API Error'));
      const isAuth = await client.isAuthenticated();
      expect(isAuth).toBe(false);
      expect(mockCreateAuthenticatedClient).toHaveBeenCalledTimes(1);
    });
    
    it('should return false for any error type in isAuthenticated', async () => {
      mockCreateAuthenticatedClient.mockRejectedValueOnce(new AzureDevOpsError('Auth Error'));
      const isAuth = await client.isAuthenticated();
      expect(isAuth).toBe(false);
    });
  });
}); 