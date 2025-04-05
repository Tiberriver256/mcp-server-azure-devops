/**
 * Options for searching code in Azure DevOps repositories
 */
export interface SearchCodeOptions {
  searchText: string;
  projectId?: string;
  filters?: {
    Repository?: string[];
    Path?: string[];
    Branch?: string[];
    CodeElement?: string[];
  };
  top?: number;
  skip?: number;
  includeSnippet?: boolean;
  includeContent?: boolean;
}

/**
 * Request body for the Azure DevOps Search API
 */
export interface CodeSearchRequest {
  searchText: string;
  $skip?: number;
  $top?: number;
  filters?: {
    Project?: string[];
    Repository?: string[];
    Path?: string[];
    Branch?: string[];
    CodeElement?: string[];
  };
  includeFacets?: boolean;
  includeSnippet?: boolean;
}

/**
 * Match information for search results
 */
export interface CodeSearchMatch {
  charOffset: number;
  length: number;
}

/**
 * Collection information for search results
 */
export interface CodeSearchCollection {
  name: string;
}

/**
 * Project information for search results
 */
export interface CodeSearchProject {
  name: string;
  id: string;
}

/**
 * Repository information for search results
 */
export interface CodeSearchRepository {
  name: string;
  id: string;
  type: string;
}

/**
 * Version information for search results
 */
export interface CodeSearchVersion {
  branchName: string;
  changeId: string;
}

/**
 * Individual code search result
 */
export interface CodeSearchResult {
  fileName: string;
  path: string;
  content?: string; // Added to store full file content
  matches: {
    content?: CodeSearchMatch[];
    fileName?: CodeSearchMatch[];
  };
  collection: CodeSearchCollection;
  project: CodeSearchProject;
  repository: CodeSearchRepository;
  versions: CodeSearchVersion[];
  contentId: string;
}

/**
 * Facet information for search results
 */
export interface CodeSearchFacet {
  name: string;
  id: string;
  resultCount: number;
}

/**
 * Response from the Azure DevOps Search API
 */
export interface CodeSearchResponse {
  count: number;
  results: CodeSearchResult[];
  infoCode?: number;
  facets?: {
    Project?: CodeSearchFacet[];
    Repository?: CodeSearchFacet[];
    Path?: CodeSearchFacet[];
    Branch?: CodeSearchFacet[];
    CodeElement?: CodeSearchFacet[];
  };
}

/**
 * Options for searching wiki pages in Azure DevOps projects
 */
export interface SearchWikiOptions {
  /**
   * The text to search for within wiki pages
   */
  searchText: string;

  /**
   * The ID or name of the project to search in
   * If not provided, search will be performed across the entire organization
   */
  projectId?: string;

  /**
   * Optional filters to narrow search results
   */
  filters?: {
    /**
     * Filter by project names. Useful for cross-project searches.
     */
    Project?: string[];
  };

  /**
   * Number of results to return
   * @default 100
   * @minimum 1
   * @maximum 1000
   */
  top?: number;

  /**
   * Number of results to skip for pagination
   * @default 0
   * @minimum 0
   */
  skip?: number;

  /**
   * Whether to include faceting in results
   * @default true
   */
  includeFacets?: boolean;
}

/**
 * Request body for the Azure DevOps Wiki Search API
 */
export interface WikiSearchRequest {
  /**
   * The search text to find in wiki pages
   */
  searchText: string;

  /**
   * Number of results to skip for pagination
   */
  $skip?: number;

  /**
   * Number of results to return
   */
  $top?: number;

  /**
   * Filters to be applied. Set to null if no filters are needed.
   */
  filters?: {
    /**
     * Filter by project names
     */
    Project?: string[];
  };

  /**
   * Options for sorting search results
   * If null, results are sorted by relevance
   */
  $orderBy?: SortOption[];

  /**
   * Whether to include faceting in the result
   * @default false
   */
  includeFacets?: boolean;
}

/**
 * Sort option for search results
 */
export interface SortOption {
  /**
   * Field to sort by
   */
  field: string;

  /**
   * Sort direction
   */
  sortOrder: 'asc' | 'desc' | 'ASC' | 'DESC';
}

/**
 * Defines the matched terms in the field of the wiki result
 */
export interface WikiHit {
  /**
   * Reference name of the highlighted field
   */
  fieldReferenceName: string;

  /**
   * Matched/highlighted snippets of the field
   */
  highlights: string[];
}

/**
 * Defines the wiki result that matched a wiki search request
 */
export interface WikiResult {
  /**
   * Name of the result file
   */
  fileName: string;

  /**
   * Path at which result file is present
   */
  path: string;

  /**
   * Collection of the result file
   */
  collection: {
    /**
     * Name of the collection
     */
    name: string;
  };

  /**
   * Project details of the wiki document
   */
  project: {
    /**
     * ID of the project
     */
    id: string;

    /**
     * Name of the project
     */
    name: string;

    /**
     * Visibility of the project
     */
    visibility?: string;
  };

  /**
   * Wiki information for the result
   */
  wiki: {
    /**
     * ID of the wiki
     */
    id: string;

    /**
     * Mapped path for the wiki
     */
    mappedPath: string;

    /**
     * Name of the wiki
     */
    name: string;

    /**
     * Version for wiki
     */
    version: string;
  };

  /**
   * Content ID of the result file
   */
  contentId: string;

