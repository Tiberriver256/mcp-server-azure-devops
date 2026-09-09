import { AzureDevOpsClient } from './client-factory';
import { AzureDevOpsError, AzureDevOpsAuthenticationError } from '../errors';
import { AuthenticationMethod, AuthConfig } from './auth-factory';

// Mock the auth-factory module
jest.mock('./auth-factory', () => {
  const actual = jest.requireActual('./auth-factory');
  return {
    ...actual,
    createAuthClient: jest.fn(),
  };
});

import { createAuthClient } from './auth-factory';
const mockedCreateAuthClient = createAuthClient as jest.MockedFunction<
  typeof createAuthClient
>;

function makeMockWebApi(overrides: Record<string, jest.Mock> = {}) {
  return {
    getCoreApi: jest.fn().mockResolvedValue({}),
    getGitApi: jest.fn().mockResolvedValue({}),
    getWorkItemTrackingApi: jest.fn().mockResolvedValue({}),
    getBuildApi: jest.fn().mockResolvedValue({}),
    getTestApi: jest.fn().mockResolvedValue({}),
    getReleaseApi: jest.fn().mockResolvedValue({}),
    getTaskAgentApi: jest.fn().mockResolvedValue({}),
    getTaskApi: jest.fn().mockResolvedValue({}),
    getProfileApi: jest.fn().mockResolvedValue({}),
    ...overrides,
  } as any;
}

