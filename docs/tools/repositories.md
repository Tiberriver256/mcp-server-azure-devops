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

## get_file_content

Retrieves the content of a file or directory from a Git repository.

### Description

The `get_file_content` tool allows you to access the contents of files and directories within a Git repository. This is useful for examining code, documentation, or other files stored in repositories without having to clone the entire repository. It supports fetching file content from the default branch or from specific branches, tags, or commits.

### Parameters

```json
{
  "projectId": "MyProject", // Required: The ID or name of the project
  "repositoryId": "MyRepo", // Required: The ID or name of the repository
  "path": "/src/index.ts", // Required: The path to the file or directory
  "versionType": "branch", // Optional: The type of version (branch, tag, or commit)
  "version": "main" // Optional: The name of the branch/tag, or commit ID
}
```

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `projectId` | string | Yes | The ID or name of the project containing the repository |
| `repositoryId` | string | Yes | The ID or name of the repository |
| `path` | string | Yes | The path to the file or directory (starting with "/") |
| `versionType` | enum | No | The type of version: "branch", "tag", or "commit" (GitVersionType) |
| `version` | string | No | The name of the branch/tag, or the commit ID |

### Response

The tool returns a `FileContentResponse` object containing:

- `content`: The content of the file as a string, or a JSON string of items for directories
- `isDirectory`: Boolean indicating whether the path refers to a directory

Example response for a file:

```json
{
  "content": "import { Component } from '@angular/core';\n\n@Component({\n  selector: 'app-root',\n  templateUrl: './app.component.html',\n  styleUrls: ['./app.component.css']\n})\nexport class AppComponent {\n  title = 'My App';\n}\n",
  "isDirectory": false
}
```

Example response for a directory:

```json
{
  "content": "[{\"objectId\":\"c7be24d3\",\"gitObjectType\":\"blob\",\"commitId\":\"d5b8e757\",\"path\":\"/src/app/app.component.ts\",\"contentMetadata\":{\"fileName\":\"app.component.ts\"}},{\"objectId\":\"a8c2e5f1\",\"gitObjectType\":\"blob\",\"commitId\":\"d5b8e757\",\"path\":\"/src/app/app.module.ts\",\"contentMetadata\":{\"fileName\":\"app.module.ts\"}}]",
  "isDirectory": true
}
```

### Error Handling

The tool may throw the following errors:

- General errors: If the API call fails or other unexpected errors occur
- Authentication errors: If the authentication credentials are invalid or expired
- Permission errors: If the authenticated user doesn't have permission to access the repository
- ResourceNotFound errors: If the specified project, repository, or path doesn't exist

Error messages will be formatted as text and provide details about what went wrong.

### Example Usage

```typescript
// Basic example - get file from default branch
const fileContent = await mcpClient.callTool('get_file_content', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  path: '/src/index.ts'
});
console.log(fileContent.content);

// Get directory content
const directoryContent = await mcpClient.callTool('get_file_content', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  path: '/src'
});
if (directoryContent.isDirectory) {
  const items = JSON.parse(directoryContent.content);
  console.log(`Directory contains ${items.length} items`);
}

// Get file from specific branch
const branchFileContent = await mcpClient.callTool('get_file_content', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  path: '/src/index.ts',
  versionType: 'branch',
  version: 'feature/new-ui'
});
console.log(branchFileContent.content);

// Get file from specific commit
const commitFileContent = await mcpClient.callTool('get_file_content', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  path: '/src/index.ts',
  versionType: 'commit',
  version: 'a1b2c3d4e5f6g7h8i9j0'
});
console.log(commitFileContent.content);
```

### Implementation Details

This tool uses the Azure DevOps Node API's Git API to retrieve file or directory content:

1. It gets a connection to the Azure DevOps WebApi client
2. It calls the `getGitApi()` method to get a handle to the Git API
3. It determines if the path is a file or directory by attempting to fetch items
4. For directories, it returns the list of items as a JSON string
5. For files, it fetches the file content and returns it as a string
6. The results are wrapped in a `FileContentResponse` object with the appropriate `isDirectory` flag

### Resource URI Access

