# Azure DevOps Pull Requests Tools

This document describes the tools available for working with Azure DevOps Pull Requests.

## create_pull_request

Creates a new pull request in a specific Git repository.

### Description

The `create_pull_request` tool creates a new pull request in a specified Azure DevOps Git repository. It allows you to propose changes from a source branch to a target branch, add a title, description, reviewers, and link to work items. Pull requests are a key part of code review and collaboration workflows in Azure DevOps.

### Parameters

```json
{
  "projectId": "MyProject", // Optional: The ID or name of the project (defaults to AZURE_DEVOPS_DEFAULT_PROJECT)
  "organizationId": "MyOrg", // Optional: The ID or name of the organization (defaults to configured organization)
  "repositoryId": "MyRepo", // Required: The ID or name of the repository
  "title": "Update feature X", // Required: The title of the pull request
  "sourceRefName": "refs/heads/feature-branch", // Required: The source branch name
  "targetRefName": "refs/heads/main", // Required: The target branch name
  "description": "This PR implements feature X", // Optional: The description of the pull request
  "reviewers": ["user@example.com"], // Optional: List of reviewer email addresses or IDs
  "isDraft": true, // Optional: Whether the pull request should be created as a draft
  "workItemRefs": [123, 456], // Optional: List of work item IDs to link to the pull request
  "tags": ["feature", "backend"], // Optional: List of tags to apply to the pull request
  "additionalProperties": {} // Optional: Additional properties to set on the pull request
}
```

| Parameter              | Type                    | Required | Description                                                                          |
| ---------------------- | ----------------------- | -------- | ------------------------------------------------------------------------------------ |
| `projectId`            | string                  | No       | The ID or name of the project (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`)           |
| `organizationId`       | string                  | No       | The ID or name of the organization (defaults to configured organization)             |
| `repositoryId`         | string                  | Yes      | The ID or name of the repository to create the pull request in                       |
| `title`                | string                  | Yes      | The title of the pull request                                                        |
| `sourceRefName`        | string                  | Yes      | The source branch name (e.g., "refs/heads/feature-branch")                           |
| `targetRefName`        | string                  | Yes      | The target branch name (e.g., "refs/heads/main")                                     |
| `description`          | string                  | No       | The description of the pull request (markdown is supported)                          |
| `reviewers`            | string[]                | No       | List of reviewer email addresses or IDs                                              |
| `isDraft`              | boolean                 | No       | Whether the pull request should be created as a draft                                |
| `workItemRefs`         | number[]                | No       | List of work item IDs to link to the pull request                                    |
| `tags`                 | string[]                | No       | List of tags to apply to the pull request                                            |
| `additionalProperties` | Record<string, unknown> | No       | Additional properties to set on the pull request                                     |

### Response

The tool returns a `PullRequest` object containing:

- `pullRequestId`: The unique identifier of the created pull request
- `status`: The status of the pull request (active, abandoned, completed)
- `createdBy`: Information about the user who created the pull request
- `creationDate`: The date and time when the pull request was created
- `title`: The title of the pull request
- `description`: The description of the pull request
- `sourceRefName`: The source branch name
- `targetRefName`: The target branch name
- `mergeStatus`: The merge status of the pull request
- And various other fields and references

Example response:

```json
{
  "repository": {
    "id": "repo-guid",
    "name": "MyRepo",
    "url": "https://dev.azure.com/organization/MyProject/_apis/git/repositories/MyRepo",
    "project": {
      "id": "project-guid",
      "name": "MyProject"
    }
  },
  "pullRequestId": 42,
  "codeReviewId": 42,
  "status": 1,
  "createdBy": {
    "displayName": "John Doe",
    "id": "user-guid",
    "uniqueName": "john.doe@example.com"
  },
  "creationDate": "2023-01-01T12:00:00Z",
  "title": "Update feature X",
  "description": "This PR implements feature X",
  "sourceRefName": "refs/heads/feature-branch",
  "targetRefName": "refs/heads/main",
  "mergeStatus": 1,
  "isDraft": true,
  "reviewers": [
    {
      "displayName": "Jane Smith",
      "id": "reviewer-guid",
      "uniqueName": "jane.smith@example.com",
      "voteResult": 0
    }
  ],
  "url": "https://dev.azure.com/organization/MyProject/_apis/git/repositories/MyRepo/pullRequests/42"
}
```

### Error Handling

The tool may throw the following errors:

- ValidationError: If required parameters are missing or invalid
- AuthenticationError: If authentication fails
- PermissionError: If the user doesn't have permission to create a pull request
- ResourceNotFoundError: If the project, repository, or specified branches don't exist
- GitError: For Git-related errors (e.g., conflicts, branch issues)
- GeneralError: For other unexpected errors

Error messages will include details about what went wrong and suggestions for resolution.

### Example Usage

```typescript
// Basic example - create a PR from feature branch to main
const pr = await mcpClient.callTool('create_pull_request', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  title: 'Add new feature',
  sourceRefName: 'refs/heads/feature-branch',
  targetRefName: 'refs/heads/main',
});
console.log(`Created PR #${pr.pullRequestId}: ${pr.url}`);

