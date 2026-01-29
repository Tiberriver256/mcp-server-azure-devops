# Search Tools

This document describes the search tools available in the Azure DevOps MCP server.

## Azure DevOps Services vs Server base URLs

- **Azure DevOps Services (cloud)** uses the dedicated Search host: `https://almsearch.dev.azure.com/{organization}`.
- **Azure DevOps Server (on-prem)** hosts Search under the same collection URL you use for the core APIs: `https://{server}/{virtualDir?}/{collection}`.

For Azure DevOps Server, set `AZURE_DEVOPS_ORG_URL` to the **collection URL** (not a project URL). Project-level URLs are ambiguous on Server installs with custom virtual directories and are not supported.

Example:

```bash
AZURE_DEVOPS_ORG_URL=https://server:8080/tfs/DefaultCollection
```

## search_code

The `search_code` tool allows you to search for code across repositories in an Azure DevOps project. It uses the Azure DevOps Search API to find code matching your search criteria and can optionally include the full content of the files in the results.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| searchText | string | Yes | The text to search for in the code |
| organizationId | string | No | Optional organization override (defaults to the organization in `AZURE_DEVOPS_ORG_URL`) |
| projectId | string | Yes* | The ID or name of the project to search in. Required unless `AZURE_DEVOPS_DEFAULT_PROJECT` is set. |
| filters | object | No | Optional filters to narrow search results |
| filters.Repository | string[] | No | Filter by repository names |
| filters.Path | string[] | No | Filter by file paths |
| filters.Branch | string[] | No | Filter by branch names |
| filters.CodeElement | string[] | No | Filter by code element types (function, class, etc.) |
| top | number | No | Number of results to return (default: 100, max: 1000) |
| skip | number | No | Number of results to skip for pagination (default: 0) |
| includeSnippet | boolean | No | Whether to include code snippets in results (default: true) |
| includeContent | boolean | No | Whether to include full file content in results (default: true) |

### Response

The response includes:

- `count`: The total number of matching files
- `results`: An array of search results, each containing:
  - `fileName`: The name of the file
  - `path`: The path to the file
  - `content`: The full content of the file (if `includeContent` is true)
  - `matches`: Information about where the search text was found in the file
  - `collection`: Information about the collection
  - `project`: Information about the project
  - `repository`: Information about the repository
  - `versions`: Information about the versions of the file
- `facets`: Aggregated information about the search results, such as counts by repository, path, etc.

### Examples

#### Basic Search

```json
{
  "searchText": "function searchCode",
  "projectId": "MyProject"
}
```

#### Using Default Project

```json
{
  "searchText": "function searchCode"
}
```

#### Search with Filters

```json
{
  "searchText": "function searchCode",
  "projectId": "MyProject",
  "filters": {
    "Repository": ["MyRepo"],
    "Path": ["/src"],
    "Branch": ["main"],
    "CodeElement": ["function", "class"]
  }
}
```

#### Search with Pagination

```json
{
  "searchText": "function",
  "projectId": "MyProject",
  "top": 10,
  "skip": 20
}
```

#### Search without File Content

```json
{
  "searchText": "function",
  "projectId": "MyProject",
  "includeContent": false
}
```

### Notes

- The search is performed using the Azure DevOps Search API, which is separate from the core Azure DevOps API.
- Azure DevOps Services uses a different base URL (`almsearch.dev.azure.com`) than the regular Azure DevOps API.
- Azure DevOps Server uses the **same** base URL as the regular Azure DevOps API (your Server collection URL).
- When `includeContent` is true, the tool makes additional API calls to fetch the full content of each file in the search results.
- The search API supports a variety of search syntax, including wildcards, exact phrases, and boolean operators. See the [Azure DevOps Search documentation](https://learn.microsoft.com/en-us/azure/devops/project/search/get-started-search?view=azure-devops) for more information.
- The `CodeElement` filter allows you to filter by code element types such as `function`, `class`, `method`, `property`, `variable`, `comment`, etc.
- If `projectId` is omitted, the tool uses `AZURE_DEVOPS_DEFAULT_PROJECT` when available.

## search_wiki

The `search_wiki` tool searches wiki pages in Azure DevOps projects.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| searchText | string | Yes | The text to search for in wiki pages |
| organizationId | string | No | Optional organization override (defaults to the organization in `AZURE_DEVOPS_ORG_URL`) |
| projectId | string | No | The project to scope the search to (required for Azure DevOps Server) |
| filters.Project | string[] | No | Filter by project names |
| top | number | No | Number of results to return (default: 100, max: 1000) |
| skip | number | No | Number of results to skip for pagination (default: 0) |
| includeFacets | boolean | No | Whether to include faceting in results (default: true) |

### Notes

- Azure DevOps Services allows organization-wide wiki search when `projectId` is omitted.
- Azure DevOps Server requires `projectId`.

## search_work_items

The `search_work_items` tool searches work items across Azure DevOps projects.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| searchText | string | Yes | The text to search for in work items |
| organizationId | string | No | Optional organization override (defaults to the organization in `AZURE_DEVOPS_ORG_URL`) |
| projectId | string | No | The project to scope the search to (required for Azure DevOps Server) |
| filters.System.TeamProject | string[] | No | Filter by project names |
| filters.System.WorkItemType | string[] | No | Filter by work item types |
| filters.System.State | string[] | No | Filter by work item states |
| filters.System.AssignedTo | string[] | No | Filter by assigned users |
| filters.System.AreaPath | string[] | No | Filter by area paths |
| top | number | No | Number of results to return (default: 100, max: 1000) |
| skip | number | No | Number of results to skip for pagination (default: 0) |
| includeFacets | boolean | No | Whether to include faceting in results (default: true) |
| orderBy | array | No | Sort options (field + ASC/DESC) |

### Notes

- Azure DevOps Services allows organization-wide work item search when `projectId` is omitted.
- Azure DevOps Server requires `projectId`.
