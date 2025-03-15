import { AuthenticationMethod } from '../../../src/auth/auth-factory';
import { AzureDevOpsClient } from '../../../src/auth/client-factory';
import { AzureDevOpsAuthenticationError } from '../../../src/common/errors';

// Mock the auth-factory module
jest.mock('../../../src/auth/auth-factory', () => {
  return {
    AuthenticationMethod: {
      PersonalAccessToken: 'pat',
      AzureIdentity: 'azure-identity',
      AzureCli: 'azure-cli'
    },
    createAuthClient: jest.fn().mockImplementation(() => {
      return {
        getCoreApi: jest.fn().mockResolvedValue('core-api'),
        getGitApi: jest.fn().mockResolvedValue('git-api'),
        getWorkItemTrackingApi: jest.fn().mockResolvedValue('work-item-api'),
        getBuildApi: jest.fn().mockResolvedValue('build-api'),
        getTestApi: jest.fn().mockResolvedValue('test-api'),
        getReleaseApi: jest.fn().mockResolvedValue('release-api'),
        getTaskAgentApi: jest.fn().mockResolvedValue('task-agent-api'),
        getTaskApi: jest.fn().mockResolvedValue('task-api')
      };
    })
  };
});

import { createAuthClient } from '../../../src/auth/auth-factory';