// Create a draft PR with description and reviewers
const draftPr = await mcpClient.callTool('create_pull_request', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  title: 'WIP: Refactor authentication code',
  description:
    '# Work in Progress\n\nRefactoring authentication code to use the new identity service.',
  sourceRefName: 'refs/heads/auth-refactor',
  targetRefName: 'refs/heads/develop',
  isDraft: true,
  reviewers: ['jane.smith@example.com', 'security-team@example.com'],
});
console.log(`Created draft PR #${draftPr.pullRequestId}`);

// Create a PR linked to work items
const linkedPr = await mcpClient.callTool('create_pull_request', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  title: 'Fix bugs in payment processor',
  sourceRefName: 'refs/heads/bugfix/payment',
  targetRefName: 'refs/heads/main',
  workItemRefs: [1234, 1235, 1236],
});
console.log(`Created PR #${linkedPr.pullRequestId} linked to work items`);
```

## get_pull_request

Get a single pull request by ID (no repository ID required).

### Description

The `get_pull_request` tool retrieves a pull request by its numeric ID. This is especially useful in Azure DevOps Server where pull request IDs are project-scoped and you may not know the repository upfront.

### Parameters

```json
{
  "projectId": "MyProject", // Required: The ID or name of the project
  "pullRequestId": 42 // Required: The ID of the pull request
}
```

| Parameter       | Type   | Required | Description                                 |
| --------------- | ------ | -------- | ------------------------------------------- |
| `projectId`     | string | Yes      | The ID or name of the project               |
| `pullRequestId` | number | Yes      | The ID of the pull request to retrieve      |

### Response

Returns a `PullRequest` object.

### Example Usage

```typescript
const pr = await mcpClient.callTool('get_pull_request', {
  projectId: 'MyProject',
  pullRequestId: 42,
});

console.log(`PR #${pr.pullRequestId}: ${pr.title}`);
```

## list_pull_requests

Lists pull requests in a specific Git repository with optional filtering.

### Description

The `list_pull_requests` tool retrieves pull requests from a specified Azure DevOps Git repository. It supports filtering by status (active, completed, abandoned), creator, reviewer, and source/target branches. This tool is useful for monitoring code review progress, identifying pending PRs, and automating PR-related workflows.

### Parameters

```json
{
  "projectId": "MyProject", // Required: The ID or name of the project
  "repositoryId": "MyRepo", // Required: The ID or name of the repository
  "status": "active", // Optional: The status of pull requests to return (active, completed, abandoned, all)
  "creatorId": "a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8", // Optional: Filter by creator ID (must be a UUID)
  "reviewerId": "b9b9b9b9-b9b9-b9b9-b9b9-b9b9b9b9b9b9", // Optional: Filter by reviewer ID (must be a UUID)
  "sourceRefName": "refs/heads/feature-branch", // Optional: Filter by source branch name
  "targetRefName": "refs/heads/main", // Optional: Filter by target branch name
  "top": 10, // Optional: Maximum number of pull requests to return (default: 10)
  "skip": 0 // Optional: Number of pull requests to skip for pagination
}
```

| Parameter        | Type   | Required | Description                                                                         |
| ---------------- | ------ | -------- | ----------------------------------------------------------------------------------- |
| `repositoryId`   | string | Yes      | The ID or name of the repository to list pull requests from                         |
| `projectId`      | string | No       | The ID or name of the project (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`)          |
| `organizationId` | string | No       | Optional Azure DevOps Services organization override                                |
| `status`         | string | No       | The status of pull requests to return: `"active"`, `"completed"`, `"abandoned"`, or `"all"` |
| `creatorId`      | string | No       | Filter pull requests by creator ID (must be a UUID)                                 |
| `reviewerId`     | string | No       | Filter pull requests by reviewer ID (must be a UUID)                                |
| `sourceRefName`  | string | No       | Filter pull requests by source branch name                                          |
| `targetRefName`  | string | No       | Filter pull requests by target branch name                                          |
| `top`            | number | No       | Maximum number of pull requests to return (default: `10`)                           |
| `skip`           | number | No       | Number of pull requests to skip for pagination                                      |

