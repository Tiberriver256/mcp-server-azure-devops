import { WebApi } from 'azure-devops-node-api';
import { 
  WorkItem, 
  WorkItemExpand, 
  WorkItemReference 
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { getWorkItem, listWorkItems } from '../../../src/operations/workitems';

// Mock the WorkItemTrackingApi
const mockGetWorkItem = jest.fn();
const mockGetWorkItems = jest.fn();
const mockQueryById = jest.fn();
const mockQueryByWiql = jest.fn();
const mockWitApi = {
  getWorkItem: mockGetWorkItem,
  getWorkItems: mockGetWorkItems,
  queryById: mockQueryById,
  queryByWiql: mockQueryByWiql
};

// Mock the WebApi
const mockGetWitApi = jest.fn().mockResolvedValue(mockWitApi);
const mockWebApi = {
  getWorkItemTrackingApi: mockGetWitApi
} as unknown as WebApi;

describe('Work Items Additional Coverage Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getWorkItem', () => {
    it('should pass expand parameter when provided', async () => {
      // Mock getWorkItem to return a work item
      const mockWorkItem: WorkItem = {
        id: 123,
        fields: { 'System.Title': 'Test Work Item' }
      } as WorkItem;
      mockGetWorkItem.mockResolvedValueOnce(mockWorkItem);

      const result = await getWorkItem(mockWebApi, 123, WorkItemExpand.All);

      expect(result).toEqual(mockWorkItem);
      expect(mockGetWorkItem).toHaveBeenCalledWith(
        123,
        expect.arrayContaining(['System.Id', 'System.Title', 'System.State', 'System.AssignedTo']),
        undefined,
        WorkItemExpand.All
      );
    });

    it('should handle non-Error objects in catch block', async () => {
      // Mock getWorkItem to throw a non-Error object
      mockGetWorkItem.mockRejectedValueOnce('String error');

      await expect(getWorkItem(mockWebApi, 123))
        .rejects.toThrow('Failed to get work item: String error');
    });
  });

  describe('listWorkItems', () => {
    it('should handle null workItems from getWorkItems', async () => {
      // Mock queryByWiql to return work item references
      mockQueryByWiql.mockResolvedValueOnce({
        workItems: [{ id: 123 }, { id: 456 }] as WorkItemReference[]
      });
      
      // Mock getWorkItems to return null
      mockGetWorkItems.mockResolvedValueOnce(null);

      const result = await listWorkItems(mockWebApi, { projectId: 'project1' });

      expect(result).toEqual([]);
      expect(mockQueryByWiql).toHaveBeenCalled();
      expect(mockGetWorkItems).toHaveBeenCalled();
    });

    it('should filter out undefined work items', async () => {
      // Mock queryByWiql to return work item references
      mockQueryByWiql.mockResolvedValueOnce({
        workItems: [{ id: 123 }, { id: 456 }] as WorkItemReference[]
      });
      
      // Mock getWorkItems to return array with undefined items
      const mockWorkItem: WorkItem = {
        id: 123,
        fields: { 'System.Title': 'Test Work Item' }
      } as WorkItem;
      mockGetWorkItems.mockResolvedValueOnce([mockWorkItem, undefined]);

      const result = await listWorkItems(mockWebApi, { projectId: 'project1' });

      expect(result).toEqual([mockWorkItem]);
      expect(mockQueryByWiql).toHaveBeenCalled();
      expect(mockGetWorkItems).toHaveBeenCalled();
    });

    it('should filter out undefined work item IDs', async () => {
      // Mock queryByWiql to return work item references with undefined ID
      mockQueryByWiql.mockResolvedValueOnce({
        workItems: [{ id: 123 }, { id: undefined }] as WorkItemReference[]
      });
      
      // Mock getWorkItems to return a work item
      const mockWorkItem: WorkItem = {
        id: 123,
        fields: { 'System.Title': 'Test Work Item' }
      } as WorkItem;
      mockGetWorkItems.mockResolvedValueOnce([mockWorkItem]);

      const result = await listWorkItems(mockWebApi, { projectId: 'project1' });

      expect(result).toEqual([mockWorkItem]);
      expect(mockQueryByWiql).toHaveBeenCalled();
      expect(mockGetWorkItems).toHaveBeenCalledWith(
        [123],
        expect.any(Array),
        undefined,
        WorkItemExpand.All
      );
    });

    it('should handle non-Error objects in catch block', async () => {
      // Mock queryByWiql to throw a non-Error object
      mockQueryByWiql.mockRejectedValueOnce('String error');

      await expect(listWorkItems(mockWebApi, { projectId: 'project1' }))
        .rejects.toThrow('Failed to list work items: String error');
    });
  });
}); 