describe('AzureDevOpsClient', () => {
  const config = {
    method: AuthenticationMethod.PersonalAccessToken,
    organizationUrl: 'https://dev.azure.com/testorg',
    personalAccessToken: 'test-pat'
  };
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a client with the provided configuration', () => {
    const client = new AzureDevOpsClient(config);
    expect(client).toBeInstanceOf(AzureDevOpsClient);
  });

  it('should check if the client is authenticated', async () => {
    const client = new AzureDevOpsClient(config);
    const result = await client.isAuthenticated();
    
    expect(result).toBe(true);
    expect(createAuthClient).toHaveBeenCalledWith(config);
  });

  it('should return false if authentication fails', async () => {
    (createAuthClient as jest.Mock).mockRejectedValueOnce(new Error('Auth failed'));
    
    const client = new AzureDevOpsClient(config);
    const result = await client.isAuthenticated();
    
    expect(result).toBe(false);
    expect(createAuthClient).toHaveBeenCalledWith(config);
  });

  it('should get the Core API', async () => {
    const client = new AzureDevOpsClient(config);
    const api = await client.getCoreApi();
    
    expect(api).toBe('core-api');
    expect(createAuthClient).toHaveBeenCalledWith(config);
  });

  it('should get the Git API', async () => {
    const client = new AzureDevOpsClient(config);
    const api = await client.getGitApi();
    
    expect(api).toBe('git-api');
    expect(createAuthClient).toHaveBeenCalledWith(config);
  });

  it('should get the Work Item Tracking API', async () => {
    const client = new AzureDevOpsClient(config);
    const api = await client.getWorkItemTrackingApi();
    
    expect(api).toBe('work-item-api');
    expect(createAuthClient).toHaveBeenCalledWith(config);
  });

  it('should get the Build API', async () => {
    const client = new AzureDevOpsClient(config);
    const api = await client.getBuildApi();
    
    expect(api).toBe('build-api');
    expect(createAuthClient).toHaveBeenCalledWith(config);
  });

  it('should get the Test API', async () => {
    const client = new AzureDevOpsClient(config);
    const api = await client.getTestApi();
    
    expect(api).toBe('test-api');
    expect(createAuthClient).toHaveBeenCalledWith(config);
  });

  it('should get the Release API', async () => {
    const client = new AzureDevOpsClient(config);
    const api = await client.getReleaseApi();
    
    expect(api).toBe('release-api');
    expect(createAuthClient).toHaveBeenCalledWith(config);
  });

  it('should get the Task Agent API', async () => {
    const client = new AzureDevOpsClient(config);
    const api = await client.getTaskAgentApi();
    
    expect(api).toBe('task-agent-api');
    expect(createAuthClient).toHaveBeenCalledWith(config);
  });

  it('should get the Task API', async () => {
    const client = new AzureDevOpsClient(config);
    const api = await client.getTaskApi();
    
    expect(api).toBe('task-api');
    expect(createAuthClient).toHaveBeenCalledWith(config);
  });

  it('should throw an error if getting an API fails', async () => {
    const mockClient = {
      getCoreApi: jest.fn().mockRejectedValue(new Error('API error'))
    };
    (createAuthClient as jest.Mock).mockResolvedValueOnce(mockClient);
    
    const client = new AzureDevOpsClient(config);
    
    await expect(client.getCoreApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
    await expect(client.getCoreApi()).rejects.toThrow('Failed to get Core API: API error');
  });

  it('should throw AzureDevOpsError directly from getCoreApi if it comes from lower layers', async () => {
    const originalError = new AzureDevOpsAuthenticationError('Original error');
    const mockClient = {
      getCoreApi: jest.fn().mockRejectedValue(originalError)
    };
    (createAuthClient as jest.Mock).mockResolvedValueOnce(mockClient);
    
    const client = new AzureDevOpsClient(config);
    
    await expect(client.getCoreApi()).rejects.toThrow(originalError);
  });

  it('should handle error from getGitApi', async () => {
    const mockClient = {
      getGitApi: jest.fn().mockRejectedValue(new Error('Git API error'))
    };
    (createAuthClient as jest.Mock).mockResolvedValueOnce(mockClient);
    
    const client = new AzureDevOpsClient(config);
    
    await expect(client.getGitApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
    await expect(client.getGitApi()).rejects.toThrow('Failed to get Git API: Git API error');
  });

  it('should handle error from getWorkItemTrackingApi', async () => {
    const mockClient = {
      getWorkItemTrackingApi: jest.fn().mockRejectedValue(new Error('Work Item API error'))
    };
    (createAuthClient as jest.Mock).mockResolvedValueOnce(mockClient);
    
    const client = new AzureDevOpsClient(config);
    
    await expect(client.getWorkItemTrackingApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
    await expect(client.getWorkItemTrackingApi()).rejects.toThrow('Failed to get Work Item Tracking API: Work Item API error');
  });

  it('should handle error from getBuildApi', async () => {
    const mockClient = {
      getBuildApi: jest.fn().mockRejectedValue(new Error('Build API error'))
    };
    (createAuthClient as jest.Mock).mockResolvedValueOnce(mockClient);
    
    const client = new AzureDevOpsClient(config);
    
    await expect(client.getBuildApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
    await expect(client.getBuildApi()).rejects.toThrow('Failed to get Build API: Build API error');
  });

  it('should handle error from getTestApi', async () => {
    const mockClient = {
      getTestApi: jest.fn().mockRejectedValue(new Error('Test API error'))
    };
    (createAuthClient as jest.Mock).mockResolvedValueOnce(mockClient);
    
    const client = new AzureDevOpsClient(config);
    
    await expect(client.getTestApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
    await expect(client.getTestApi()).rejects.toThrow('Failed to get Test API: Test API error');
  });

  it('should handle error from getReleaseApi', async () => {
    const mockClient = {
      getReleaseApi: jest.fn().mockRejectedValue(new Error('Release API error'))
    };
    (createAuthClient as jest.Mock).mockResolvedValueOnce(mockClient);
    
    const client = new AzureDevOpsClient(config);
    
    await expect(client.getReleaseApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
    await expect(client.getReleaseApi()).rejects.toThrow('Failed to get Release API: Release API error');
  });

  it('should handle error from getTaskAgentApi', async () => {
    const mockClient = {
      getTaskAgentApi: jest.fn().mockRejectedValue(new Error('Task Agent API error'))
    };
    (createAuthClient as jest.Mock).mockResolvedValueOnce(mockClient);
    
    const client = new AzureDevOpsClient(config);
    
    await expect(client.getTaskAgentApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
    await expect(client.getTaskAgentApi()).rejects.toThrow('Failed to get Task Agent API: Task Agent API error');
  });

  it('should handle error from getTaskApi', async () => {
    const mockClient = {
      getTaskApi: jest.fn().mockRejectedValue(new Error('Task API error'))
    };
    (createAuthClient as jest.Mock).mockResolvedValueOnce(mockClient);
    
    const client = new AzureDevOpsClient(config);
    
    await expect(client.getTaskApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
    await expect(client.getTaskApi()).rejects.toThrow('Failed to get Task API: Task API error');
  });

  it('should handle non-Error objects in getClient', async () => {
    (createAuthClient as jest.Mock).mockRejectedValueOnce('String error');
    
    const client = new AzureDevOpsClient(config);
    
    await expect(client.getWebApiClient()).rejects.toThrow(AzureDevOpsAuthenticationError);
    await expect(client.getWebApiClient()).rejects.toThrow('Authentication failed: Unknown error');
  });

  it('should handle getWebApiClient error', async () => {
    (createAuthClient as jest.Mock).mockRejectedValueOnce(new Error('Web API error'));
    
    const client = new AzureDevOpsClient(config);
    
    await expect(client.getWebApiClient()).rejects.toThrow(AzureDevOpsAuthenticationError);
    await expect(client.getWebApiClient()).rejects.toThrow('Authentication failed: Web API error');
  });

  it('should reuse the client instance', async () => {
    const client = new AzureDevOpsClient(config);
    
    await client.getCoreApi();
    await client.getGitApi();
    
    expect(createAuthClient).toHaveBeenCalledTimes(1);
  });

  // Tests for handling non-Error objects in API getter methods
  it('should handle non-Error objects in getCoreApi', async () => {
    const mockClient = {
      getCoreApi: jest.fn().mockRejectedValue('String error')
    };
    (createAuthClient as jest.Mock).mockResolvedValueOnce(mockClient);
    
    const client = new AzureDevOpsClient(config);
    
    await expect(client.getCoreApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
    await expect(client.getCoreApi()).rejects.toThrow('Failed to get Core API: Unknown error');
  });

  it('should handle non-Error objects in getGitApi', async () => {
    const mockClient = {
      getGitApi: jest.fn().mockRejectedValue('String error')
    };
    (createAuthClient as jest.Mock).mockResolvedValueOnce(mockClient);
    
    const client = new AzureDevOpsClient(config);
    
    await expect(client.getGitApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
    await expect(client.getGitApi()).rejects.toThrow('Failed to get Git API: Unknown error');
  });

  it('should handle non-Error objects in getWorkItemTrackingApi', async () => {
    const mockClient = {
      getWorkItemTrackingApi: jest.fn().mockRejectedValue('String error')
    };
    (createAuthClient as jest.Mock).mockResolvedValueOnce(mockClient);
    
    const client = new AzureDevOpsClient(config);
    
    await expect(client.getWorkItemTrackingApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
    await expect(client.getWorkItemTrackingApi()).rejects.toThrow('Failed to get Work Item Tracking API: Unknown error');
  });

  it('should handle non-Error objects in getBuildApi', async () => {
    const mockClient = {
      getBuildApi: jest.fn().mockRejectedValue('String error')
    };
    (createAuthClient as jest.Mock).mockResolvedValueOnce(mockClient);
    
    const client = new AzureDevOpsClient(config);
    
    await expect(client.getBuildApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
    await expect(client.getBuildApi()).rejects.toThrow('Failed to get Build API: Unknown error');
  });

  it('should handle non-Error objects in getTestApi', async () => {
    const mockClient = {
      getTestApi: jest.fn().mockRejectedValue('String error')
    };
    (createAuthClient as jest.Mock).mockResolvedValueOnce(mockClient);
    
    const client = new AzureDevOpsClient(config);
    
    await expect(client.getTestApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
    await expect(client.getTestApi()).rejects.toThrow('Failed to get Test API: Unknown error');
  });

  it('should handle non-Error objects in getReleaseApi', async () => {
    const mockClient = {
      getReleaseApi: jest.fn().mockRejectedValue('String error')
    };
    (createAuthClient as jest.Mock).mockResolvedValueOnce(mockClient);
    
    const client = new AzureDevOpsClient(config);
    
    await expect(client.getReleaseApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
    await expect(client.getReleaseApi()).rejects.toThrow('Failed to get Release API: Unknown error');
  });

  it('should handle non-Error objects in getTaskAgentApi', async () => {
    const mockClient = {
      getTaskAgentApi: jest.fn().mockRejectedValue('String error')
    };
    (createAuthClient as jest.Mock).mockResolvedValueOnce(mockClient);
    
    const client = new AzureDevOpsClient(config);
    
    await expect(client.getTaskAgentApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
    await expect(client.getTaskAgentApi()).rejects.toThrow('Failed to get Task Agent API: Unknown error');
  });

  it('should handle non-Error objects in getTaskApi', async () => {
    const mockClient = {
      getTaskApi: jest.fn().mockRejectedValue('String error')
    };
    (createAuthClient as jest.Mock).mockResolvedValueOnce(mockClient);
    
    const client = new AzureDevOpsClient(config);
    
    await expect(client.getTaskApi()).rejects.toThrow(AzureDevOpsAuthenticationError);
    await expect(client.getTaskApi()).rejects.toThrow('Failed to get Task API: Unknown error');
  });
}); 