### Response

The tool returns an object containing:

- `count`: The number of pull requests returned
- `value`: An array of `PullRequest` objects
- `hasMoreResults`: A boolean indicating if there are more results available
- `warning`: A message with pagination guidance (only present when hasMoreResults is true)

Each pull request in the `value` array contains:

- `pullRequestId`: The unique identifier of the pull request
- `title`: The title of the pull request
- `status`: The status of the pull request (active, abandoned, completed)
- `createdBy`: Information about the user who created the pull request
- `creationDate`: The date and time when the pull request was created
- `sourceRefName`: The source branch name
- `targetRefName`: The target branch name
- And various other fields and references

Example response:

```json
{
  "count": 2,
  "value": [
    {
      "repository": {
        "id": "repo-guid",
        "name": "MyRepo",
        "project": {
          "id": "project-guid",
          "name": "MyProject"
        }
      },
      "pullRequestId": 42,
      "codeReviewId": 42,
      "status": 1,
      "createdBy": {
        "displayName": "John Doe",
        "uniqueName": "john.doe@example.com"
      },
      "creationDate": "2023-01-01T12:00:00Z",
      "title": "Update feature X",
      "description": "This PR implements feature X",
      "sourceRefName": "refs/heads/feature-branch",
      "targetRefName": "refs/heads/main",
      "mergeStatus": 3,
      "isDraft": false,
      "url": "https://dev.azure.com/organization/MyProject/_apis/git/repositories/MyRepo/pullRequests/42"
    },
    {
      "repository": {
        "id": "repo-guid",
        "name": "MyRepo",
        "project": {
          "id": "project-guid",
          "name": "MyProject"
        }
      },
      "pullRequestId": 43,
      "codeReviewId": 43,
      "status": 1,
      "createdBy": {
        "displayName": "Jane Smith",
        "uniqueName": "jane.smith@example.com"
      },
      "creationDate": "2023-01-02T14:30:00Z",
      "title": "Fix bug in login flow",
      "description": "This PR fixes a critical bug in the login flow",
      "sourceRefName": "refs/heads/bugfix/login",
      "targetRefName": "refs/heads/main",
      "mergeStatus": 3,
      "isDraft": false,
      "url": "https://dev.azure.com/organization/MyProject/_apis/git/repositories/MyRepo/pullRequests/43"
    }
  ],
  "hasMoreResults": false
}
```

### Error Handling

The tool may throw the following errors:

- ValidationError: If required parameters are missing or invalid
- AuthenticationError: If authentication fails
- PermissionError: If the user doesn't have permission to list pull requests
- ResourceNotFoundError: If the project or repository doesn't exist
- GeneralError: For other unexpected errors

Error messages will include details about what went wrong and suggestions for resolution.

### Example Usage

```typescript
// List all active pull requests in a repository
const activePRs = await mcpClient.callTool('list_pull_requests', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  status: 'active',
});
console.log(`Found ${activePRs.count} active pull requests`);

// List pull requests created by a specific user (using their UUID)
const userPRs = await mcpClient.callTool('list_pull_requests', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  creatorId: 'a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8',
});
console.log(`Found ${userPRs.count} pull requests created by this user`);

// List pull requests targeting a specific branch
const mainPRs = await mcpClient.callTool('list_pull_requests', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  targetRefName: 'refs/heads/main',
});
console.log(`Found ${mainPRs.count} pull requests targeting main branch`);

// Paginate through pull requests
const page1 = await mcpClient.callTool('list_pull_requests', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  top: 10,
  skip: 0,
});

// Check if there are more results and get the next page
let page2 = { count: 0, value: [] };
if (page1.hasMoreResults) {
  page2 = await mcpClient.callTool('list_pull_requests', {
    projectId: 'MyProject',
    repositoryId: 'MyRepo',
    top: 10,
    skip: 10,
  });
}

console.log(`Retrieved ${page1.count + page2.count} pull requests in 2 pages`);
```

### Pagination

The `list_pull_requests` tool supports pagination to handle large result sets. By default, results are limited to 10 pull requests per request to prevent performance issues.

