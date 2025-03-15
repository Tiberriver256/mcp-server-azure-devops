# Azure DevOps Projects Tools

This document describes the tools available for working with Azure DevOps projects.

## list_projects

Lists all projects in the Azure DevOps organization.

### Description

The `list_projects` tool retrieves all projects that the authenticated user has access to within the configured Azure DevOps organization. This is useful for discovering which projects are available before working with repositories, work items, or other project-specific resources.

This tool uses the Azure DevOps WebApi client to interact with the Core API.

### Parameters

All parameters are optional:

```json
{
  "stateFilter": 1,         // Optional: Filter on team project state
  "top": 100,               // Optional: Maximum number of projects to return
  "skip": 0,                // Optional: Number of projects to skip
  "continuationToken": 123  // Optional: Gets projects after the continuation token provided
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stateFilter` | number | No | Filter on team project state (0: all, 1: well-formed, 2: creating, 3: deleting, 4: new) |
| `top` | number | No | Maximum number of projects to return in a single request |
| `skip` | number | No | Number of projects to skip, useful for pagination |
| `continuationToken` | number | No | Gets the projects after the continuation token provided |

### Response

The tool returns an array of `TeamProject` objects, each containing:

- `id`: The unique identifier of the project
- `name`: The name of the project
- `description`: The project description (if available)
- `url`: The URL of the project
- `state`: The state of the project (e.g., "wellFormed")
- `revision`: The revision of the project
- `visibility`: The visibility of the project (e.g., "private" or "public")
- `lastUpdateTime`: The timestamp when the project was last updated
- ... and potentially other project properties

Example response:

```json
[
  {
    "id": "project-guid-1",
    "name": "Project One",
    "description": "This is the first project",
    "url": "https://dev.azure.com/organization/Project%20One",
    "state": "wellFormed",
    "revision": 123,
    "visibility": "private",
    "lastUpdateTime": "2023-01-01T12:00:00.000Z"
  },
  {
    "id": "project-guid-2",
    "name": "Project Two",
    "description": "This is the second project",
    "url": "https://dev.azure.com/organization/Project%20Two",
    "state": "wellFormed",
    "revision": 456,
    "visibility": "public",
    "lastUpdateTime": "2023-02-15T14:30:00.000Z"
  }
]
```

### Error Handling

The tool may throw the following errors:

- General errors: If the API call fails or other unexpected errors occur
- Authentication errors: If the authentication credentials are invalid or expired
- Permission errors: If the authenticated user doesn't have permission to list projects

Error messages will be formatted as text and provide details about what went wrong.

### Example Usage

```typescript
// Example with no parameters (returns all projects)
const allProjects = await mcpClient.callTool("list_projects", {});
console.log(allProjects);

// Example with pagination parameters
const paginatedProjects = await mcpClient.callTool("list_projects", {
  top: 10,
  skip: 20
});
console.log(paginatedProjects);

// Example with state filter (only well-formed projects)
const wellFormedProjects = await mcpClient.callTool("list_projects", {
  stateFilter: 1
});
console.log(wellFormedProjects);
```

### Implementation Details

This tool uses the Azure DevOps Node API's Core API to retrieve projects:

1. It gets a connection to the Azure DevOps WebApi client
2. It calls the `getCoreApi()` method to get a handle to the Core API
3. It then calls `getProjects()` with any provided parameters to retrieve the list of projects
4. The results are returned directly to the caller 