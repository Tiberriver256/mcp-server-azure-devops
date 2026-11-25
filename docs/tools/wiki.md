# Azure DevOps Wiki Tools

This document describes the tools available for working with Azure DevOps wikis.

## get_wikis

Lists all wikis in a project or organization.

### Description

The `get_wikis` tool retrieves all wikis available in a specified Azure DevOps project or organization. This is useful for discovering which wikis are available before working with specific wiki pages.

### Parameters

- `organizationId` (optional): The ID or name of the organization. If not provided, the default organization from environment settings will be used.
- `projectId` (optional): The ID or name of the project. If not provided, the default project from environment settings will be used.

```json
{
  "organizationId": "MyOrganization",
  "projectId": "MyProject"
}
```

### Response

The tool returns an array of wiki objects, each containing:

- `id`: The unique identifier of the wiki
- `name`: The name of the wiki
- `url`: The URL of the wiki
- Other wiki properties such as `remoteUrl` and `type`

Example response:

```json
[
  {
    "id": "wiki1-id",
    "name": "MyWiki",
    "type": "projectWiki",
    "url": "https://dev.azure.com/MyOrganization/MyProject/_wiki/wikis/MyWiki",
    "remoteUrl": "https://dev.azure.com/MyOrganization/MyProject/_git/MyWiki"
  }
]
```

## get_wiki_page

Gets the content of a specific wiki page.

### Description

The `get_wiki_page` tool retrieves the content of a specified wiki page as plain text. This is useful for viewing the content of wiki pages programmatically.

### Parameters

- `organizationId` (optional): The ID or name of the organization. If not provided, the default organization from environment settings will be used.
- `projectId` (optional): The ID or name of the project. If not provided, the default project from environment settings will be used.
- `wikiId` (required): The ID or name of the wiki containing the page.
- `pagePath` (required): The path of the page within the wiki (e.g., "/Home" or "/Folder/Page").

```json
{
  "organizationId": "MyOrganization",
  "projectId": "MyProject",
  "wikiId": "MyWiki",
  "pagePath": "/Home"
}
```

### Response

The tool returns the content of the wiki page as a string in markdown format.

Example response:

```markdown
# Welcome to the Wiki

This is the home page of the wiki.

## Getting Started

Here are some links to help you get started:
- [Documentation](/Documentation)
- [Tutorials](/Tutorials)
- [FAQ](/FAQ)
```

### Error Handling

The tool may throw the following errors:

- `AzureDevOpsResourceNotFoundError`: If the specified wiki or page does not exist
- `AzureDevOpsPermissionError`: If the authenticated user does not have permission to access the wiki
- General errors: If other unexpected errors occur during the request

### Example Usage

```typescript
// Example MCP client call
const result = await mcpClient.callTool('get_wiki_page', {
  projectId: 'MyProject',
  wikiId: 'MyWiki',
  pagePath: '/Home'
});
console.log(result);
```

### Implementation Details

This tool uses the Azure DevOps REST API to retrieve the wiki page content with the `Accept: text/plain` header to get the content directly in text format. The page path is properly encoded to handle spaces and special characters in the URL.

## list_wiki_pages

Lists all pages within a specified Azure DevOps wiki.

### Description

The `list_wiki_pages` tool retrieves a list of all pages within a specified wiki. It returns summary information for each page, including the page ID, path, URL, and order. This is useful for discovering the structure and contents of a wiki before working with specific pages.

### Parameters

- `organizationId` (optional): The ID or name of the organization. If not provided, the default organization from environment settings will be used.
- `projectId` (optional): The ID or name of the project. If not provided, the default project from environment settings will be used.
- `wikiId` (required): The ID or name of the wiki to list pages from.

```json
{
  "organizationId": "MyOrganization",
  "projectId": "MyProject",
  "wikiId": "MyWiki"
}
```

### Response

The tool returns an array of wiki page summary objects, each containing:

- `id`: The unique numeric identifier of the page
- `path`: The path of the page within the wiki (e.g., "/Home" or "/Folder/Page")
- `url`: The URL to access the page (optional)
- `order`: The display order of the page (optional)

Example response:

```json
[
  {
    "id": 1,
    "path": "/Home",
    "url": "https://dev.azure.com/MyOrganization/MyProject/_wiki/wikis/MyWiki/1/Home",
    "order": 0
  },
  {
    "id": 2,
    "path": "/Documentation",
    "url": "https://dev.azure.com/MyOrganization/MyProject/_wiki/wikis/MyWiki/2/Documentation",
    "order": 1
  },
  {
    "id": 3,
    "path": "/Documentation/Getting-Started",
    "url": "https://dev.azure.com/MyOrganization/MyProject/_wiki/wikis/MyWiki/3/Getting-Started",
    "order": 2
  }
]
```

