# Azure DevOps Pull Requests Tools

This document describes the tools available for working with Azure DevOps Pull Requests.

## create_pull_request

Creates a new pull request in a specific Git repository.

### Description

The `create_pull_request` tool creates a new pull request in a specified Azure DevOps Git repository. It allows you to propose changes from a source branch to a target branch, add a title, description, reviewers, and link to work items. Pull requests are a key part of code review and collaboration workflows in Azure DevOps.

### Parameters

```json
{
  "projectId": "MyProject", // Required: The ID or name of the project
  "repositoryId": "MyRepo", // Required: The ID or name of the repository
  "title": "Update feature X", // Required: The title of the pull request
  "sourceRefName": "refs/heads/feature-branch", // Required: The source branch name
  "targetRefName": "refs/heads/main", // Required: The target branch name
  "description": "This PR implements feature X", // Optional: The description of the pull request
  "reviewers": ["user@example.com"], // Optional: List of reviewer email addresses or IDs
  "isDraft": true, // Optional: Whether the pull request should be created as a draft
  "workItemRefs": [123, 456] // Optional: List of work item IDs to link to the pull request
}
```

| Parameter       | Type     | Required | Description                                                    |
| --------------- | -------- | -------- | -------------------------------------------------------------- |
| `projectId`     | string   | Yes      | The ID or name of the project containing the repository        |
| `repositoryId`  | string   | Yes      | The ID or name of the repository to create the pull request in |
| `title`         | string   | Yes      | The title of the pull request                                  |
| `sourceRefName` | string   | Yes      | The source branch name (e.g., "refs/heads/feature-branch")     |
| `targetRefName` | string   | Yes      | The target branch name (e.g., "refs/heads/main")               |
| `description`   | string   | No       | The description of the pull request                            |
| `reviewers`     | string[] | No       | List of reviewer email addresses or IDs                        |
| `isDraft`       | boolean  | No       | Whether the pull request should be created as a draft          |
| `workItemRefs`  | number[] | No       | List of work item IDs to link to the pull request              |

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

| Parameter       | Type   | Required | Description                                                                         |
| --------------- | ------ | -------- | ----------------------------------------------------------------------------------- |
| `projectId`     | string | Yes      | The ID or name of the project containing the repository                             |
| `repositoryId`  | string | Yes      | The ID or name of the repository to list pull requests from                         |
| `status`        | string | No       | The status of pull requests to return: "active", "completed", "abandoned", or "all" |
| `creatorId`     | string | No       | Filter pull requests by creator ID (must be a UUID)                                 |
| `reviewerId`    | string | No       | Filter pull requests by reviewer ID (must be a UUID)                                |
| `sourceRefName` | string | No       | Filter pull requests by source branch name                                          |
| `targetRefName` | string | No       | Filter pull requests by target branch name                                          |
| `top`           | number | No       | Maximum number of pull requests to return                                           |

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
        "rightFileEnd": { "line": 10, "offset": 15 },
        "leftFileStart": null,
        "leftFileEnd": null
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
        "rightFileEnd": { "line": 10, "offset": 15 },
        "leftFileStart": null,
        "leftFileEnd": null
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
        "filePath": null,
        "rightFileStart": null,
        "rightFileEnd": null,
        "leftFileStart": null,
        "leftFileEnd": null
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

Error messages will include details about what went wrong and suggestions for resolution.

### Example Usage

```typescript
// Get all comments from a pull request
const comments = await mcpClient.callTool('get_pull_request_comments', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  pullRequestId: 42,
});

// Get comments with file path and line number information
comments.forEach(thread => {
  thread.comments?.forEach(comment => {
    if (comment.filePath && comment.rightFileStart && comment.rightFileEnd) {
      console.log(`Comment on ${comment.filePath}:${comment.rightFileStart.line}-${comment.rightFileEnd.line}: ${comment.content}`);
    } else {
      console.log(`General comment: ${comment.content}`);
    }
  });
});

// Get a specific thread by ID
const thread = await mcpClient.callTool('get_pull_request_comments', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  pullRequestId: 42,
  threadId: 123,
});

// Get comments with pagination
const firstPage = await mcpClient.callTool('get_pull_request_comments', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  pullRequestId: 42,
  top: 10,
});
```

### Implementation Details

The `get_pull_request_comments` tool:

