# Core Navigation Tools for Azure DevOps

This document provides an overview of the core navigation tools available in the Azure DevOps MCP server. These tools help you discover and navigate the organizational structure of Azure DevOps, from organizations down to repositories.

## Navigation Hierarchy

Azure DevOps resources are organized in a hierarchical structure:

```
Organizations
└── Projects
    └── Repositories
        └── Branches, Files, etc.
```

The core navigation tools allow you to explore this hierarchy from top to bottom.

## Available Tools

| Tool Name | Description | Required Parameters | Optional Parameters |
|-----------|-------------|---------------------|---------------------|
| [`list_organizations`](./organizations.md#list_organizations) | Lists all Azure DevOps organizations accessible to the user | None | None |
| [`list_projects`](./projects.md#list_projects) | Lists all projects in the organization | None | stateFilter, top, skip, continuationToken |
| [`list_repositories`](./repositories.md#list_repositories) | Lists all repositories in a project | projectId | includeLinks |

## Common Use Cases

### Discovering Resource Structure

A common workflow is to navigate the hierarchy to discover resources:

1. Use `list_organizations` to find available organizations
2. Use `list_projects` to find projects in a selected organization
3. Use `list_repositories` to find repositories in a selected project

Example:

```typescript
// Step 1: Get all organizations
const organizations = await mcpClient.callTool("list_organizations", {});
const myOrg = organizations[0]; // Use the first organization for this example

// Step 2: Get all projects in the organization
const projects = await mcpClient.callTool("list_projects", {});
const myProject = projects[0]; // Use the first project for this example

// Step 3: Get all repositories in the project
const repositories = await mcpClient.callTool("list_repositories", {
  projectId: myProject.name
});
```

### Filtering Projects

You can filter projects based on their state:

```typescript
// Get only well-formed projects (state = 1)
const wellFormedProjects = await mcpClient.callTool("list_projects", {
  stateFilter: 1
});
```

### Pagination

For organizations with many projects or repositories, you can use pagination:

```typescript
// Get projects with pagination (first 10 projects)
const firstPage = await mcpClient.callTool("list_projects", {
  top: 10,
  skip: 0
});

// Get the next 10 projects
const secondPage = await mcpClient.callTool("list_projects", {
  top: 10,
  skip: 10
});
```

## Detailed Documentation

For detailed information about each tool, including parameters, response format, and error handling, please refer to the individual tool documentation:

- [list_organizations](./organizations.md#list_organizations)
- [list_projects](./projects.md#list_projects)
- [list_repositories](./repositories.md#list_repositories)

## Error Handling

Each of these tools may throw various errors, such as authentication errors or permission errors. Be sure to implement proper error handling when using these tools. Refer to the individual tool documentation for specific error types that each tool might throw. 