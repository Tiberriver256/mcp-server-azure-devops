# Azure DevOps Repositories Tools

This document describes the tools available for working with Azure DevOps Git repositories.

## get_repository_details

Gets detailed information about a specific Git repository, including optional branch statistics and refs.

### Description

The `get_repository_details` tool retrieves comprehensive information about a specific Git repository in Azure DevOps. It can optionally include branch statistics (ahead/behind counts, commit information) and repository refs (branches, tags). This is useful for tasks like branch management, policy configuration, and repository statistics tracking.

### Parameters

```json
{
  "projectId": "MyProject", // Required: The ID or name of the project
  "repositoryId": "MyRepo", // Required: The ID or name of the repository
  "includeStatistics": true, // Optional: Whether to include branch statistics (default: false)
  "includeRefs": true, // Optional: Whether to include repository refs (default: false)
  "refFilter": "heads/", // Optional: Filter for refs (e.g., "heads/" or "tags/")
  "branchName": "main" // Optional: Name of specific branch to get statistics for
}
```

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `projectId` | string | Yes | The ID or name of the project containing the repository |
| `repositoryId` | string | Yes | The ID or name of the repository to get details for |
| `includeStatistics` | boolean | No | Whether to include branch statistics (default: false) |
| `includeRefs` | boolean | No | Whether to include repository refs (default: false) |
| `refFilter` | string | No | Optional filter for refs (e.g., "heads/" or "tags/") |
| `branchName` | string | No | Name of specific branch to get statistics for (if includeStatistics is true) |

### Response

The tool returns a `RepositoryDetails` object containing:

- `repository`: The basic repository information (same as returned by `get_repository`)
- `statistics` (optional): Branch statistics if requested
- `refs` (optional): Repository refs if requested

Example response:

```json
{
  "repository": {
    "id": "repo-guid",
    "name": "MyRepository",
    "url": "https://dev.azure.com/organization/MyProject/_apis/git/repositories/MyRepository",
    "project": {
      "id": "project-guid",
      "name": "MyProject",
      "url": "https://dev.azure.com/organization/_apis/projects/project-guid"
    },
    "defaultBranch": "refs/heads/main",
    "size": 25478,
    "remoteUrl": "https://dev.azure.com/organization/MyProject/_git/MyRepository",
    "sshUrl": "git@ssh.dev.azure.com:v3/organization/MyProject/MyRepository",
    "webUrl": "https://dev.azure.com/organization/MyProject/_git/MyRepository"
  },
  "statistics": {
    "branches": [
      {
        "name": "refs/heads/main",
        "aheadCount": 0,
        "behindCount": 0,
        "isBaseVersion": true,
        "commit": {
          "commitId": "commit-guid",
          "author": {
            "name": "John Doe",
            "email": "john.doe@example.com",
            "date": "2023-01-01T12:00:00Z"
          },
          "committer": {
            "name": "John Doe",
            "email": "john.doe@example.com",
            "date": "2023-01-01T12:00:00Z"
          },
          "comment": "Initial commit"
        }
      }
    ]
  },
  "refs": {
    "value": [
      {
        "name": "refs/heads/main",
        "objectId": "commit-guid",
        "creator": {
          "displayName": "John Doe",
          "id": "user-guid"
        },
        "url": "https://dev.azure.com/organization/MyProject/_apis/git/repositories/repo-guid/refs/heads/main"
      }
    ],
    "count": 1
  }
}
```

### Error Handling

The tool may throw the following errors:

- General errors: If the API call fails or other unexpected errors occur
- Authentication errors: If the authentication credentials are invalid or expired
- Permission errors: If the authenticated user doesn't have permission to access the repository
- ResourceNotFound errors: If the specified project or repository doesn't exist

Error messages will be formatted as text and provide details about what went wrong.

### Example Usage

```typescript
// Basic example - just repository info
const repoDetails = await mcpClient.callTool('get_repository_details', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo'
});
console.log(repoDetails);

// Example with branch statistics
const repoWithStats = await mcpClient.callTool('get_repository_details', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  includeStatistics: true
});
console.log(repoWithStats);

// Example with refs filtered to branches
const repoWithBranches = await mcpClient.callTool('get_repository_details', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  includeRefs: true,
  refFilter: 'heads/'
});
console.log(repoWithBranches);

// Example with all options
const fullRepoDetails = await mcpClient.callTool('get_repository_details', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  includeStatistics: true,
  includeRefs: true,
  refFilter: 'heads/',
  branchName: 'main'
});
console.log(fullRepoDetails);
```

### Implementation Details

This tool uses the Azure DevOps Node API's Git API to retrieve repository details:

1. It gets a connection to the Azure DevOps WebApi client
2. It calls the `getGitApi()` method to get a handle to the Git API
3. It retrieves the basic repository information using `getRepository()`
4. If requested, it retrieves branch statistics using `getBranches()`
5. If requested, it retrieves repository refs using `getRefs()`
6. The combined results are returned to the caller

## list_repositories

Lists all Git repositories in a specific project.

### Description

The `list_repositories` tool retrieves all Git repositories within a specified Azure DevOps project. This is useful for discovering which repositories are available for cloning, accessing files, or creating branches and pull requests.

This tool uses the Azure DevOps WebApi client to interact with the Git API.

### Parameters

```json
{
  "projectId": "MyProject", // Required: The ID or name of the project
  "includeLinks": true // Optional: Whether to include reference links
}
```

| Parameter      | Type    | Required | Description                                                  |
| -------------- | ------- | -------- | ------------------------------------------------------------ |
| `projectId`    | string  | Yes      | The ID or name of the project containing the repositories    |
| `includeLinks` | boolean | No       | Whether to include reference links in the repository objects |

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
const repositories = await mcpClient.callTool('list_repositories', {
  projectId: 'MyProject',
});
console.log(repositories);

// Example with includeLinks parameter
const repositoriesWithLinks = await mcpClient.callTool('list_repositories', {
  projectId: 'MyProject',
  includeLinks: true,
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
- `get_repository_details`: Get detailed information about a repository including statistics and refs
- `list_projects`: List all projects in the organization (to find project IDs)