1. Establishes a connection to Azure DevOps using the provided credentials
2. Retrieves the Git API client
3. Gets the comment threads from the pull request
4. For each thread:
   - Extracts file path and line number information from the thread context
   - Adds these fields to each comment in the thread
   - Uses rightFileStart.line for line number if available, falls back to leftFileStart.line
5. Returns the transformed threads with enhanced comment information
6. Handles errors and provides meaningful error messages

This implementation provides a robust way to retrieve and analyze pull request comments from Azure DevOps repositories, with enhanced file and line number information for better code review integration.

## add_pull_request_comment

Adds a comment to a pull request, either as a reply to an existing comment or as a new thread.

### Description

The `add_pull_request_comment` tool allows you to create new comments in pull requests in Azure DevOps. You can either:

1. Add a reply to an existing comment thread
2. Create a new thread with a comment in the general discussion
3. Create a new thread with a comment on a specific file at a specific line

This tool is useful for providing feedback on pull requests, engaging in code review discussions, and automating comment workflows.

### Parameters

```json
{
  "projectId": "MyProject", // Required: The ID or name of the project
  "repositoryId": "MyRepo", // Required: The ID or name of the repository
  "pullRequestId": 42, // Required: The ID of the pull request
  "content": "This looks good, let's merge!", // Required: The content of the comment
  "threadId": 123, // Optional: The ID of the thread to add the comment to (for replying)
  "parentCommentId": 456, // Optional: The ID of the parent comment (for threaded replies)
  "filePath": "/src/app.ts", // Optional: The path of the file to comment on (for file comments)
  "lineNumber": 42, // Optional: The line number to comment on (for file comments)
  "status": "active" // Optional: The status to set for a new thread (active, fixed, wontFix, closed, pending)
}
```

| Parameter         | Type   | Required | Description                                                                                      |
| ----------------- | ------ | -------- | ------------------------------------------------------------------------------------------------ |
| `projectId`       | string | Yes      | The ID or name of the project containing the repository                                          |
| `repositoryId`    | string | Yes      | The ID or name of the repository containing the pull request                                     |
| `pullRequestId`   | number | Yes      | The ID of the pull request to comment on                                                         |
| `content`         | string | Yes      | The text content of the comment                                                                  |
| `threadId`        | number | No       | The ID of an existing thread to add the comment to. Required when replying to an existing thread |
| `parentCommentId` | number | No       | ID of the parent comment when replying to a specific comment in a thread                         |
| `filePath`        | string | No       | The path of the file to comment on (for creating a new thread on a file)                         |
| `lineNumber`      | number | No       | The line number to comment on (for creating a new thread on a file)                              |
| `status`          | string | No       | The status to set for a new thread: "active", "fixed", "wontFix", "closed", or "pending"         |

### Response

When adding a comment to an existing thread, the tool returns an object containing:

- `comment`: The created comment object with details like ID, content, and author

When creating a new thread with a comment, the tool returns an object containing:

- `comment`: The created comment object
- `thread`: The created thread object with details like ID, status, and context

Example response for replying to an existing thread:

```json
{
  "comment": {
    "id": 101,
    "content": "I agree with the suggestion",
    "commentType": 1,
    "parentCommentId": 100,
    "author": {
      "displayName": "John Doe",
      "id": "user-guid",
      "uniqueName": "john.doe@example.com"
    },
    "publishedDate": "2023-05-15T10:23:45Z"
  }
}
```

Example response for creating a new thread on a file:

```json
{
  "comment": {
    "id": 200,
    "content": "This variable name should be more descriptive",
    "commentType": 1,
    "author": {
      "displayName": "John Doe",
      "id": "user-guid",
      "uniqueName": "john.doe@example.com"
    },
    "publishedDate": "2023-05-15T10:30:12Z"
  },
  "thread": {
    "id": 50,
    "status": 1,
    "threadContext": {
      "filePath": "/src/app.ts",
      "rightFileStart": {
        "line": 42,
        "offset": 1
      },
      "rightFileEnd": {
        "line": 42,
        "offset": 1
      }
    },
    "comments": [
      {
        "id": 200,
        "content": "This variable name should be more descriptive",
        "commentType": 1,
        "author": {
          "displayName": "John Doe",
          "id": "user-guid",
          "uniqueName": "john.doe@example.com"
        },
        "publishedDate": "2023-05-15T10:30:12Z"
      }
    ]
  }
}
```

### Error Handling

The tool may throw the following errors:

