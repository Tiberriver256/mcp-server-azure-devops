import { WebApi } from 'azure-devops-node-api';
import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';

/**
 * Get the description of a specific work item
 *
 * @param connection The Azure DevOps WebApi connection
 * @param workItemId The ID of the work item
 * @returns The description of the work item in HTML format
 */
export async function getWorkItemDescription(
  connection: WebApi,
  workItemId: number,
): Promise<string> {
  try {
    const witApi = await connection.getWorkItemTrackingApi();
    const workItem = await witApi.getWorkItem(workItemId, [
      'System.Description',
    ]);

    if (!workItem) {
      throw new AzureDevOpsResourceNotFoundError(
        `Work item ${workItemId} not found`,
      );
    }

    const description = workItem.fields?.['System.Description'] ?? '';
    return description;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    // Check for specific error types and convert to appropriate Azure DevOps errors
    if (error instanceof Error) {
      if (
        error.message.includes('Authentication') ||
        error.message.includes('Unauthorized')
      ) {
        throw new AzureDevOpsAuthenticationError(
          `Failed to authenticate: ${error.message}`,
        );
      }

      if (
        error.message.includes('not found') ||
        error.message.includes('does not exist')
      ) {
        throw new AzureDevOpsResourceNotFoundError(
          `Work item ${workItemId} not found: ${error.message}`,
        );
      }
    }

    throw new AzureDevOpsError(
      `Failed to get work item description: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
