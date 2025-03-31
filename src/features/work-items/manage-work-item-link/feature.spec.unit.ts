import { manageWorkItemLink } from './feature';
import { AzureDevOpsResourceNotFoundError } from '../../../shared/errors';

describe('manageWorkItemLink', () => {
  let mockConnection: any;
  let mockWitApi: any;

  const projectId = 'test-project';
  const sourceWorkItemId = 123;
  const targetWorkItemId = 456;
  const relationType = 'System.LinkTypes.Related';
  const newRelationType = 'System.LinkTypes.Hierarchy-Forward';
  const comment = 'Test link comment';

  beforeEach(() => {
    mockWitApi = {
      updateWorkItem: jest.fn(),
    };

    mockConnection = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue(mockWitApi),
      serverUrl: 'https://dev.azure.com/test-org',
    };
  });

  test('should add a work item link', async () => {
    // Setup
    const updatedWorkItem = {
      id: sourceWorkItemId,
      fields: { 'System.Title': 'Test' },
    };
    mockWitApi.updateWorkItem.mockResolvedValue(updatedWorkItem);

    // Execute
    const result = await manageWorkItemLink(mockConnection, projectId, {
      sourceWorkItemId,
      targetWorkItemId,
      operation: 'add',
      relationType,
      comment,
    });

    // Verify
    expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalled();
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledWith(
      {}, // customHeaders
      [
        {
          op: 'add',
          path: '/relations/-',
          value: {
            rel: relationType,
            url: `${mockConnection.serverUrl}/_apis/wit/workItems/${targetWorkItemId}`,
            attributes: { comment },
          },
        },
      ],
      sourceWorkItemId,
      projectId,
    );
    expect(result).toEqual(updatedWorkItem);
  });

  test('should remove a work item link', async () => {
    // Setup
    const updatedWorkItem = {
      id: sourceWorkItemId,
      fields: { 'System.Title': 'Test' },
    };
    mockWitApi.updateWorkItem.mockResolvedValue(updatedWorkItem);

    // Execute
    const result = await manageWorkItemLink(mockConnection, projectId, {
      sourceWorkItemId,
      targetWorkItemId,
      operation: 'remove',
      relationType,
    });

    // Verify
    expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalled();
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledWith(
      {}, // customHeaders
      [
        {
          op: 'remove',
          path: `/relations/+[rel=${relationType};url=${mockConnection.serverUrl}/_apis/wit/workItems/${targetWorkItemId}]`,
        },
      ],
      sourceWorkItemId,
      projectId,
    );
    expect(result).toEqual(updatedWorkItem);
  });

  test('should update a work item link', async () => {
    // Setup
    const updatedWorkItem = {
      id: sourceWorkItemId,
      fields: { 'System.Title': 'Test' },
    };
    mockWitApi.updateWorkItem.mockResolvedValue(updatedWorkItem);

    // Execute
    const result = await manageWorkItemLink(mockConnection, projectId, {
      sourceWorkItemId,
      targetWorkItemId,
      operation: 'update',
      relationType,
      newRelationType,
      comment,
    });

    // Verify
    expect(mockConnection.getWorkItemTrackingApi).toHaveBeenCalled();
    expect(mockWitApi.updateWorkItem).toHaveBeenCalledWith(
      {}, // customHeaders
      [
        {
          op: 'remove',
          path: `/relations/+[rel=${relationType};url=${mockConnection.serverUrl}/_apis/wit/workItems/${targetWorkItemId}]`,
        },
        {
          op: 'add',
          path: '/relations/-',
          value: {
            rel: newRelationType,
            url: `${mockConnection.serverUrl}/_apis/wit/workItems/${targetWorkItemId}`,
            attributes: { comment },
          },
        },
      ],
      sourceWorkItemId,
      projectId,
    );
    expect(result).toEqual(updatedWorkItem);
  });

  test('should throw error when work item not found', async () => {
    // Setup
    mockWitApi.updateWorkItem.mockResolvedValue(null);

    // Execute and verify
    await expect(
      manageWorkItemLink(mockConnection, projectId, {
        sourceWorkItemId,
        targetWorkItemId,
        operation: 'add',
        relationType,
      }),
    ).rejects.toThrow(AzureDevOpsResourceNotFoundError);
  });

  test('should throw error when update operation missing newRelationType', async () => {
    // Execute and verify
    await expect(
      manageWorkItemLink(mockConnection, projectId, {
        sourceWorkItemId,
        targetWorkItemId,
        operation: 'update',
        relationType,
        // newRelationType is missing
      }),
    ).rejects.toThrow('New relation type is required for update operation');
  });
});