describe('AzureDevOpsClient', () => {
  const config: AuthConfig = {
    method: AuthenticationMethod.PersonalAccessToken,
    organizationUrl: 'https://dev.azure.com/testorg',
    personalAccessToken: 'test-pat',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor and getWebApiClient', () => {
    it('should create a client and authenticate successfully', async () => {
      const mockWebApi = makeMockWebApi();
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      const result = await client.getWebApiClient();

      expect(result).toBe(mockWebApi);
      expect(mockedCreateAuthClient).toHaveBeenCalledWith(config);
    });

    it('should cache the client promise on subsequent calls', async () => {
      const mockWebApi = makeMockWebApi();
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      const first = await client.getWebApiClient();
      const second = await client.getWebApiClient();

      expect(first).toBe(second);
      expect(mockedCreateAuthClient).toHaveBeenCalledTimes(1);
    });

    it('should rethrow AzureDevOpsError from createAuthClient', async () => {
      mockedCreateAuthClient.mockRejectedValue(
        new AzureDevOpsAuthenticationError('Bad credentials'),
      );

      const client = new AzureDevOpsClient(config);
      await expect(client.getWebApiClient()).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
      await expect(client.getWebApiClient()).rejects.toThrow('Bad credentials');
    });

    it('should wrap non-AzureDevOpsError in AzureDevOpsAuthenticationError', async () => {
      mockedCreateAuthClient.mockRejectedValue(new Error('Network failure'));

      const client = new AzureDevOpsClient(config);
      await expect(client.getWebApiClient()).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
      await expect(client.getWebApiClient()).rejects.toThrow(
        'Authentication failed: Network failure',
      );
    });

    it('should handle non-Error thrown values', async () => {
      mockedCreateAuthClient.mockRejectedValue('string error');

      const client = new AzureDevOpsClient(config);
      await expect(client.getWebApiClient()).rejects.toThrow(
        'Authentication failed: Unknown error',
      );
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when authentication succeeds', async () => {
      const mockWebApi = makeMockWebApi();
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      const result = await client.isAuthenticated();

      expect(result).toBe(true);
    });

    it('should return false when authentication fails', async () => {
      mockedCreateAuthClient.mockRejectedValue(new Error('auth failed'));

      const client = new AzureDevOpsClient(config);
      const result = await client.isAuthenticated();

      expect(result).toBe(false);
    });
  });

  describe('getCoreApi', () => {
    it('should return the Core API', async () => {
      const mockCoreApi = { getProjects: jest.fn() };
      const mockWebApi = makeMockWebApi({
        getCoreApi: jest.fn().mockResolvedValue(mockCoreApi),
      });
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      const result = await client.getCoreApi();

      expect(result).toBe(mockCoreApi);
    });

    it('should rethrow AzureDevOpsError', async () => {
      mockedCreateAuthClient.mockRejectedValue(
        new AzureDevOpsAuthenticationError('Not authenticated'),
      );

      const client = new AzureDevOpsClient(config);
      await expect(client.getCoreApi()).rejects.toThrow(
        AzureDevOpsAuthenticationError,
      );
    });

    it('should wrap non-AzureDevOpsError in AzureDevOpsAuthenticationError', async () => {
      const mockWebApi = makeMockWebApi({
        getCoreApi: jest.fn().mockRejectedValue(new Error('API unavailable')),
      });
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      await expect(client.getCoreApi()).rejects.toThrow(
        'Failed to get Core API: API unavailable',
      );
    });

    it('should handle non-Error thrown values from getCoreApi', async () => {
      const mockWebApi = makeMockWebApi({
        getCoreApi: jest.fn().mockRejectedValue('unexpected'),
      });
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      await expect(client.getCoreApi()).rejects.toThrow(
        'Failed to get Core API: Unknown error',
      );
    });
  });

  describe('getGitApi', () => {
    it('should return the Git API', async () => {
      const mockGitApi = { getRepositories: jest.fn() };
      const mockWebApi = makeMockWebApi({
        getGitApi: jest.fn().mockResolvedValue(mockGitApi),
      });
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      const result = await client.getGitApi();

      expect(result).toBe(mockGitApi);
    });

    it('should rethrow AzureDevOpsError', async () => {
      mockedCreateAuthClient.mockRejectedValue(
        new AzureDevOpsError('connection lost'),
      );

      const client = new AzureDevOpsClient(config);
      await expect(client.getGitApi()).rejects.toThrow(AzureDevOpsError);
    });

    it('should wrap non-AzureDevOpsError', async () => {
      const mockWebApi = makeMockWebApi({
        getGitApi: jest.fn().mockRejectedValue(new Error('Git API down')),
      });
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      await expect(client.getGitApi()).rejects.toThrow(
        'Failed to get Git API: Git API down',
      );
    });
  });

  describe('getWorkItemTrackingApi', () => {
    it('should return the Work Item Tracking API', async () => {
      const mockWitApi = { getWorkItem: jest.fn() };
      const mockWebApi = makeMockWebApi({
        getWorkItemTrackingApi: jest.fn().mockResolvedValue(mockWitApi),
      });
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      const result = await client.getWorkItemTrackingApi();

      expect(result).toBe(mockWitApi);
    });

    it('should wrap non-AzureDevOpsError', async () => {
      const mockWebApi = makeMockWebApi({
        getWorkItemTrackingApi: jest
          .fn()
          .mockRejectedValue(new Error('WIT error')),
      });
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      await expect(client.getWorkItemTrackingApi()).rejects.toThrow(
        'Failed to get Work Item Tracking API: WIT error',
      );
    });
  });

  describe('getBuildApi', () => {
    it('should return the Build API', async () => {
      const mockBuildApi = { getBuilds: jest.fn() };
      const mockWebApi = makeMockWebApi({
        getBuildApi: jest.fn().mockResolvedValue(mockBuildApi),
      });
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      const result = await client.getBuildApi();

      expect(result).toBe(mockBuildApi);
    });

    it('should wrap non-AzureDevOpsError', async () => {
      const mockWebApi = makeMockWebApi({
        getBuildApi: jest.fn().mockRejectedValue(new Error('Build error')),
      });
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      await expect(client.getBuildApi()).rejects.toThrow(
        'Failed to get Build API: Build error',
      );
    });
  });

  describe('getTestApi', () => {
    it('should return the Test API', async () => {
      const mockTestApi = { getTestRuns: jest.fn() };
      const mockWebApi = makeMockWebApi({
        getTestApi: jest.fn().mockResolvedValue(mockTestApi),
      });
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      const result = await client.getTestApi();

      expect(result).toBe(mockTestApi);
    });

    it('should wrap non-AzureDevOpsError', async () => {
      const mockWebApi = makeMockWebApi({
        getTestApi: jest.fn().mockRejectedValue(new Error('Test error')),
      });
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      await expect(client.getTestApi()).rejects.toThrow(
        'Failed to get Test API: Test error',
      );
    });
  });

  describe('getReleaseApi', () => {
    it('should return the Release API', async () => {
      const mockReleaseApi = { getReleases: jest.fn() };
      const mockWebApi = makeMockWebApi({
        getReleaseApi: jest.fn().mockResolvedValue(mockReleaseApi),
      });
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      const result = await client.getReleaseApi();

      expect(result).toBe(mockReleaseApi);
    });

    it('should wrap non-AzureDevOpsError', async () => {
      const mockWebApi = makeMockWebApi({
        getReleaseApi: jest.fn().mockRejectedValue(new Error('Release error')),
      });
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      await expect(client.getReleaseApi()).rejects.toThrow(
        'Failed to get Release API: Release error',
      );
    });
  });

  describe('getTaskAgentApi', () => {
    it('should return the Task Agent API', async () => {
      const mockTaskAgentApi = { getAgents: jest.fn() };
      const mockWebApi = makeMockWebApi({
        getTaskAgentApi: jest.fn().mockResolvedValue(mockTaskAgentApi),
      });
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      const result = await client.getTaskAgentApi();

      expect(result).toBe(mockTaskAgentApi);
    });

    it('should wrap non-AzureDevOpsError', async () => {
      const mockWebApi = makeMockWebApi({
        getTaskAgentApi: jest
          .fn()
          .mockRejectedValue(new Error('TaskAgent error')),
      });
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      await expect(client.getTaskAgentApi()).rejects.toThrow(
        'Failed to get Task Agent API: TaskAgent error',
      );
    });
  });

  describe('getTaskApi', () => {
    it('should return the Task API', async () => {
      const mockTaskApi = { getTasks: jest.fn() };
      const mockWebApi = makeMockWebApi({
        getTaskApi: jest.fn().mockResolvedValue(mockTaskApi),
      });
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      const result = await client.getTaskApi();

      expect(result).toBe(mockTaskApi);
    });

    it('should wrap non-AzureDevOpsError', async () => {
      const mockWebApi = makeMockWebApi({
        getTaskApi: jest.fn().mockRejectedValue(new Error('Task error')),
      });
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      await expect(client.getTaskApi()).rejects.toThrow(
        'Failed to get Task API: Task error',
      );
    });
  });

  describe('getProfileApi', () => {
    it('should return the Profile API', async () => {
      const mockProfileApi = { getProfile: jest.fn() };
      const mockWebApi = makeMockWebApi({
        getProfileApi: jest.fn().mockResolvedValue(mockProfileApi),
      });
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      const result = await client.getProfileApi();

      expect(result).toBe(mockProfileApi);
    });

    it('should wrap non-AzureDevOpsError', async () => {
      const mockWebApi = makeMockWebApi({
        getProfileApi: jest.fn().mockRejectedValue(new Error('Profile error')),
      });
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      await expect(client.getProfileApi()).rejects.toThrow(
        'Failed to get Profile API: Profile error',
      );
    });

    it('should handle non-Error thrown values', async () => {
      const mockWebApi = makeMockWebApi({
        getProfileApi: jest.fn().mockRejectedValue(42),
      });
      mockedCreateAuthClient.mockResolvedValue(mockWebApi);

      const client = new AzureDevOpsClient(config);
      await expect(client.getProfileApi()).rejects.toThrow(
        'Failed to get Profile API: Unknown error',
      );
    });
  });
});