- ValidationError: If required parameters are missing or invalid
- AuthenticationError: If authentication fails
- PermissionError: If the user doesn't have permission to comment on the pull request
- ResourceNotFoundError: If the project, repository, pull request, or thread doesn't exist
- GeneralError: For other unexpected errors

Error messages will include details about what went wrong and suggestions for resolution.

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
console.log(`Created reply with ID ${reply.comment.id}`);

// Reply to a specific comment in a thread
const threadedReply = await mcpClient.callTool('add_pull_request_comment', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  pullRequestId: 42,
  threadId: 123,
  parentCommentId: 456,
  content: 'Specifically addressing your point about error handling.',
});
console.log(`Created threaded reply with ID ${threadedReply.comment.id}`);

// Create a new general discussion thread in a pull request
const newThread = await mcpClient.callTool('add_pull_request_comment', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  pullRequestId: 42,
  content:
    "Overall this looks good, but let's discuss the error handling approach.",
});
console.log(`Created new thread with ID ${newThread.thread.id}`);

// Create a comment on a specific file and line
const fileComment = await mcpClient.callTool('add_pull_request_comment', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  pullRequestId: 42,
  content: 'This variable name should be more descriptive.',
  filePath: '/src/app.ts',
  lineNumber: 42,
});
console.log(
  `Created file comment with ID ${fileComment.comment.id} in thread ${fileComment.thread.id}`,
);

// Create a comment with thread status
const statusComment = await mcpClient.callTool('add_pull_request_comment', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  pullRequestId: 42,
  content: "There's an edge case not handled here.",
  filePath: '/src/app.ts',
  lineNumber: 87,
  status: 'active',
});
console.log(`Created active thread with ID ${statusComment.thread.id}`);
```

### Implementation Details

The `add_pull_request_comment` tool:

1. Establishes a connection to Azure DevOps using the provided credentials
2. Retrieves the Git API client
3. Creates the comment object with the provided content
4. Determines whether to add a comment to an existing thread or create a new thread:
   - For existing threads, it calls `createComment` to add a comment to the thread
   - For new threads, it creates a thread object and calls `createThread` to create a new thread with the comment
5. For file comments, it adds file path and line information to the thread context
6. Maps status strings to the appropriate CommentThreadStatus enum values
7. Returns the created comment or thread information
8. Handles errors and provides meaningful error messages

This implementation provides a flexible way to add comments to pull requests, supporting both regular discussion comments and code review feedback.

## update_pull_request

Updates an existing pull request with new properties, links work items, and manages reviewers.

### Description

The `update_pull_request` tool allows you to update various aspects of an existing pull request in Azure DevOps. You can modify the title, description, status, draft state, add or remove linked work items, and add or remove reviewers. This tool is useful for automating pull request workflows, updating PR details based on new information, and managing the review process.

### Parameters

```json
{
  "projectId": "MyProject", // Required: The ID or name of the project
  "repositoryId": "MyRepo", // Required: The ID or name of the repository
  "pullRequestId": 42, // Required: The ID of the pull request to update
  "title": "Updated PR Title", // Optional: The updated title of the pull request
  "description": "Updated PR description", // Optional: The updated description
  "status": "active", // Optional: The updated status (active, abandoned, completed)
  "isDraft": false, // Optional: Whether to mark (true) or unmark (false) as draft
  "addWorkItemIds": [123, 456], // Optional: Work item IDs to link to the PR
  "removeWorkItemIds": [789], // Optional: Work item IDs to unlink from the PR
  "addReviewers": ["user1@example.com"], // Optional: Reviewers to add
  "removeReviewers": ["user2@example.com"], // Optional: Reviewers to remove
  "additionalProperties": {} // Optional: Additional properties to update
}
```

| Parameter              | Type     | Required | Description                                                  |
| ---------------------- | -------- | -------- | ------------------------------------------------------------ |
| `projectId`            | string   | Yes      | The ID or name of the project containing the repository      |
| `repositoryId`         | string   | Yes      | The ID or name of the repository containing the pull request |
| `pullRequestId`        | number   | Yes      | The ID of the pull request to update                         |
| `title`                | string   | No       | The updated title of the pull request                        |
| `description`          | string   | No       | The updated description of the pull request                  |
| `status`               | string   | No       | The updated status: "active", "abandoned", or "completed"    |
| `isDraft`              | boolean  | No       | Whether to mark (true) or unmark (false) the PR as a draft   |
| `addWorkItemIds`       | number[] | No       | Array of work item IDs to link to the pull request           |
| `removeWorkItemIds`    | number[] | No       | Array of work item IDs to unlink from the pull request       |
| `addReviewers`         | string[] | No       | Array of reviewer email addresses or IDs to add              |
| `removeReviewers`      | string[] | No       | Array of reviewer email addresses or IDs to remove           |
| `additionalProperties` | object   | No       | Additional properties to update on the pull request          |

### Response

The tool returns the updated `PullRequest` object containing:

- `pullRequestId`: The unique identifier of the updated pull request
- `title`: The title of the pull request (updated if provided)
- `description`: The description of the pull request (updated if provided)
- `status`: The status of the pull request (active, abandoned, completed)
- `isDraft`: Whether the pull request is a draft
- And various other fields and references, including updated reviewers and work item references

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
  "title": "Updated PR Title",
  "description": "Updated PR description",
  "sourceRefName": "refs/heads/feature-branch",
  "targetRefName": "refs/heads/main",
  "mergeStatus": 3,
  "isDraft": false,
  "reviewers": [
    {
      "displayName": "Jane Smith",
      "id": "reviewer-guid",
      "uniqueName": "jane.smith@example.com",
      "voteResult": 0
    }
  ],
  "url": "https://dev.azure.com/organization/MyProject/_apis/git/repositories/MyRepo/pullRequests/42",
  "workItemRefs": [
    {
      "id": "123",
      "url": "https://dev.azure.com/organization/MyProject/_apis/wit/workItems/123"
    },
    {
      "id": "456",
      "url": "https://dev.azure.com/organization/MyProject/_apis/wit/workItems/456"
    }
  ]
}
```