#### Pagination Parameters

- `top`: Maximum number of pull requests to return (default: 10)
- `skip`: Number of pull requests to skip for pagination

#### Example: Paginating through all pull requests

```typescript
// Get first page (10 items)
const firstPage = await mcpClient.callTool('list_pull_requests', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
});

// Check if there are more results
if (firstPage.hasMoreResults) {
  // Get second page
  const secondPage = await mcpClient.callTool('list_pull_requests', {
    projectId: 'MyProject',
    repositoryId: 'MyRepo',
    skip: 10,
  });

  // Continue until no more results
  if (secondPage.hasMoreResults) {
    const thirdPage = await mcpClient.callTool('list_pull_requests', {
      projectId: 'MyProject',
      repositoryId: 'MyRepo',
      skip: 20,
    });
  }
}
```

#### Handling Large Repositories

When working with repositories that have many pull requests, it's recommended to use pagination to avoid performance issues. The `list_pull_requests` tool now limits results to 10 by default to prevent issues with very large responses.

If you need to process all pull requests, use the pagination pattern shown above to iterate through the results in manageable chunks.

### Implementation Details

The `list_pull_requests` tool:

1. Establishes a connection to Azure DevOps using the provided credentials
2. Retrieves the Git API client
3. Constructs a search criteria object based on the provided filters
4. Maps status strings to Azure DevOps PullRequestStatus enum values
5. Makes the API call to retrieve the pull requests with pagination parameters
6. Determines if there are more results available
7. Returns an enhanced response object with count, value, hasMoreResults, and warning
8. Handles errors and provides meaningful error messages

This implementation provides a robust and flexible way to retrieve pull requests from Azure DevOps repositories while preventing infinite loop issues.

## get_pull_request_comments

Gets comments and comment threads from a specific pull request.

### Description

The `get_pull_request_comments` tool retrieves comment threads and their associated comments from a specific pull request in an Azure DevOps Git repository. It allows you to get all comments or filter for a specific thread, and supports options for including deleted comments and limiting the number of results. This tool is useful for reviewing feedback on code changes, monitoring discussions, and integrating pull request comments into external workflows.

### Parameters

```json
{
  "projectId": "MyProject", // Required: The ID or name of the project
  "repositoryId": "MyRepo", // Required: The ID or name of the repository
  "pullRequestId": 42, // Required: The ID of the pull request
  "threadId": 123, // Optional: The ID of a specific thread to retrieve
  "includeDeleted": false, // Optional: Whether to include deleted comments
  "top": 50 // Optional: Maximum number of threads to return
}
```

| Parameter        | Type    | Required | Description                                                                    |
| ---------------- | ------- | -------- | ------------------------------------------------------------------------------ |
| `projectId`      | string  | Yes      | The ID or name of the project containing the repository                        |
| `repositoryId`   | string  | Yes      | The ID or name of the repository containing the pull request                   |
| `pullRequestId`  | number  | Yes      | The ID of the pull request to get comments from                                |
| `threadId`       | number  | No       | The ID of a specific thread to retrieve (if omitted, all threads are returned) |
| `includeDeleted` | boolean | No       | Whether to include deleted comments in the results                             |
| `top`            | number  | No       | Maximum number of comment threads to return                                    |

### Response

The tool returns an array of `GitPullRequestCommentThread` objects, each containing:

- `id`: The unique identifier of the thread
- `status`: The status of the thread (active, fixed, closed, etc.)
- `threadContext`: Information about the location of the thread in the code (file path, line numbers)
- `comments`: An array of comments within the thread
- And various other fields and references

Each comment in the thread contains:

- `id`: The unique identifier of the comment
- `content`: The text content of the comment
- `commentType`: The type of comment (code change, general, etc.)
- `author`: Information about the user who created the comment
- `publishedDate`: The date and time when the comment was published
- `filePath`: The path of the file the comment is associated with (if any)
- `leftFileStart`: The start position in the left file (object with `line` and `offset`), or null
- `leftFileEnd`: The end position in the left file (object with `line` and `offset`), or null
- `rightFileStart`: The start position in the right file (object with `line` and `offset`), or null
- `rightFileEnd`: The end position in the right file (object with `line` and `offset`), or null
- And various other fields and references

Example response:

