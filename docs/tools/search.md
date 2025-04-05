# Search Tools

This document describes the search tools available in the Azure DevOps MCP server.

## search_code

The `search_code` tool allows you to search for code across repositories in an Azure DevOps project. It uses the Azure DevOps Search API to find code matching your search criteria and can optionally include the full content of the files in the results.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| searchText | string | Yes | The text to search for in the code |
| projectId | string | No | The ID or name of the project to search in. If not provided, search will be performed across all projects in the organization. |
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

#### Organization-wide Search

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
- The search API uses a different base URL (`almsearch.dev.azure.com`) than the regular Azure DevOps API.
- When `includeContent` is true, the tool makes additional API calls to fetch the full content of each file in the search results.
- The search API supports a variety of search syntax, including wildcards, exact phrases, and boolean operators. See the [Azure DevOps Search documentation](https://learn.microsoft.com/en-us/azure/devops/project/search/get-started-search?view=azure-devops) for more information.
- The `CodeElement` filter allows you to filter by code element types such as `function`, `class`, `method`, `property`, `variable`, `comment`, etc.
- When `projectId` is not provided, the search will be performed across all projects in the organization, which can be useful for finding examples of specific code patterns or libraries used across the organization.