In addition to using this tool, file content can also be accessed via resource URIs with the following patterns:

- Default branch: `ado://{organization}/{project}/{repo}/contents/{path}`
- Specific branch: `ado://{organization}/{project}/{repo}/branches/{branch}/contents/{path}`
- Specific commit: `ado://{organization}/{project}/{repo}/commits/{commit}/contents/{path}`
- Specific tag: `ado://{organization}/{project}/{repo}/tags/{tag}/contents/{path}`
- Pull request: `ado://{organization}/{project}/{repo}/pullrequests/{prId}/contents/{path}`

### Related Tools

- `list_repositories`: List all repositories in a project
- `get_repository`: Get details of a specific repository
- `get_repository_details`: Get detailed information about a repository including statistics and refs
- `search_code`: Search for code across repositories in a project

## get_all_repositories_tree

Displays a hierarchical tree view of files and directories across multiple Azure DevOps repositories within a project, based on their default branches.

### Description

The `get_all_repositories_tree` tool provides a broad overview of file and directory structure across multiple repositories in a project. It uses a tree-like structure similar to the Unix `tree` command, with each repository's tree displayed sequentially.

Key features:
- Views multiple repositories at once
- Filter repositories by name pattern
- Filter files by pattern
- Control depth to balance performance and detail
- Shows directories and files in a hierarchical view
- Provides statistics (count of files and directories)
- Works with the default branch of each repository
- Handles errors gracefully

### Parameters

```json
{
  "organizationId": "MyOrg",
  "projectId": "MyProject",
  "repositoryPattern": "API*",
  "depth": 0, 
  "pattern": "*.yaml"
}
```

- `organizationId` (string, required): The ID or name of the Azure DevOps organization.
- `projectId` (string, required): The ID or name of the project containing the repositories.
- `repositoryPattern` (string, optional): Pattern to filter repositories by name (PowerShell wildcard).
- `depth` (number, optional, default: 0): Maximum depth to traverse in each repository's file hierarchy. Use 0 for unlimited depth (more efficient server-side recursion), or a specific number (1-10) for limited depth.
- `pattern` (string, optional): Pattern to filter files by name (PowerShell wildcard). Note: Directories are always shown regardless of this filter.

### Response

The response is a formatted ASCII tree showing the file and directory structure of each repository:

```
Repo-API-1/
  |-- src/
  |   |-- config.yaml
  |   `-- utils/
  `-- deploy.yaml
1 directory, 2 files

Repo-API-Gateway/
  |-- charts/
  |   `-- values.yaml
  `-- README.md
1 directory, 2 files

Repo-Data-Service/
  (Repository is empty or default branch not found)
0 directories, 0 files
```

### Examples

#### Basic Example - View All Repositories with Maximum Depth

```javascript
const result = await mcpClient.callTool('get_all_repositories_tree', {
  organizationId: 'MyOrg',
  projectId: 'MyProject'
});
console.log(result);
```

#### Filter Repositories by Name Pattern

```javascript
const result = await mcpClient.callTool('get_all_repositories_tree', {
  organizationId: 'MyOrg',
  projectId: 'MyProject',
  repositoryPattern: 'API*'
});
console.log(result);
```

#### Limited Depth and File Pattern Filter

```javascript
const result = await mcpClient.callTool('get_all_repositories_tree', {
  organizationId: 'MyOrg',
  projectId: 'MyProject',
  depth: 1,  // Only one level deep
  pattern: '*.yaml'
});
console.log(result);
```

### Performance Considerations

- For maximum depth (depth=0), the tool uses server-side recursion (VersionControlRecursionType.Full) which is more efficient for retrieving deep directory structures.
- For limited depth (depth=1 to 10), the tool uses client-side recursion which is better for controlled exploration.
- When viewing very large repositories, consider using a limited depth or file pattern to reduce response time.

### Related Tools

- `list_repositories`: Lists all repositories in a project (summary only)
- `get_repository_details`: Gets detailed info about a single repository
- `get_repository_tree`: Explores structure within a single repository (more detailed)
- `get_file_content`: Gets content of a specific file
