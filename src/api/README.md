# Azure DevOps API Module

> Internal module for authenticating and interacting with Azure DevOps APIs.

## Overview

This module provides authentication and client functionality for Azure DevOps APIs within the MCP Server project. It handles Personal Access Token (PAT) based authentication, client management, and standardized error handling.

## Usage Examples

### Authentication

```typescript
import { AzureDevOpsClient } from '../api/client';

// Create a client instance
const client = new AzureDevOpsClient({
  pat: process.env.AZURE_DEVOPS_PAT,
  orgUrl: 'https://dev.azure.com/myorg'
});

// Check authentication
if (await client.isAuthenticated()) {
  console.log('Successfully authenticated');
}
```

### API Access

```typescript
// Get projects
const coreApi = await client.getCoreApi();
const projects = await coreApi.getProjects();

// Get repositories
const gitApi = await client.getGitApi();
const repos = await gitApi.getRepositories();

// Get work items
const witApi = await client.getWorkItemTrackingApi();
const workItem = await witApi.getWorkItem(123);
```

### Error Handling

```typescript
import { isAzureDevOpsError, formatAzureDevOpsError } from '../api/errors';

try {
  await client.getCoreApi();
} catch (error) {
  if (isAzureDevOpsError(error)) {
    console.error('Azure DevOps error:', formatAzureDevOpsError(error));
  } else {
    console.error('Unknown error:', error);
  }
}
```

## Available APIs

- Core API (`getCoreApi`)
- Git API (`getGitApi`)
- Work Item Tracking API (`getWorkItemTrackingApi`)
- Build API (`getBuildApi`)
- Test API (`getTestApi`)
- Release API (`getReleaseApi`)
- Task Agent API (`getTaskAgentApi`)
- Task API (`getTaskApi`) 