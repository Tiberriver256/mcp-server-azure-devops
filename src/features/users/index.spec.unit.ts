import { WebApi } from 'azure-devops-node-api';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { isUsersRequest, handleUsersRequest } from './index';
import { getMe } from './get-me';

// Mock the imported modules
jest.mock('./get-me', () => ({
  getMe: jest.fn(),
}));

describe('Users Request Handlers', () => {
  const mockConnection = {} as WebApi;

  describe('isUsersRequest', () => {
    it('should return true for users requests', () => {
      const request = {
        params: { name: 'get_me', arguments: {} },
        method: 'tools/call',
      } as CallToolRequest;
      expect(isUsersRequest(request)).toBe(true);
    });

    it('should return false for non-users requests', () => {
      const request = {
        params: { name: 'list_projects', arguments: {} },
        method: 'tools/call',
      } as CallToolRequest;
      expect(isUsersRequest(request)).toBe(false);
    });
  });

  describe('handleUsersRequest', () => {
    it('should handle get_me request', async () => {
      const mockUserProfile = {
        id: 'user-id-123',
        displayName: 'Test User',
        email: 'test.user@example.com',
      };
      (getMe as jest.Mock).mockResolvedValue(mockUserProfile);

      const request = {
        params: {
          name: 'get_me',
          arguments: {},
        },
        method: 'tools/call',
      } as CallToolRequest;

      const response = await handleUsersRequest(mockConnection, request);
      expect(response.content).toHaveLength(1);
      expect(JSON.parse(response.content[0].text)).toEqual(mockUserProfile);
      expect(getMe).toHaveBeenCalledWith(mockConnection);
    });

    it('should throw error for unknown tool', async () => {
      const request = {
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
        method: 'tools/call',
      } as CallToolRequest;

      await expect(handleUsersRequest(mockConnection, request)).rejects.toThrow(
        'Unknown users tool',
      );
    });

    it('should propagate errors from user functions', async () => {
      const mockError = new Error('Test error');
      (getMe as jest.Mock).mockRejectedValue(mockError);

      const request = {
        params: {
          name: 'get_me',
          arguments: {},
        },
        method: 'tools/call',
      } as CallToolRequest;

      await expect(handleUsersRequest(mockConnection, request)).rejects.toThrow(
        mockError,
      );
    });
  });
});
