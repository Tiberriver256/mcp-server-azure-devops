# Work Item Tools

This document describes the tools available for working with Azure DevOps work items.

## Table of Contents

- [`get_work_item`](#get_work_item) - Retrieve a specific work item by ID
- [`create_work_item`](#create_work_item) - Create a new work item
- [`list_work_items`](#list_work_items) - List work items in a project
- [`create_work_item_attachment`](#create_work_item_attachment) - Upload and attach a file to a work item
- [`get_work_item_attachment`](#get_work_item_attachment) - Download an attachment from Azure DevOps
- [`delete_work_item_attachment`](#delete_work_item_attachment) - Delete an attachment from a work item

## get_work_item

Retrieves a work item by its ID.

### Parameters

| Parameter    | Type   | Required | Description                                                                       |
| ------------ | ------ | -------- | --------------------------------------------------------------------------------- |
| `workItemId` | number | Yes      | The ID of the work item to retrieve                                               |
| `expand`     | string | No       | Controls the level of detail in the response. Defaults to "All" if not specified. Other values: "Relations", "Fields", "None" |

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
// Using default expand="All"
const result = await callTool('get_work_item', {
  workItemId: 123,
});

// Explicitly specifying expand
const minimalResult = await callTool('get_work_item', {
  workItemId: 123,
  expand: 'None'
});
```

## create_work_item

Creates a new work item in a specified project.

### Parameters

| Parameter          | Type   | Required | Description                                                         |
| ------------------ | ------ | -------- | ------------------------------------------------------------------- |
| `projectId`        | string | Yes      | The ID or name of the project where the work item will be created   |
| `workItemType`     | string | Yes      | The type of work item to create (e.g., "Task", "Bug", "User Story") |
| `title`            | string | Yes      | The title of the work item                                          |
| `description`      | string | No       | The description of the work item                                    |
| `assignedTo`       | string | No       | The email or name of the user to assign the work item to            |
| `areaPath`         | string | No       | The area path for the work item                                     |
| `iterationPath`    | string | No       | The iteration path for the work item                                |
| `priority`         | number | No       | The priority of the work item                                       |
| `additionalFields` | object | No       | Additional fields to set on the work item (key-value pairs)         |

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
  description:
    'Create a secure login system with email and password authentication',
  assignedTo: 'developer@example.com',
  priority: 1,
  additionalFields: {
    'Custom.Field': 'Custom Value',
  },
});
```

### Implementation Details

The tool creates a JSON patch document to define the fields of the work item, then calls the Azure DevOps API to create the work item. Each field is added to the document with an 'add' operation, and the document is submitted to the API.

## list_work_items

Lists work items in a specified project.

### Parameters

| Parameter   | Type   | Required | Description                                           |
| ----------- | ------ | -------- | ----------------------------------------------------- |
| `projectId` | string | Yes      | The ID or name of the project to list work items from |
| `teamId`    | string | No       | The ID of the team to list work items for             |
| `queryId`   | string | No       | ID of a saved work item query                         |
| `wiql`      | string | No       | Work Item Query Language (WIQL) query                 |
| `top`       | number | No       | Maximum number of work items to return                |
| `skip`      | number | No       | Number of work items to skip                          |

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
  top: 10,
});
```

## create_work_item_attachment

Uploads a local file and attaches it to a work item via an `AttachedFile` relation.

### Parameters

| Parameter    | Type   | Required | Description |
| ------------ | ------ | -------- | ----------- |
| `workItemId` | number | Yes      | The ID of the work item to attach the file to |
| `filePath`   | string | Yes      | Absolute path to the file to upload |
| `fileName`   | string | No       | Attachment name; defaults to the basename of `filePath` |
| `comment`    | string | No       | Optional comment stored on the attachment relation |

### Behavior

1. Reads the file at `filePath`
2. Uploads it with `createAttachment`
3. Adds an `AttachedFile` relation on the work item

Returns the updated work item (including relations).

## get_work_item_attachment

Downloads an attachment by GUID and writes it to a local path (creates parent directories as needed).

### Parameters

| Parameter      | Type   | Required | Description |
| -------------- | ------ | -------- | ----------- |
| `attachmentId` | string | Yes      | Attachment GUID (from the work item relation URL) |
| `outputPath`   | string | Yes      | Absolute path where the file will be saved |

### Behavior

1. Downloads attachment content with `getAttachmentContent`
2. Ensures the parent directory of `outputPath` exists (`mkdir -p` style)
3. Writes the file to `outputPath`

Returns `{ filePath, fileName, size }`.

## delete_work_item_attachment

Removes an `AttachedFile` relation from a work item (unlinks the attachment from the work item).

### Parameters

| Parameter      | Type   | Required | Description |
| -------------- | ------ | -------- | ----------- |
| `workItemId`   | number | Yes      | The ID of the work item |
| `attachmentId` | string | Yes      | Attachment GUID to remove |

### Behavior

1. Loads the work item with relations
2. Finds the `AttachedFile` relation whose URL contains `attachmentId`
3. Removes that relation via a JSON patch update

Returns the updated work item.
