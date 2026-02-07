/**
 * Schema and types for execute-wiql feature
 */
import {
  WorkItem,
  QueryType,
  WorkItemFieldReference,
  WorkItemQuerySortColumn,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';

/**
 * Options for executing a WIQL query
 */
export interface ExecuteWiqlOptions {
  /** The WIQL query to execute */
  query: string;
  /** The project ID or name (optional) */
  projectId?: string;
  /** The team ID (optional) */
  teamId?: string;
  /** Maximum number of work items to return */
  top?: number;
  /** Whether to include time precision in date fields */
  timePrecision?: boolean;
  /** Level of detail to include in the response */
  expand?: 'none' | 'relations' | 'fields' | 'links' | 'all';
}

/**
 * Result of executing a WIQL query
 */
export interface WiqlQueryResult {
  /** The work items returned by the query */
  workItems: WorkItem[];
  /** The type of query (flat, tree, oneHop) */
  queryType?: QueryType;
  /** The columns defined in the query */
  columns?: WorkItemFieldReference[];
  /** The date/time when the query was executed */
  asOf?: Date;
  /** Sort columns for the query */
  sortColumns?: WorkItemQuerySortColumn[];
}