```json
[
  {
    "id": 123,
    "status": 1,
    "threadContext": {
      "filePath": "/src/app.ts",
      "rightFileStart": {
        "line": 10,
        "offset": 5
      },
      "rightFileEnd": {
        "line": 10,
        "offset": 15
      }
    },
    "comments": [
      {
        "id": 456,
        "content": "This variable name is not descriptive enough.",
        "commentType": 1,
        "author": {
          "displayName": "Jane Smith",
          "id": "user-guid",
          "uniqueName": "jane.smith@example.com"
        },
        "publishedDate": "2023-04-15T14:30:00Z",
        "filePath": "/src/app.ts",
        "rightFileStart": { "line": 10, "offset": 5 },
        "rightFileEnd": { "line": 10, "offset": 15 }
      },
      {
        "id": 457,
        "parentCommentId": 456,
        "content": "Good point, I'll rename it to be more descriptive.",
        "commentType": 1,
        "author": {
          "displayName": "John Doe",
          "id": "user-guid-2",
          "uniqueName": "john.doe@example.com"
        },
        "publishedDate": "2023-04-15T14:35:00Z",
        "filePath": "/src/app.ts",
        "rightFileStart": { "line": 10, "offset": 5 },
        "rightFileEnd": { "line": 10, "offset": 15 }
      }
    ],
    "isDeleted": false
  },
  {
    "id": 124,
    "status": 2,
    "comments": [
      {
        "id": 458,
        "content": "Can you add more validation here?",
        "commentType": 1,
        "author": {
          "displayName": "Jane Smith",
          "id": "user-guid",
          "uniqueName": "jane.smith@example.com"
        },
        "publishedDate": "2023-04-15T14:40:00Z",
        "filePath": null
      }
    ],
    "isDeleted": false
  }
]
```

### Error Handling

The tool may throw the following errors:

- ValidationError: If required parameters are missing or invalid
- AuthenticationError: If authentication fails
- PermissionError: If the user doesn't have permission to access the pull request comments
- ResourceNotFoundError: If the project, repository, pull request, or thread doesn't exist
- GeneralError: For other unexpected errors

### Example Usage

```typescript
// Get all comments from a pull request
const comments = await mcpClient.callTool('get_pull_request_comments', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  pullRequestId: 42,
});

// Get a specific thread by ID
const thread = await mcpClient.callTool('get_pull_request_comments', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  pullRequestId: 42,
  threadId: 123,
});
```

## add_pull_request_comment

Adds a comment to a pull request, either as a reply to an existing comment thread or as a new thread.

### Description

The `add_pull_request_comment` tool allows you to:

1. Add a reply to an existing comment thread (`threadId` supplied)
2. Create a new thread in the general discussion (`status` required)
3. Create a new thread anchored to a specific file and optional line range (`filePath`, `status`, and optional `lineNumber`/`endLineNumber`)

### Parameters

| Parameter         | Type    | Required | Description                                                                                                              |
| ----------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pullRequestId`   | number  | Yes      | The ID of the pull request to comment on                                                                                 |
| `content`         | string  | Yes      | The text content of the comment                                                                                          |
| `projectId`       | string  | No       | The ID or name of the project (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`)                                               |
| `organizationId`  | string  | No       | Optional Azure DevOps Services organization override                                                                     |
| `repositoryId`    | string  | No       | The ID or name of the repository (derived from `pullRequestId` when omitted)                                             |
| `threadId`        | number  | No       | Existing thread ID to reply to                                                                                           |
| `parentCommentId` | number  | No       | Parent comment ID when replying to a specific comment in a thread                                                        |
| `filePath`        | string  | No       | File path for a new file-scoped review thread (e.g., `"/src/app.ts"`)                                                    |
| `lineNumber`      | integer | No       | Starting 1-based line number (requires `filePath`)                                                                       |
| `endLineNumber`   | integer | No       | Ending 1-based line number (`>= lineNumber`, requires `filePath` and `lineNumber`)                                       |
| `status`          | string  | No*      | **Required when creating a new thread** (`threadId` omitted): `"active"`, `"fixed"`, `"wontFix"`, `"closed"`, `"pending"`, `"byDesign"`, or `"unknown"` |

### Response

When replying to an existing thread, returns `{ comment }`. When creating a new thread, returns `{ comment, thread }`.

### Example Usage

