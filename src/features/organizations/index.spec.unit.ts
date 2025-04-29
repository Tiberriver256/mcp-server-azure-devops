import { WebApi } from 'azure-devops-node-api';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { isOrganizationsRequest, handleOrganizationsRequest } from './';
import { AuthenticationMethod } from '../../shared/auth';
import * as listOrganizationsFeature from './list-organizations';

// Mock the listOrganizations function
jest.mock('./list-organizations');

describe('Organizations Request Handlers', () => {
  describe('isOrganizationsRequest', () => {
    it('should return true for organizations requests', () => {
      const request = {
        params: { name: 'list_organizations', arguments: {} },
      } as CallToolRequest;

      expect(isOrganizationsRequest(request)).toBe(true);
    });

    it('should return false for non-organizations requests', () => {
      const request = {
        params: { name: 'get_project', arguments: {} },
      } as CallToolRequest;

      expect(isOrganizationsRequest(request)).toBe(false);
    });
  });

  describe('handleOrganizationsRequest', () => {
    const mockConnection = {
      serverUrl: 'https://dev.azure.com/mock-org',
    } as unknown as WebApi;

    beforeEach(() => {
      jest.resetAllMocks();
      // Mock environment variables
      process.env.AZURE_DEVOPS_AUTH_METHOD = 'pat';
      process.env.AZURE_DEVOPS_PAT = 'mock-pat';
    });

    it('should handle list_organizations request', async () => {
      const mockOrgs = [
        { id: '1', name: 'org1', url: 'https://dev.azure.com/org1' },
        { id: '2', name: 'org2', url: 'https://dev.azure.com/org2' },
      ];

      (
        listOrganizationsFeature.listOrganizations as jest.Mock
      ).mockResolvedValue(mockOrgs);

      const request = {
        params: { name: 'list_organizations', arguments: {} },
      } as CallToolRequest;

      const response = await handleOrganizationsRequest(
        mockConnection,
        request,
      );

      expect(response).toEqual({
        content: [{ type: 'text', text: JSON.stringify(mockOrgs, null, 2) }],
      });

      expect(listOrganizationsFeature.listOrganizations).toHaveBeenCalledWith({
        authMethod: AuthenticationMethod.PersonalAccessToken,
        personalAccessToken: 'mock-pat',
        organizationUrl: 'https://dev.azure.com/mock-org',
      });
    });

    it('should throw error for unknown tool', async () => {
      const request = {
        params: { name: 'unknown_tool', arguments: {} },
      } as CallToolRequest;

      await expect(
        handleOrganizationsRequest(mockConnection, request),
      ).rejects.toThrow('Unknown organizations tool: unknown_tool');
    });

    it('should propagate errors from listOrganizations', async () => {
      const mockError = new Error('Test error');
      (
        listOrganizationsFeature.listOrganizations as jest.Mock
      ).mockRejectedValue(mockError);

      const request = {
        params: { name: 'list_organizations', arguments: {} },
      } as CallToolRequest;

      await expect(
        handleOrganizationsRequest(mockConnection, request),
      ).rejects.toThrow(mockError);
    });

    afterEach(() => {
      // Clean up environment variables
      delete process.env.AZURE_DEVOPS_AUTH_METHOD;
      delete process.env.AZURE_DEVOPS_PAT;
    });
  });
});