### Error Handling

The tool may throw the following errors:

- ValidationError: If required parameters are missing or invalid
- AuthenticationError: If authentication fails
- PermissionError: If the user doesn't have permission to update the pull request
- ResourceNotFoundError: If the project, repository, or pull request doesn't exist
- GeneralError: For other unexpected errors

Error messages will include details about what went wrong and suggestions for resolution.

### Example Usage

```typescript
// Update the title and description of a pull request
const updatedPR = await mcpClient.callTool('update_pull_request', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  pullRequestId: 42,
  title: 'Updated PR Title',
  description: 'This PR has been updated to add new features',
});
console.log(`Updated PR: ${updatedPR.title}`);

// Mark a pull request as completed
const completedPR = await mcpClient.callTool('update_pull_request', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  pullRequestId: 42,
  status: 'completed',
});
console.log(
  `PR status: ${completedPR.status === 3 ? 'Completed' : 'Not completed'}`,
);

// Convert a draft PR to a normal PR
const readyPR = await mcpClient.callTool('update_pull_request', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  pullRequestId: 42,
  isDraft: false,
});
console.log(`PR is draft: ${readyPR.isDraft ? 'Yes' : 'No'}`);

// Add and remove work items from a PR
const workItemPR = await mcpClient.callTool('update_pull_request', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  pullRequestId: 42,
  addWorkItemIds: [123, 456],
  removeWorkItemIds: [789],
});
console.log(
  `PR now has ${workItemPR.workItemRefs?.length || 0} linked work items`,
);

// Add and remove reviewers
const reviewersPR = await mcpClient.callTool('update_pull_request', {
  projectId: 'MyProject',
  repositoryId: 'MyRepo',
  pullRequestId: 42,
  addReviewers: ['alex@example.com', 'taylor@example.com'],
  removeReviewers: ['old-reviewer@example.com'],
});
console.log(`PR now has ${reviewersPR.reviewers?.length || 0} reviewers`);
```

### Implementation Details

The `update_pull_request` tool:

1. Establishes a connection to Azure DevOps using the provided credentials
2. Retrieves the Git API client
3. Gets the current pull request to verify it exists
4. Creates an update object with only the properties that are being updated:
   - Basic properties (title, description, isDraft)
   - Status (active, abandoned, completed)
   - Any additional properties provided
5. Updates the pull request with the provided changes
6. If specified, handles adding and removing work item associations:
   - Adds work items by creating links between the PR and work items
   - Removes work items by deleting links between the PR and work items
7. If specified, handles adding and removing reviewers:
   - Adds reviewers by creating reviewer references
   - Removes reviewers by deleting reviewer references
8. Gets the final updated pull request to return all changes
9. Handles errors and provides meaningful error messages

This implementation provides a comprehensive way to update pull requests in Azure DevOps repositories, supporting all common update scenarios.