  /**
   * Highlighted snippets of fields that match the search request
   * The list is sorted by relevance of the snippets
   */
  hits: WikiHit[];
}

/**
 * Defines a wiki search response item
 */
export interface WikiSearchResponse {
  /**
   * Total number of matched wiki documents
   */
  count: number;

  /**
   * List of top matched wiki documents
   */
  results: WikiResult[];

  /**
   * Numeric code indicating additional information:
   * 0 - Ok
   * 1 - Account is being reindexed
   * 2 - Account indexing has not started
   * 3 - Invalid Request
   * ... and others as defined in the API
   */
  infoCode?: number;

  /**
   * A dictionary storing an array of Filter objects against each facet
   */
  facets?: {
    /**
     * Project facets for filtering
     */
    Project?: CodeSearchFacet[];
  };
}

/**
 * Options for searching work items in Azure DevOps projects
 */
export interface SearchWorkItemsOptions {
  /**
   * The text to search for within work items
   */
  searchText: string;

  /**
   * The ID or name of the project to search in
   * If not provided, search will be performed across the entire organization
   */
  projectId?: string;

  /**
   * Optional filters to narrow search results
   */
  filters?: {
    /**
     * Filter by project names. Useful for cross-project searches.
     */
    'System.TeamProject'?: string[];

    /**
     * Filter by work item types (Bug, Task, User Story, etc.)
     */
    'System.WorkItemType'?: string[];

    /**
     * Filter by work item states (New, Active, Closed, etc.)
     */
    'System.State'?: string[];

    /**
     * Filter by assigned users
     */
    'System.AssignedTo'?: string[];

    /**
     * Filter by area paths
     */
    'System.AreaPath'?: string[];
  };

  /**
   * Number of results to return
   * @default 100
   * @minimum 1
   * @maximum 1000
   */
  top?: number;

  /**
   * Number of results to skip for pagination
   * @default 0
   * @minimum 0
   */
  skip?: number;

  /**
   * Whether to include faceting in results
   * @default true
   */
  includeFacets?: boolean;

  /**
   * Options for sorting search results
   * If null, results are sorted by relevance
   */
  orderBy?: SortOption[];
}

/**
 * Request body for the Azure DevOps Work Item Search API
 */
export interface WorkItemSearchRequest {
  /**
   * The search text to find in work items
   */
  searchText: string;

  /**
   * Number of results to skip for pagination
   */
  $skip?: number;

  /**
   * Number of results to return
   */
  $top?: number;

  /**
   * Filters to be applied. Set to null if no filters are needed.
   */
  filters?: {
    'System.TeamProject'?: string[];
    'System.WorkItemType'?: string[];
    'System.State'?: string[];
    'System.AssignedTo'?: string[];
    'System.AreaPath'?: string[];
  };

  /**
   * Options for sorting search results
   * If null, results are sorted by relevance
   */
  $orderBy?: SortOption[];

  /**
   * Whether to include faceting in the result
   * @default false
   */
  includeFacets?: boolean;
}

/**
 * Defines the matched terms in the field of the work item result
 */
export interface WorkItemHit {
  /**
   * Reference name of the highlighted field
   */
  fieldReferenceName: string;

  /**
   * Matched/highlighted snippets of the field
   */
  highlights: string[];
}

/**
 * Defines the work item result that matched a work item search request
 */
export interface WorkItemResult {
  /**
   * Project details of the work item
   */
  project: {
    /**
     * ID of the project
     */
    id: string;

    /**
     * Name of the project
     */
    name: string;
  };

  /**
   * A standard set of work item fields and their values
   */
  fields: {
    /**
     * ID of the work item
     */
    'system.id': string;

    /**
     * Type of the work item (Bug, Task, User Story, etc.)
     */
    'system.workitemtype': string;

    /**
     * Title of the work item
     */
    'system.title': string;

    /**
     * User assigned to the work item
     */
    'system.assignedto'?: string;

    /**
     * Current state of the work item
     */
    'system.state'?: string;

    /**
     * Tags associated with the work item
     */
    'system.tags'?: string;

    /**
     * Revision number of the work item
     */
    'system.rev'?: string;

    /**
     * Creation date of the work item
     */
    'system.createddate'?: string;

    /**
     * Last modified date of the work item
     */
    'system.changeddate'?: string;

    /**
     * Other fields may be included based on the work item type
     */
    [key: string]: string | number | boolean | null | undefined;
  };

  /**
   * Highlighted snippets of fields that match the search request
   * The list is sorted by relevance of the snippets
   */
  hits: WorkItemHit[];

  /**
   * URL to the work item
   */
  url: string;
}

/**
 * Defines a work item search response item
 */
export interface WorkItemSearchResponse {
  /**
   * Total number of matched work items
   */
  count: number;

  /**
   * List of top matched work items
   */
  results: WorkItemResult[];

  /**
   * Numeric code indicating additional information:
   * 0 - Ok
   * 1 - Account is being reindexed
   * 2 - Account indexing has not started
   * 3 - Invalid Request
   * ... and others as defined in the API
   */
  infoCode?: number;

  /**
   * A dictionary storing an array of Filter objects against each facet
   */
  facets?: {
    'System.TeamProject'?: CodeSearchFacet[];
    'System.WorkItemType'?: CodeSearchFacet[];
    'System.State'?: CodeSearchFacet[];
    'System.AssignedTo'?: CodeSearchFacet[];
    'System.AreaPath'?: CodeSearchFacet[];
  };
}