```typescript
// Reply to an existing thread in a pull request
const reply = await mcpClient.callTool('add_pull_request_comment', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  pullRequestId: 42,
  threadId: 123,
  content: 'I agree with the suggestion, let me implement this change.',
});

// Create a new general discussion thread (status is required for new threads)
const newThread = await mcpClient.callTool('add_pull_request_comment', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  pullRequestId: 42,
  content: "Overall this looks good, but let's discuss the error handling approach.",
  status: 'active',
});

// Create a file/line review comment
const fileComment = await mcpClient.callTool('add_pull_request_comment', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  pullRequestId: 42,
  content: 'This variable name should be more descriptive.',
  filePath: '/src/app.ts',
  lineNumber: 42,
  endLineNumber: 44,
  status: 'active',
});
```

## update_pull_request

Updates an existing pull request with new properties, links work items, manages reviewers, and adds/removes tags.

### Parameters

| Parameter              | Type     | Required | Description                                                                   |
| ---------------------- | -------- | -------- | ----------------------------------------------------------------------------- |
| `repositoryId`         | string   | Yes      | The ID or name of the repository containing the pull request                  |
| `pullRequestId`        | number   | Yes      | The ID of the pull request to update                                          |
| `projectId`            | string   | No       | The ID or name of the project (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`)    |
| `organizationId`       | string   | No       | Optional Azure DevOps Services organization override                          |
| `title`                | string   | No       | The updated title of the pull request                                         |
| `description`          | string   | No       | The updated description of the pull request                                   |
| `status`               | string   | No       | The updated status: `"active"`, `"abandoned"`, or `"completed"`               |
| `isDraft`              | boolean  | No       | Whether to mark (`true`) or unmark (`false`) the PR as a draft                |
| `addWorkItemIds`       | number[] | No       | Array of work item IDs to link to the pull request                            |
| `removeWorkItemIds`    | number[] | No       | Array of work item IDs to unlink from the pull request                        |
| `addReviewers`         | string[] | No       | Array of reviewer email addresses or IDs to add                               |
| `removeReviewers`      | string[] | No       | Array of reviewer email addresses or IDs to remove                            |
| `addTags`              | string[] | No       | Array of tags/labels to add (case-insensitively deduplicated)                 |
| `removeTags`           | string[] | No       | Array of tags/labels to remove (missing tags are ignored)                     |
| `additionalProperties` | object   | No       | Additional properties to update on the pull request                           |

### Response

Returns the updated `GitPullRequest` object (including updated `labels` when tags were modified).

### Example Usage

```typescript
const updatedPR = await mcpClient.callTool('update_pull_request', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  pullRequestId: 42,
  title: 'Updated PR Title',
  isDraft: false,
  addTags: ['ready-for-review'],
  removeTags: ['wip'],
});
```

## update_pull_request_thread_status

Updates the resolution status of an existing pull request comment thread.

### Parameters

| Parameter        | Type   | Required | Description                                                                                                          |
| ---------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `pullRequestId`  | number | Yes      | The ID of the pull request                                                                                           |
| `threadId`       | number | Yes      | The ID of the comment thread to update                                                                               |
| `status`         | string | Yes      | Target thread status: `"active"`, `"fixed"`, `"wontFix"`, `"closed"`, `"pending"`, `"byDesign"`, or `"unknown"`      |
| `projectId`      | string | No       | The ID or name of the project (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`)                                           |
| `organizationId` | string | No       | Optional Azure DevOps Services organization override                                                                 |
| `repositoryId`   | string | No       | The ID or name of the repository (derived from `pullRequestId` when omitted)                                         |

### Response

Returns the updated `GitPullRequestCommentThread` object.

### Example Usage

```typescript
await mcpClient.callTool('update_pull_request_thread_status', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  pullRequestId: 42,
  threadId: 123,
  status: 'fixed',
});
```

## get_pull_request_changes

Retrieves the list of files changed in a pull request, including unified diff patches for each file and the latest policy evaluation status.

### Parameters

| Parameter        | Type   | Required | Description                                                                |
| ---------------- | ------ | -------- | -------------------------------------------------------------------------- |
| `repositoryId`   | string | Yes      | The ID or name of the repository                                           |
| `pullRequestId`  | number | Yes      | The ID of the pull request                                                 |
| `projectId`      | string | No       | The ID or name of the project (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`) |
| `organizationId` | string | No       | Optional Azure DevOps Services organization override                       |

### Response

Returns an object with:

- `changes`: The raw change entries from Azure DevOps for the latest iteration
- `evaluations`: Policy evaluation records for the pull request
- `files`: Array of changed files with their unified diffs (`{ path, patch }`; binary files and blobs exceeding 2 MiB are skipped gracefully)

## get_pull_request_checks

Summarises the latest status checks (builds, validations, custom checks) and policy evaluations applied to a pull request, including the pipeline/run identifiers you need to investigate failures.

### Parameters

| Parameter        | Type   | Required | Description                                                                |
| ---------------- | ------ | -------- | -------------------------------------------------------------------------- |
| `repositoryId`   | string | Yes      | The ID or name of the repository                                           |
| `pullRequestId`  | number | Yes      | The ID of the pull request                                                 |
| `projectId`      | string | No       | The ID or name of the project (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`) |
| `organizationId` | string | No       | Optional Azure DevOps Services organization override                       |

