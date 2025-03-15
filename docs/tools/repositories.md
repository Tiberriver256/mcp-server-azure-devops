# Azure DevOps Repositories Tools

This document describes the tools available for working with Azure DevOps Git repositories.

## list_repositories

Lists all Git repositories in a specific project.

### Description

The `list_repositories` tool retrieves all Git repositories within a specified Azure DevOps project. This is useful for discovering which repositories are available for cloning, accessing files, or creating branches and pull requests.

This tool uses the Azure DevOps WebApi client to interact with the Git API.

### Parameters

```json
{
  "projectId": "MyProject",  // Required: The ID or name of the project
  "includeLinks": true       // Optional: Whether to include reference links
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectId` | string | Yes | The ID or name of the project containing the repositories |
| `includeLinks` | boolean | No | Whether to include reference links in the repository objects |

### Response

The tool returns an array of `GitRepository` objects, each containing:

- `id`: The unique identifier of the repository
- `name`: The name of the repository
- `url`: The URL of the repository
- `project`: Object containing basic project information
- `defaultBranch`: The default branch of the repository (e.g., "refs/heads/main")
- `size`: The size of the repository
- `remoteUrl`: The remote URL for cloning the repository
- `sshUrl`: The SSH URL for cloning the repository
- `webUrl`: The web URL for browsing the repository in browser
- ... and potentially other repository properties

Example response:

```json
[
  {
    "id": "repo-guid-1",
    "name": "FirstRepository",
    "url": "https://dev.azure.com/organization/MyProject/_apis/git/repositories/FirstRepository",
    "project": {
      "id": "project-guid",
      "name": "MyProject",
      "url": "https://dev.azure.com/organization/_apis/projects/project-guid"
    },
    "defaultBranch": "refs/heads/main",
    "size": 25478,
    "remoteUrl": "https://dev.azure.com/organization/MyProject/_git/FirstRepository",
    "sshUrl": "git@ssh.dev.azure.com:v3/organization/MyProject/FirstRepository",
    "webUrl": "https://dev.azure.com/organization/MyProject/_git/FirstRepository"
  },
  {
    "id": "repo-guid-2",
    "name": "SecondRepository",
    "url": "https://dev.azure.com/organization/MyProject/_apis/git/repositories/SecondRepository",
    "project": {
      "id": "project-guid",
      "name": "MyProject",
      "url": "https://dev.azure.com/organization/_apis/projects/project-guid"
    },
    "defaultBranch": "refs/heads/main",
    "size": 15789,
    "remoteUrl": "https://dev.azure.com/organization/MyProject/_git/SecondRepository",
    "sshUrl": "git@ssh.dev.azure.com:v3/organization/MyProject/SecondRepository",
    "webUrl": "https://dev.azure.com/organization/MyProject/_git/SecondRepository"
  }
]
```

### Error Handling

The tool may throw the following errors:

- General errors: If the API call fails or other unexpected errors occur
- Authentication errors: If the authentication credentials are invalid or expired
- Permission errors: If the authenticated user doesn't have permission to list repositories
- ResourceNotFound errors: If the specified project doesn't exist

Error messages will be formatted as text and provide details about what went wrong.

### Example Usage

```typescript
// Basic example
const repositories = await mcpClient.callTool("list_repositories", {
  projectId: "MyProject"
});
console.log(repositories);

// Example with includeLinks parameter
const repositoriesWithLinks = await mcpClient.callTool("list_repositories", {
  projectId: "MyProject",
  includeLinks: true
});
console.log(repositoriesWithLinks);
```

### Implementation Details

This tool uses the Azure DevOps Node API's Git API to retrieve repositories:

1. It gets a connection to the Azure DevOps WebApi client
2. It calls the `getGitApi()` method to get a handle to the Git API
3. It then calls `getRepositories()` with the specified project ID and optional include links parameter
4. The results are returned directly to the caller

### Related Tools

- `get_repository`: Get details of a specific repository
- `list_projects`: List all projects in the organization (to find project IDs) 