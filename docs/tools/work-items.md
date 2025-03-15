# Work Item Tools

This document describes the tools available for working with Azure DevOps work items.

## Table of Contents

- [`get_work_item`](#get_work_item) - Retrieve a specific work item by ID
- [`create_work_item`](#create_work_item) - Create a new work item
- [`list_work_items`](#list_work_items) - List work items in a project

## get_work_item

Retrieves a work item by its ID.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workItemId` | number | Yes | The ID of the work item to retrieve |
| `expand` | string | No | Controls the level of detail in the response (e.g., "All", "Relations", "Fields") |

### Response

Returns a work item object with the following structure:

```json
{
  "id": 123,
  "fields": {
    "System.Title": "Sample Work Item",
    "System.State": "Active",
    "System.AssignedTo": "user@example.com",
    "System.Description": "Description of the work item"
  },
  "url": "https://dev.azure.com/organization/project/_apis/wit/workItems/123"
}
```

### Error Handling

- Returns `AzureDevOpsResourceNotFoundError` if the work item does not exist
- Returns `AzureDevOpsAuthenticationError` if authentication fails
- Returns generic error messages for other failures

### Example Usage

```javascript
const result = await callTool('get_work_item', {
  workItemId: 123
});
```

## create_work_item

Creates a new work item in a specified project.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectId` | string | Yes | The ID or name of the project where the work item will be created |
| `workItemType` | string | Yes | The type of work item to create (e.g., "Task", "Bug", "User Story") |
| `title` | string | Yes | The title of the work item |
| `description` | string | No | The description of the work item |
| `assignedTo` | string | No | The email or name of the user to assign the work item to |
| `areaPath` | string | No | The area path for the work item |
| `iterationPath` | string | No | The iteration path for the work item |
| `priority` | number | No | The priority of the work item |
| `additionalFields` | object | No | Additional fields to set on the work item (key-value pairs) |

### Response

Returns the newly created work item object:

```json
{
  "id": 124,
  "fields": {
    "System.Title": "New Work Item",
    "System.State": "New",
    "System.Description": "Description of the new work item",
    "System.AssignedTo": "user@example.com",
    "System.AreaPath": "Project\\Team",
    "System.IterationPath": "Project\\Sprint 1",
    "Microsoft.VSTS.Common.Priority": 2
  },
  "url": "https://dev.azure.com/organization/project/_apis/wit/workItems/124"
}
```

### Error Handling

- Returns validation error if required fields are missing
- Returns `AzureDevOpsAuthenticationError` if authentication fails
- Returns `AzureDevOpsResourceNotFoundError` if the project does not exist
- Returns generic error messages for other failures

### Example Usage

```javascript
const result = await callTool('create_work_item', {
  projectId: 'my-project',
  workItemType: 'User Story',
  title: 'Implement login functionality',
  description: 'Create a secure login system with email and password authentication',
  assignedTo: 'developer@example.com',
  priority: 1,
  additionalFields: {
    'Custom.Field': 'Custom Value'
  }
});
```

### Implementation Details

The tool creates a JSON patch document to define the fields of the work item, then calls the Azure DevOps API to create the work item. Each field is added to the document with an 'add' operation, and the document is submitted to the API.

## list_work_items

Lists work items in a specified project.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectId` | string | Yes | The ID or name of the project to list work items from |
| `teamId` | string | No | The ID of the team to list work items for |
| `queryId` | string | No | ID of a saved work item query |
| `wiql` | string | No | Work Item Query Language (WIQL) query |
| `top` | number | No | Maximum number of work items to return |
| `skip` | number | No | Number of work items to skip |

### Response

Returns an array of work item objects:

```json
[
  {
    "id": 123,
    "fields": {
      "System.Title": "Sample Work Item",
      "System.State": "Active",
      "System.AssignedTo": "user@example.com"
    },
    "url": "https://dev.azure.com/organization/project/_apis/wit/workItems/123"
  },
  {
    "id": 124,
    "fields": {
      "System.Title": "Another Work Item",
      "System.State": "New",
      "System.AssignedTo": "user2@example.com"
    },
    "url": "https://dev.azure.com/organization/project/_apis/wit/workItems/124"
  }
]
```

### Error Handling

- Returns `AzureDevOpsResourceNotFoundError` if the project does not exist
- Returns `AzureDevOpsAuthenticationError` if authentication fails
- Returns generic error messages for other failures

### Example Usage

```javascript
const result = await callTool('list_work_items', {
  projectId: 'my-project',
  wiql: "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Task' ORDER BY [System.CreatedDate] DESC",
  top: 10
});
``` 