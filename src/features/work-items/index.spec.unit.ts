import { isWorkItemsRequest, handleWorkItemsRequest } from './';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import * as workItemModule from './';

// Mock the imported modules
jest.mock('./get-work-item', () => ({
  getWorkItem: jest.fn(),
}));

jest.mock('./list-work-items', () => ({
  listWorkItems: jest.fn(),
}));

jest.mock('./create-work-item', () => ({
  createWorkItem: jest.fn(),
}));

jest.mock('./update-work-item', () => ({
  updateWorkItem: jest.fn(),
}));

jest.mock('./manage-work-item-link', () => ({
  manageWorkItemLink: jest.fn(),
}));

// Helper function to create a valid CallToolRequest object
const createCallToolRequest = (name: string, args: any): CallToolRequest => {
  return {
    method: 'tools/call',
    params: {
      name,
      arguments: args,
    },
  } as unknown as CallToolRequest;
};

describe('Work Items Request Handlers', () => {
  describe('isWorkItemsRequest', () => {
    it('should return true for work items requests', () => {
      const workItemsRequests = [
        'get_work_item',
        'list_work_items',
        'create_work_item',
        'update_work_item',
        'manage_work_item_link',
        'get_work_item_comments',
      ];

      workItemsRequests.forEach((name) => {
        const request = createCallToolRequest(name, {});

        expect(isWorkItemsRequest(request)).toBe(true);
      });
    });

    it('should return false for non-work items requests', () => {
      const request = createCallToolRequest('get_project', {});

      expect(isWorkItemsRequest(request)).toBe(false);
    });
  });

  describe('handleWorkItemsRequest', () => {
    let mockConnection: WebApi;

    beforeEach(() => {
      mockConnection = {} as WebApi;

      // Setup mock for schema validation - with correct return types
      jest
        .spyOn(workItemModule.GetWorkItemSchema, 'parse')
        .mockImplementation(() => {
          return { workItemId: 123, expand: undefined };
        });

      jest
        .spyOn(workItemModule.ListWorkItemsSchema, 'parse')
        .mockImplementation(() => {
          return { projectId: 'myProject' };
        });

      jest
        .spyOn(workItemModule.CreateWorkItemSchema, 'parse')
        .mockImplementation(() => {
          return {
            projectId: 'myProject',
            workItemType: 'Task',
            title: 'New Task',
          };
        });

      jest
        .spyOn(workItemModule.UpdateWorkItemSchema, 'parse')
        .mockImplementation(() => {
          return {
            workItemId: 123,
            title: 'Updated Title',
          };
        });

      jest
        .spyOn(workItemModule.ManageWorkItemLinkSchema, 'parse')
        .mockImplementation(() => {
          return {
            sourceWorkItemId: 123,
            targetWorkItemId: 456,
            operation: 'add' as 'add' | 'remove' | 'update',
            relationType: 'System.LinkTypes.Hierarchy-Forward',
          };
        });

      // Setup mocks for feature functions
      jest.spyOn(workItemModule, 'getWorkItem').mockResolvedValue({ id: 123 });
      jest
        .spyOn(workItemModule, 'listWorkItems')
        .mockResolvedValue([{ id: 123 }, { id: 456 }]);
      jest
        .spyOn(workItemModule, 'createWorkItem')
        .mockResolvedValue({ id: 789 });
      jest
        .spyOn(workItemModule, 'updateWorkItem')
        .mockResolvedValue({ id: 123 });
      jest
        .spyOn(workItemModule, 'manageWorkItemLink')
        .mockResolvedValue({ id: 123 });
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it('should handle get_work_item requests', async () => {
      const request = createCallToolRequest('get_work_item', {
        workItemId: 123,
      });

      const result = await handleWorkItemsRequest(mockConnection, request);

      expect(workItemModule.GetWorkItemSchema.parse).toHaveBeenCalledWith({
        workItemId: 123,
      });
      expect(workItemModule.getWorkItem).toHaveBeenCalledWith(
        mockConnection,
        123,
        undefined,
      );
      expect(result).toEqual({
        content: [{ type: 'text', text: JSON.stringify({ id: 123 }, null, 2) }],
      });
    });

    it('should handle list_work_items requests', async () => {
      const request = createCallToolRequest('list_work_items', {
        projectId: 'myProject',
      });

      const result = await handleWorkItemsRequest(mockConnection, request);

      expect(workItemModule.ListWorkItemsSchema.parse).toHaveBeenCalledWith({
        projectId: 'myProject',
      });
      expect(workItemModule.listWorkItems).toHaveBeenCalled();
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify([{ id: 123 }, { id: 456 }], null, 2),
          },
        ],
      });
    });

    it('should handle create_work_item requests', async () => {
      const request = createCallToolRequest('create_work_item', {
        projectId: 'myProject',
        workItemType: 'Task',
        title: 'New Task',
      });

      const result = await handleWorkItemsRequest(mockConnection, request);

      expect(workItemModule.CreateWorkItemSchema.parse).toHaveBeenCalledWith({
        projectId: 'myProject',
        workItemType: 'Task',
        title: 'New Task',
      });
      expect(workItemModule.createWorkItem).toHaveBeenCalled();
      expect(result).toEqual({
        content: [{ type: 'text', text: JSON.stringify({ id: 789 }, null, 2) }],
      });
    });

    it('should handle update_work_item requests', async () => {
      const request = createCallToolRequest('update_work_item', {
        workItemId: 123,
        title: 'Updated Title',
      });

      const result = await handleWorkItemsRequest(mockConnection, request);

      expect(workItemModule.UpdateWorkItemSchema.parse).toHaveBeenCalledWith({
        workItemId: 123,
        title: 'Updated Title',
      });
      expect(workItemModule.updateWorkItem).toHaveBeenCalled();
      expect(result).toEqual({
        content: [{ type: 'text', text: JSON.stringify({ id: 123 }, null, 2) }],
      });
    });

    it('should handle manage_work_item_link requests', async () => {
      const request = createCallToolRequest('manage_work_item_link', {
        sourceWorkItemId: 123,
        targetWorkItemId: 456,
        operation: 'add',
        relationType: 'System.LinkTypes.Hierarchy-Forward',
      });

      const result = await handleWorkItemsRequest(mockConnection, request);

      expect(
        workItemModule.ManageWorkItemLinkSchema.parse,
      ).toHaveBeenCalledWith({
        sourceWorkItemId: 123,
        targetWorkItemId: 456,
        operation: 'add',
        relationType: 'System.LinkTypes.Hierarchy-Forward',
      });
      expect(workItemModule.manageWorkItemLink).toHaveBeenCalled();
      expect(result).toEqual({
        content: [{ type: 'text', text: JSON.stringify({ id: 123 }, null, 2) }],
      });
    });

    it('should throw an error for unknown work items tools', async () => {
      const request = createCallToolRequest('unknown_tool', {});

      await expect(
        handleWorkItemsRequest(mockConnection, request),
      ).rejects.toThrow('Unknown work items tool: unknown_tool');
    });
  });
});
