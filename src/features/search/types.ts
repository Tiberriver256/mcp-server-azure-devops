/**
 * Options for searching code in Azure DevOps repositories
 */
export interface SearchCodeOptions {
  searchText: string;
  projectId: string;
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