### Response

Returns an object with two arrays:

- `statuses`: Check runs reported through the PR status API. Each entry includes the check `state`, description, status context (`name`/`genre`), and a `pipeline` object with any discovered `pipelineId`, `definitionId`, `runId`/`buildId`, and `targetUrl`.
- `policyEvaluations`: Policy evaluation records (e.g., build validations, required reviews). Each entry includes policy metadata, whether it is blocking, the evaluation status, a friendly `displayName`, and a `pipeline` object mirroring the identifiers above when the policy is backed by a pipeline.

Example response (trimmed):

```json
{
  "statuses": [
    {
      "id": 17,
      "state": "failed",
      "description": "CI build",
      "context": { "name": "CI", "genre": "continuous-integration" },
      "pipeline": {
        "pipelineId": 55,
        "runId": 123,
        "targetUrl": "https://dev.azure.com/org/project/_apis/pipelines/55/runs/123?view=results"
      }
    }
  ],
  "policyEvaluations": [
    {
      "evaluationId": "eval-1",
      "status": "rejected",
      "displayName": "CI Build",
      "isBlocking": true,
      "pipeline": {
        "definitionId": 987,
        "buildId": 456,
        "targetUrl": "https://dev.azure.com/org/project/_build/results?buildId=456"
      }
    }
  ]
}
```

Use the surfaced `pipelineId` and `runId` values with the pipeline tools (`get_pipeline_run`, `pipeline_timeline`, `get_pipeline_log`, etc.) to drill into the specific validation that is blocking the pull request.

## merge_pull_request

Completes (merges) an active pull request immediately, or enables/cancels auto-complete on both Azure DevOps Services (cloud) and Azure DevOps Server (on-prem).

### Description

The `merge_pull_request` tool completes an active pull request with full control over completion options (`mergeStrategy`, `deleteSourceBranch`, `transitionWorkItems`, `mergeCommitMessage`, `bypassPolicy`, and `bypassReason`) or manages auto-complete (`autoComplete: true` / `false` and `autoCompleteIgnoreConfigIds`).

When `repositoryId` is omitted, the repository is automatically derived from `pullRequestId` via `getPullRequestById`, which is especially convenient on Azure DevOps Server where pull request IDs are project-scoped. The target organization/collection is fixed by `AZURE_DEVOPS_ORG_URL`. For immediate completion, `lastMergeSourceCommit` is automatically fetched from the pull request unless you pass `lastMergeSourceCommitId` explicitly as an optimistic concurrency check.

### Modes

- **Immediate completion (`autoComplete` omitted):** Validates that the pull request is active, not a draft, and free of merge conflicts, then sets `status: Completed` along with `lastMergeSourceCommit` and any explicitly supplied `completionOptions`.
- **Enable auto-complete (`autoComplete: true`):** Resolves the authenticated user ID via `/_apis/connectionData` (`connection.connect()` — compatible with both Cloud and Azure DevOps Server) and sets `autoCompleteSetBy` along with any supplied `completionOptions`.
- **Cancel auto-complete (`autoComplete: false`):** Clears auto-complete by sending `autoCompleteSetBy: { id: "00000000-0000-0000-0000-000000000000" }`.

### Parameters

