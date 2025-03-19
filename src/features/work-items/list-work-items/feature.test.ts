import { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsResourceNotFoundError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsError,
} from '../../../shared/errors';
import { listWorkItems } from './feature';

// Mock the dependency modules
jest.mock('azure-devops-node-api');

const mockWorkItemTrackingApi = {
  queryByWiql: jest.fn(),
  getWorkItems: jest.fn(),
  queryById: jest.fn(),
};

// Create the mock web API with a jest function to allow mockRejectedValueOnce
const getWorkItemTrackingApiFn = jest
  .fn()
  .mockResolvedValue(mockWorkItemTrackingApi);
const mockWebApi = {
  getWorkItemTrackingApi: getWorkItemTrackingApiFn,
} as unknown as WebApi;

describe('listWorkItems', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return work items using WIQL query', async () => {
    // Mock the query result from the API
    (mockWorkItemTrackingApi.queryByWiql as jest.Mock).mockResolvedValueOnce({
      workItems: [{ id: 1 }, { id: 2 }],
    });

    // Mock the work items data
    (mockWorkItemTrackingApi.getWorkItems as jest.Mock).mockResolvedValueOnce([
      { id: 1, fields: { 'System.Title': 'First work item' } },
      { id: 2, fields: { 'System.Title': 'Second work item' } },
    ]);

    const result = await listWorkItems(mockWebApi, {
      projectId: 'project',
      wiql: 'SELECT * FROM WorkItems',
    });

    // Check the results match what was returned from the API
    expect(result).toEqual([
      { id: 1, fields: { 'System.Title': 'First work item' } },
      { id: 2, fields: { 'System.Title': 'Second work item' } },
    ]);

    // Verify that the correct API calls were made
    expect(mockWorkItemTrackingApi.queryByWiql).toHaveBeenCalledWith(
      { query: 'SELECT * FROM WorkItems' },
      { project: 'project', team: undefined },
    );
    expect(mockWorkItemTrackingApi.getWorkItems).toHaveBeenCalledWith(
      [1, 2],
      ['System.Id', 'System.Title', 'System.State', 'System.AssignedTo'],
      undefined,
      4,
    );
  });

  it('should handle empty query results', async () => {
    // Setup mock responses for empty query results
    mockWorkItemTrackingApi.queryByWiql.mockResolvedValue({
      workItems: [],
    });

    // Call the function
    const result = await listWorkItems(mockWebApi, {
      projectId: 'project',
      wiql: 'SELECT * FROM WorkItems WHERE [System.Id] = -1', // Query that would return no items
    });

    // Verify the results are empty
    expect(result).toEqual([]);

    // Verify that getWorkItems was not called since there were no IDs to fetch
    expect(mockWorkItemTrackingApi.getWorkItems).not.toHaveBeenCalled();
  });

  it('should use saved query when queryId is provided', async () => {
    // Setup mock responses
    const mockQueryResult = {
      workItems: [{ id: 3 }, { id: 4 }],
    };

    const mockWorkItems = [
      { id: 3, fields: { 'System.Title': 'Work Item 3' } },
      { id: 4, fields: { 'System.Title': 'Work Item 4' } },
    ];

    mockWorkItemTrackingApi.queryById.mockResolvedValue(mockQueryResult);
    mockWorkItemTrackingApi.getWorkItems.mockResolvedValue(mockWorkItems);

    // Call the function
    const result = await listWorkItems(mockWebApi, {
      projectId: 'project',
      queryId: 'query-1234',
    });

    // Verify the results
    expect(result).toEqual(mockWorkItems);
    expect(mockWorkItemTrackingApi.queryById).toHaveBeenCalledWith(
      'query-1234',
      { project: 'project', team: undefined },
    );
  });

  it('should handle pagination with top and skip parameters', async () => {
    // Setup mock responses
    const mockQueryResult = {
      workItems: Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })),
    };

    const mockWorkItems = [
      { id: 11, fields: { 'System.Title': 'Work Item 11' } },
      { id: 12, fields: { 'System.Title': 'Work Item 12' } },
      { id: 13, fields: { 'System.Title': 'Work Item 13' } },
      { id: 14, fields: { 'System.Title': 'Work Item 14' } },
      { id: 15, fields: { 'System.Title': 'Work Item 15' } },
    ];

    mockWorkItemTrackingApi.queryByWiql.mockResolvedValue(mockQueryResult);
    mockWorkItemTrackingApi.getWorkItems.mockResolvedValue(mockWorkItems);

    // Call the function with pagination parameters
    const result = await listWorkItems(mockWebApi, {
      projectId: 'project',
      wiql: 'SELECT * FROM WorkItems',
      top: 5,
      skip: 10,
    });

    // Verify the results
    expect(result).toEqual(mockWorkItems);
    expect(mockWorkItemTrackingApi.getWorkItems).toHaveBeenCalledWith(
      [11, 12, 13, 14, 15], // Skip 10, take 5
      expect.any(Array),
      undefined,
      expect.any(Number),
    );
  });

  it('should handle empty work items array from getWorkItems', async () => {
    // Setup mock responses
    mockWorkItemTrackingApi.queryByWiql.mockResolvedValue({
      workItems: [{ id: 1 }, { id: 2 }],
    });

    // Mock getWorkItems to return an empty array (unusual but could happen)
    mockWorkItemTrackingApi.getWorkItems.mockResolvedValue([]);

    // Call the function
    const result = await listWorkItems(mockWebApi, {
      projectId: 'project',
      wiql: 'SELECT * FROM WorkItems',
    });

    // Verify the results are empty
    expect(result).toEqual([]);
  });

  it('should throw AzureDevOpsAuthenticationError when authentication fails', async () => {
    // Mock an authentication error
    getWorkItemTrackingApiFn.mockRejectedValueOnce(
      new AzureDevOpsAuthenticationError('Authentication failed'),
    );

    // Call the function and expect it to throw
    await expect(
      listWorkItems(mockWebApi, {
        projectId: 'project',
        wiql: 'SELECT * FROM WorkItems',
      }),
    ).rejects.toThrow(AzureDevOpsAuthenticationError);
  });

  it('should throw AzureDevOpsResourceNotFoundError when project is not found', async () => {
    // Mock a project not found error
    mockWorkItemTrackingApi.queryByWiql.mockRejectedValueOnce(
      new AzureDevOpsResourceNotFoundError('Project not found'),
    );

    // Call the function and expect it to throw
    await expect(
      listWorkItems(mockWebApi, {
        projectId: 'non-existent',
        wiql: 'SELECT * FROM WorkItems',
      }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
  });

  it('should convert generic Error with "not found" message to AzureDevOpsResourceNotFoundError', async () => {
    // Mock a generic error with "not found" in the message
    mockWorkItemTrackingApi.queryByWiql.mockRejectedValueOnce(
      new Error('The specified project was not found')
    );

    // Call the function and expect it to throw
    await expect(
      listWorkItems(mockWebApi, {
        projectId: 'project',
        wiql: 'SELECT * FROM WorkItems',
      }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
  });

  it('should convert generic Error with "does not exist" message to AzureDevOpsResourceNotFoundError', async () => {
    // Mock a generic error with "does not exist" in the message
    mockWorkItemTrackingApi.queryByWiql.mockRejectedValueOnce(
      new Error('The project does not exist')
    );

    // Call the function and expect it to throw
    await expect(
      listWorkItems(mockWebApi, {
        projectId: 'project',
        wiql: 'SELECT * FROM WorkItems',
      }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
  });

  it('should convert generic Error with "Unauthorized" message to AzureDevOpsAuthenticationError', async () => {
    // Mock a generic error with "Unauthorized" in the message
    mockWorkItemTrackingApi.queryByWiql.mockRejectedValueOnce(
      new Error('Unauthorized access to the project')
    );

    // Call the function and expect it to throw
    await expect(
      listWorkItems(mockWebApi, {
        projectId: 'project',
        wiql: 'SELECT * FROM WorkItems',
      }),
    ).rejects.toThrow(AzureDevOpsAuthenticationError);
  });

  it('should wrap non-Error objects in AzureDevOpsError', async () => {
    // Mock a string error (not an Error instance)
    mockWorkItemTrackingApi.queryByWiql.mockRejectedValueOnce('String error message');

    // Call the function and expect it to throw
    await expect(
      listWorkItems(mockWebApi, {
        projectId: 'project',
        wiql: 'SELECT * FROM WorkItems',
      }),
    ).rejects.toThrow(AzureDevOpsError);
    
    // Reset the mock for the second test
    mockWorkItemTrackingApi.queryByWiql.mockRejectedValueOnce('String error message');
    
    await expect(
      listWorkItems(mockWebApi, {
        projectId: 'project',
        wiql: 'SELECT * FROM WorkItems',
      }),
    ).rejects.toThrow('Failed to list work items: String error message');
  });
});
