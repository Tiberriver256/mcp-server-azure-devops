import { WorkItem } from '../types';

/**
 * Standard work item fixture for tests
 */
export const createWorkItemFixture = (
  id: number,
  title: string = 'Test Work Item',
  state: string = 'Active',
  assignedTo?: string,
): WorkItem => {
  return {
    id,
    rev: 1,
    fields: {
      'System.Id': id,
      'System.Title': title,
      'System.State': state,
      ...(assignedTo ? { 'System.AssignedTo': assignedTo } : {}),
    },
    url: `https://dev.azure.com/test-org/test-project/_apis/wit/workItems/${id}`,
  } as WorkItem;
};

/**
 * Create a collection of work items for list tests
 */
export const createWorkItemsFixture = (count: number = 3): WorkItem[] => {
  return Array.from({ length: count }, (_, i) =>
    createWorkItemFixture(
      i + 1,
      `Work Item ${i + 1}`,
      i % 2 === 0 ? 'Active' : 'Resolved',
    ),
  );
};
