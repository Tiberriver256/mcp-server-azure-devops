import { WebApi } from 'azure-devops-node-api';
import { TeamContext } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import { WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import { ExecuteWiqlOptions, WiqlQueryResult } from './schema';

/**
 * Map expand parameter to Azure DevOps API enum
 */
function mapExpandParameter(
  expand?: 'none' | 'relations' | 'fields' | 'links' | 'all',
): WorkItemExpand {
  const expandMap: Record<string, WorkItemExpand> = {
    none: WorkItemExpand.None,
    relations: WorkItemExpand.Relations,
    fields: WorkItemExpand.Fields,
    links: WorkItemExpand.Links,
    all: WorkItemExpand.All,
  };
  return expandMap[expand || 'fields'] || WorkItemExpand.Fields;
}

/**
 * Execute a WIQL query
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options for executing the WIQL query
 * @returns Query result with work items and metadata
 */
export async function executeWiql(
  connection: WebApi,
  options: ExecuteWiqlOptions,
): Promise<WiqlQueryResult> {
  try {
    const witApi = await connection.getWorkItemTrackingApi();
    const {
      query,
      projectId,
      teamId,
      top = 200,
      timePrecision = false,
      expand = 'fields',
    } = options;

    // Create team context if project or team specified
    const teamContext: TeamContext | undefined =
      projectId || teamId
        ? {
            project: projectId,
            team: teamId,
          }
        : undefined;

    // Execute WIQL query
    const queryResult = await witApi.queryByWiql(
      { query },
      teamContext,
      timePrecision,
    );

    if (!queryResult) {
      return {
        workItems: [],
        queryType: undefined,
        columns: [],
      };
    }

    // Extract work item references
    const workItemRefs = queryResult.workItems || [];

    // Apply top limit
    const limitedRefs = workItemRefs.slice(0, top);

    // Extract work item IDs
    const workItemIds = limitedRefs
      .map((ref) => ref.id)
      .filter((id): id is number => id !== undefined);

    if (workItemIds.length === 0) {
      return {
        workItems: [],
        queryType: queryResult.queryType,
        columns: queryResult.columns || [],
        asOf: queryResult.asOf,
        sortColumns: queryResult.sortColumns || [],
      };
    }

    // Determine which fields to fetch based on expand parameter
    let fields: string[] | undefined;
    if (expand === 'none') {
      fields = ['System.Id'];
    } else if (expand === 'fields') {
      // Fetch fields specified in query columns
      if (queryResult.columns && queryResult.columns.length > 0) {
        fields = queryResult.columns.map((col) => col.referenceName || '');
      }
    }
    // For 'relations', 'links', 'all' - fetch all fields (fields = undefined)

    // Fetch full work item details
    const expandEnum = mapExpandParameter(expand);
    const workItems = await witApi.getWorkItems(
      workItemIds,
      fields,
      queryResult.asOf,
      expandEnum,
    );

    return {
      workItems: workItems || [],
      queryType: queryResult.queryType,
      columns: queryResult.columns || [],
      asOf: queryResult.asOf,
      sortColumns: queryResult.sortColumns || [],
    };
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
          `Resource not found: ${error.message}`,
        );
      }
    }

    throw new AzureDevOpsError(
      `Failed to execute WIQL query: ${error instanceof Error ? error.message : String(error)}\n\nQuery: ${options.query}`,
    );
  }
}
