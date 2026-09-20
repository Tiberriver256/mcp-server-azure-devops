import { isWorkItemsRequest, handleWorkItemsRequest } from './';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import * as workItemModule from './';

jest.mock('./get-work-item', () => ({ getWorkItem: jest.fn() }));
jest.mock('./list-work-items', () => ({ listWorkItems: jest.fn() }));
jest.mock('./create-work-item', () => ({ createWorkItem: jest.fn() }));
jest.mock('./update-work-item', () => ({ updateWorkItem: jest.fn() }));
jest.mock('./manage-work-item-link', () => ({ manageWorkItemLink: jest.fn() }));
jest.mock('./get-work-item-comments', () => ({ getWorkItemComments: jest.fn() }));
jest.mock('./create-work-item-attachment', () => ({ createWorkItemAttachment: jest.fn() }));
jest.mock('./get-work-item-attachment', () => ({ getWorkItemAttachment: jest.fn() }));
jest.mock('./delete-work-item-attachment', () => ({ deleteWorkItemAttachment: jest.fn() }));

const createCallToolRequest = (name: string, args: any): CallToolRequest =>
  ({ method: 'tools/call', params: { name, arguments: args } }) as unknown as CallToolRequest;

describe('Work Items Request Handlers', () => {
  describe('isWorkItemsRequest', () => {
    it('should return true for work items requests', () => {
      [
        'get_work_item',
        'list_work_items',
        'create_work_item',
        'update_work_item',
        'manage_work_item_link',
        'get_work_item_comments',
        'create_work_item_attachment',
        'get_work_item_attachment',
        'delete_work_item_attachment',
      ].forEach((name) => {
        expect(isWorkItemsRequest(createCallToolRequest(name, {}))).toBe(true);
      });
    });

    it('should return false for non-work items requests', () => {
      expect(isWorkItemsRequest(createCallToolRequest('get_project', {}))).toBe(false);
    });
  });

  describe('handleWorkItemsRequest', () => {
    let mockConnection: WebApi;

    beforeEach(() => {
      mockConnection = {} as WebApi;
      jest.spyOn(workItemModule.GetWorkItemSchema, 'parse').mockReturnValue({ workItemId: 123, expand: undefined } as any);
      jest.spyOn(workItemModule.ListWorkItemsSchema, 'parse').mockReturnValue({ projectId: 'myProject' } as any);
      jest.spyOn(workItemModule.CreateWorkItemSchema, 'parse').mockReturnValue({ projectId: 'myProject', workItemType: 'Task', title: 'New Task' } as any);
      jest.spyOn(workItemModule.UpdateWorkItemSchema, 'parse').mockReturnValue({ workItemId: 123, title: 'Updated Title' } as any);
      jest.spyOn(workItemModule.ManageWorkItemLinkSchema, 'parse').mockReturnValue({ sourceWorkItemId: 123, targetWorkItemId: 456, operation: 'add', relationType: 'System.LinkTypes.Hierarchy-Forward' } as any);
      jest.spyOn(workItemModule.GetWorkItemCommentsSchema, 'parse').mockReturnValue({ workItemId: 123, projectId: 'myProject', top: 5, continuationToken: 'token123', includeDeleted: true, expand: 'all', order: 'asc' } as any);
      jest.spyOn(workItemModule.CreateWorkItemAttachmentSchema, 'parse').mockReturnValue({ workItemId: 123, filePath: '/path/to/file.txt' } as any);
      jest.spyOn(workItemModule.GetWorkItemAttachmentSchema, 'parse').mockReturnValue({ attachmentId: 'abc-123-def-456', outputPath: '/path/to/output.txt' } as any);
      jest.spyOn(workItemModule.DeleteWorkItemAttachmentSchema, 'parse').mockReturnValue({ workItemId: 123, attachmentId: 'abc-123-def-456' } as any);
      jest.spyOn(workItemModule, 'getWorkItem').mockResolvedValue({ id: 123 } as any);
      jest.spyOn(workItemModule, 'listWorkItems').mockResolvedValue([{ id: 123 }, { id: 456 }] as any);
      jest.spyOn(workItemModule, 'createWorkItem').mockResolvedValue({ id: 789 } as any);
      jest.spyOn(workItemModule, 'updateWorkItem').mockResolvedValue({ id: 123 } as any);
      jest.spyOn(workItemModule, 'manageWorkItemLink').mockResolvedValue({ id: 123 } as any);
      jest.spyOn(workItemModule, 'getWorkItemComments').mockResolvedValue({ comments: [{ id: 1 }] } as any);
      jest.spyOn(workItemModule, 'createWorkItemAttachment').mockResolvedValue({ id: 123, relations: [] } as any);
      jest.spyOn(workItemModule, 'getWorkItemAttachment').mockResolvedValue({ filePath: '/path/to/output.txt', fileName: 'output.txt', size: 1024 } as any);
      jest.spyOn(workItemModule, 'deleteWorkItemAttachment').mockResolvedValue({ id: 123 } as any);
    });

    afterEach(() => jest.resetAllMocks());

    it('should handle get_work_item requests', async () => {
      const result = await handleWorkItemsRequest(mockConnection, createCallToolRequest('get_work_item', { workItemId: 123 }));
      expect(workItemModule.getWorkItem).toHaveBeenCalledWith(mockConnection, 123, undefined);
      expect(result).toEqual({ content: [{ type: 'text', text: JSON.stringify({ id: 123 }, null, 2) }] });
    });

    it('should handle create_work_item_attachment requests', async () => {
      const args = { workItemId: 123, filePath: '/path/to/file.txt' };
      const result = await handleWorkItemsRequest(mockConnection, createCallToolRequest('create_work_item_attachment', args));
      expect(workItemModule.CreateWorkItemAttachmentSchema.parse).toHaveBeenCalledWith(args);
      expect(workItemModule.createWorkItemAttachment).toHaveBeenCalled();
      expect(result).toEqual({ content: [{ type: 'text', text: JSON.stringify({ id: 123, relations: [] }, null, 2) }] });
    });

    it('should handle get_work_item_attachment requests', async () => {
      const args = { attachmentId: 'abc-123-def-456', outputPath: '/path/to/output.txt' };
      const result = await handleWorkItemsRequest(mockConnection, createCallToolRequest('get_work_item_attachment', args));
      expect(workItemModule.GetWorkItemAttachmentSchema.parse).toHaveBeenCalledWith(args);
      expect(workItemModule.getWorkItemAttachment).toHaveBeenCalled();
      expect(result.content[0].text).toContain('output.txt');
    });

    it('should handle delete_work_item_attachment requests', async () => {
      const args = { workItemId: 123, attachmentId: 'abc-123-def-456' };
      const result = await handleWorkItemsRequest(mockConnection, createCallToolRequest('delete_work_item_attachment', args));
      expect(workItemModule.DeleteWorkItemAttachmentSchema.parse).toHaveBeenCalledWith(args);
      expect(workItemModule.deleteWorkItemAttachment).toHaveBeenCalled();
      expect(result).toEqual({ content: [{ type: 'text', text: JSON.stringify({ id: 123 }, null, 2) }] });
    });

    it('should handle get_work_item_comments requests', async () => {
      const args = { workItemId: 123, projectId: 'myProject', top: 5, continuationToken: 'token123', includeDeleted: true, expand: 'all', order: 'asc' };
      const result = await handleWorkItemsRequest(mockConnection, createCallToolRequest('get_work_item_comments', args));
      expect(workItemModule.getWorkItemComments).toHaveBeenCalledWith(mockConnection, args);
      expect(result).toEqual({ content: [{ type: 'text', text: JSON.stringify({ comments: [{ id: 1 }] }, null, 2) }] });
    });

    it('should throw an error for unknown work items tools', async () => {
      await expect(handleWorkItemsRequest(mockConnection, createCallToolRequest('unknown_tool', {}))).rejects.toThrow('Unknown work items tool: unknown_tool');
    });
  });
});
