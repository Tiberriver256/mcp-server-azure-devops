import { WebApi } from 'azure-devops-node-api';
import { createAuthenticatedClient, isValidPatFormat } from '../../../src/api/auth';
import { AzureDevOpsAuthenticationError } from '../../../src/api/errors';

// Mock the azure-devops-node-api module
jest.mock('azure-devops-node-api');
const MockWebApi = WebApi as jest.MockedClass<typeof WebApi>;

describe('auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createAuthenticatedClient', () => {
    it('should throw error if PAT is missing', async () => {
      await expect(createAuthenticatedClient({
        pat: '',
        orgUrl: 'https://dev.azure.com/org'
      })).rejects.toThrow(AzureDevOpsAuthenticationError);
    });

    it('should throw error if organization URL is missing', async () => {
      await expect(createAuthenticatedClient({
        pat: 'validpat',
        orgUrl: ''
      })).rejects.toThrow(AzureDevOpsAuthenticationError);
    });

    it('should create WebApi client with correct configuration', async () => {
      // Mock getLocationsApi() which is used to test the connection
      const mockGetLocationsApi = jest.fn().mockResolvedValue({});
      
      MockWebApi.mockImplementation(() => ({
        getLocationsApi: mockGetLocationsApi
      } as any));

      const config = {
        pat: 'validpat',
        orgUrl: 'https://dev.azure.com/org'
      };

      const client = await createAuthenticatedClient(config);

      expect(MockWebApi).toHaveBeenCalledTimes(1);
      expect(mockGetLocationsApi).toHaveBeenCalledTimes(1);
      expect(client).toBeDefined();
    });

    it('should throw authentication error if API call fails', async () => {
      const mockGetLocationsApi = jest.fn().mockRejectedValue(new Error('API Error'));
      
      MockWebApi.mockImplementation(() => ({
        getLocationsApi: mockGetLocationsApi
      } as any));

      const config = {
        pat: 'validpat',
        orgUrl: 'https://dev.azure.com/org'
      };

      await expect(createAuthenticatedClient(config))
        .rejects
        .toThrow(AzureDevOpsAuthenticationError);
    });
  });

  describe('isValidPatFormat', () => {
    it('should return false for empty PAT', () => {
      expect(isValidPatFormat('')).toBe(false);
    });

    it('should return false for PAT shorter than 64 characters', () => {
      expect(isValidPatFormat('short')).toBe(false);
    });

    it('should return false for non-base64 PAT', () => {
      expect(isValidPatFormat('!@#$%^&*'.repeat(8))).toBe(false);
    });

    it('should return true for valid base64 PAT', () => {
      // Create a valid base64 string of sufficient length
      const validPat = Buffer.from('a'.repeat(64)).toString('base64');
      expect(isValidPatFormat(validPat)).toBe(true);
    });
  });
}); 