```json
{
  "projectId": "MyProject", // Optional: The ID or name of the project (uses default project or derives from PR if omitted)
  "repositoryId": "MyRepo", // Optional: Derived from pullRequestId when omitted
  "pullRequestId": 42, // Required: Positive integer ID of the pull request
  "mergeStrategy": "squash", // Optional: "noFastForward", "squash", "rebase", or "rebaseMerge" (respects repo policy when omitted)
  "deleteSourceBranch": true, // Optional: Delete the source branch after completion
  "transitionWorkItems": true, // Optional: Transition linked work items upon completion
  "mergeCommitMessage": "feat: add new capability (#42)", // Optional: Custom merge/squash commit message
  "bypassPolicy": false, // Optional: Bypass branch policies (requires Bypass Policies permission)
  "bypassReason": "Emergency hotfix", // Optional: Reason when bypassPolicy is true
  "autoComplete": true, // Optional: true = enable auto-complete, false = cancel auto-complete, omitted = merge immediately
  "autoCompleteIgnoreConfigIds": [10, 12], // Optional: Optional policy config IDs to ignore (requires autoComplete: true)
  "lastMergeSourceCommitId": "0123456789abcdef..." // Optional: Expected source HEAD commit SHA for optimistic concurrency
}
```

| Parameter                     | Type       | Required | Description                                                                                                       |
| ----------------------------- | ---------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `projectId`                   | string     | No       | The ID or name of the project (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`, or derived from the PR when unset)     |
| `repositoryId`                | string     | No       | The ID or name of the repository (derived from `pullRequestId` when omitted)                                      |
| `pullRequestId`               | number     | Yes      | Positive integer ID of the pull request to merge or update auto-complete on                                       |
| `mergeStrategy`               | string     | No       | Merge strategy: `"noFastForward"`, `"squash"`, `"rebase"`, or `"rebaseMerge"` (no forced default)                 |
| `deleteSourceBranch`          | boolean    | No       | Delete the source branch after the pull request completes                                                         |
| `transitionWorkItems`         | boolean    | No       | Transition linked work items to the next logical state upon completion                                            |
| `mergeCommitMessage`          | string     | No       | Custom commit message for the merge or squash commit                                                              |
| `bypassPolicy`                | boolean    | No       | Explicitly bypass branch policies when completing (requires Bypass Policies permission; invalid with `autoComplete: false`) |
| `bypassReason`                | string     | No       | Non-empty reason recorded when `bypassPolicy` is `true` (requires `bypassPolicy: true`)                           |
| `autoComplete`                | boolean    | No       | `true` to enable auto-complete, `false` to cancel auto-complete, or omitted to complete immediately               |
| `autoCompleteIgnoreConfigIds` | number[]   | No       | Optional policy configuration IDs for auto-complete to ignore (requires `autoComplete: true`)                     |
| `lastMergeSourceCommitId`     | string     | No       | Expected source head commit SHA for optimistic concurrency during immediate completion                            |

### Response

Returns the updated `PullRequest` (`GitPullRequest`) object from Azure DevOps, including `status`, `mergeStatus`, `lastMergeCommit`, `autoCompleteSetBy`, and `completionOptions`.

### Error Handling

- `AzureDevOpsValidationError`: Pull request is not active, is still a draft (during immediate completion), has merge conflicts, has no `lastMergeSourceCommit`, has a stale `lastMergeSourceCommitId`, has invalid option combinations, or is rejected by branch policies (`400`/`409`).
- `AzureDevOpsResourceNotFoundError`: Pull request or repository does not exist (`404`).
- `AzureDevOpsAuthenticationError`: Authentication failed (`401`) or authenticated user ID could not be resolved for auto-complete.
- `AzureDevOpsPermissionError`: Caller lacks Contribute or Bypass Policies permission (`403`).
- `AzureDevOpsError`: Unexpected API or transport failures.

### Example Usage

```typescript
// Immediately squash-merge a pull request and delete its source branch
const merged = await mcpClient.callTool('merge_pull_request', {
  projectId: 'MyProject',
  pullRequestId: 42,
  mergeStrategy: 'squash',
  deleteSourceBranch: true,
  transitionWorkItems: true,
  mergeCommitMessage: 'feat: implement feature X (#42)',
});
console.log(`Merged PR #${merged.pullRequestId}, status=${merged.status}`);

// Enable auto-complete (works on both Azure DevOps Services and Azure DevOps Server)
const armed = await mcpClient.callTool('merge_pull_request', {
  projectId: 'MyProject',
  pullRequestId: 42,
  autoComplete: true,
  mergeStrategy: 'rebaseMerge',
  deleteSourceBranch: true,
});
console.log(`Auto-complete set by: ${armed.autoCompleteSetBy?.id}`);

// Cancel auto-complete
const canceled = await mcpClient.callTool('merge_pull_request', {
  projectId: 'MyProject',
  pullRequestId: 42,
  autoComplete: false,
});
console.log(`Auto-complete cleared: ${!canceled.autoCompleteSetBy?.id}`);
```