### Error Handling

The tool may throw the following errors:

- `AzureDevOpsResourceNotFoundError`: If the specified wiki does not exist
- `AzureDevOpsPermissionError`: If the authenticated user does not have permission to access the wiki
- `AzureDevOpsError`: If other unexpected errors occur during the request

### Example Usage

```typescript
// Example MCP client call
const result = await mcpClient.callTool('list_wiki_pages', {
  projectId: 'MyProject',
  wikiId: 'MyWiki'
});
console.log(result);
```

### Implementation Details

This tool uses the Azure DevOps REST API (`GET /_apis/wiki/wikis/{wikiId}/pages?recursionLevel=full`) with cycle detection and maps pages to `{ id, path, url, order }`.

## create_wiki

Creates a new project wiki or code wiki in an Azure DevOps project.

### Parameters

| Parameter        | Type   | Required | Description                                                                                      |
| ---------------- | ------ | -------- | ------------------------------------------------------------------------------------------------ |
| `name`           | string | Yes      | Name of the new wiki                                                                             |
| `type`           | string | No       | Wiki type: `"projectWiki"` (default) or `"codeWiki"`                                             |
| `projectId`      | string | No       | The ID or name of the project (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`)                       |
| `organizationId` | string | No       | Optional Azure DevOps Services organization override                                             |
| `repositoryId`   | string | No       | Repository ID (required when `type` is `"codeWiki"`)                                             |
| `mappedPath`     | string | No       | Path inside the repository to publish as a code wiki (default: `"/"`)                            |

### Response

Returns the created Azure DevOps `WikiV2` object (`id`, `name`, `type`, `projectId`, `repositoryId`, `mappedPath`, `url`, `remoteUrl`).

### Example Usage

```typescript
const wiki = await mcpClient.callTool('create_wiki', {
  projectId: 'MyProject',
  name: 'Engineering-Wiki',
  type: 'projectWiki',
});
```

## update_wiki_page

Updates the Markdown content of an existing wiki page using ETag-based optimistic concurrency (`If-Match`).

### Parameters

| Parameter        | Type   | Required | Description                                                                                      |
| ---------------- | ------ | -------- | ------------------------------------------------------------------------------------------------ |
| `wikiId`         | string | Yes      | The ID or name of the wiki                                                                       |
| `pagePath`       | string | Yes      | Path of the page within the wiki (e.g., `"/Home"` or `"/Docs/Guide"`)                            |
| `content`        | string | Yes      | New Markdown content for the page                                                                |
| `comment`        | string | No       | Optional commit/change comment                                                                   |
| `projectId`      | string | No       | The ID or name of the project (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`)                       |
| `organizationId` | string | No       | Optional Azure DevOps Services organization override                                             |

### Response

Returns the updated wiki page object (`path`, `content`, `eTag`, `gitItemPath`, `url`).

### Example Usage

```typescript
await mcpClient.callTool('update_wiki_page', {
  projectId: 'MyProject',
  wikiId: 'MyWiki',
  pagePath: '/Home',
  content: '# Updated Home\n\nWelcome!',
  comment: 'Refresh landing page',
});
```

## create_wiki_page

Creates a new wiki page (or updates an existing page) at a specified path.

### Parameters

| Parameter        | Type   | Required | Description                                                                                      |
| ---------------- | ------ | -------- | ------------------------------------------------------------------------------------------------ |
| `wikiId`         | string | Yes      | The ID or name of the wiki                                                                       |
| `content`        | string | Yes      | Markdown content for the page                                                                    |
| `pagePath`       | string | No       | Path for the page within the wiki (default: `"/"`)                                               |
| `comment`        | string | No       | Optional commit/change comment                                                                   |
| `projectId`      | string | No       | The ID or name of the project (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`)                       |
| `organizationId` | string | No       | Optional Azure DevOps Services organization override                                             |

### Response

Returns the created/updated wiki page object (`path`, `content`, `eTag`, `gitItemPath`, `url`).

### Example Usage

```typescript
await mcpClient.callTool('create_wiki_page', {
  projectId: 'MyProject',
  wikiId: 'MyWiki',
  pagePath: '/Runbooks/Deploy',
  content: '# Deployment Runbook\n\n1. Verify CI green.',
  comment: 'Add deployment runbook',
});
```