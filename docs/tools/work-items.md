# Work Item Tools

This document describes the tools available for working with Azure DevOps work items.

## Table of Contents

- [`get_work_item`](#get_work_item) - Retrieve a specific work item by ID
- [`create_work_item`](#create_work_item) - Create a new work item
- [`update_work_item`](#update_work_item) - Update an existing work item
- [`list_work_items`](#list_work_items) - List work items in a project
- [`manage_work_item_link`](#manage_work_item_link) - Add, remove, or update links between work items
- [`get_work_item_comments`](#get_work_item_comments) - Retrieve comments on a work item
- [`create_work_item_attachment`](#create_work_item_attachment) - Upload and attach a file to a work item
- [`get_work_item_attachment`](#get_work_item_attachment) - Download an attachment from Azure DevOps
- [`delete_work_item_attachment`](#delete_work_item_attachment) - Delete an attachment from a work item

## get_work_item

Retrieves a work item by its ID.

### Parameters

| Parameter    | Type   | Required | Description                                                                                       |
| ------------ | ------ | -------- | ------------------------------------------------------------------------------------------------- |
| `workItemId` | number | Yes      | The ID of the work item to retrieve                                                               |
| `expand`     | string | No       | Controls response expansion: `"none"`, `"relations"`, `"fields"`, `"links"`, or `"all"` (default: `"all"` when omitted) |

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

### Example Usage

```javascript
// Using default expansion ("all")
const result = await callTool('get_work_item', {
  workItemId: 123,
});

// Explicitly specifying lowercase expand enum
const minimalResult = await callTool('get_work_item', {
  workItemId: 123,
  expand: 'none',
});
```

## create_work_item

Creates a new work item in a specified project.

### Parameters

| Parameter           | Type     | Required | Description                                                                                                |
| ------------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `workItemType`      | string   | Yes      | The type of work item to create (e.g., `"Task"`, `"Bug"`, `"User Story"`)                                  |
| `title`             | string   | Yes      | The title of the work item                                                                                 |
| `projectId`         | string   | No       | The ID or name of the project (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`)                                 |
| `organizationId`    | string   | No       | Optional Azure DevOps Services organization override                                                       |
| `description`       | string   | No       | The description of the work item (HTML by default; set `descriptionFormat` to `"markdown"` for Markdown)   |
| `descriptionFormat` | string   | No       | Format for `description`: `"html"` (default) or `"markdown"` (irreversible once saved as Markdown in ADO)  |
| `assignedTo`        | string   | No       | The email or name of the user to assign the work item to                                                   |
| `areaPath`          | string   | No       | The area path for the work item                                                                            |
| `iterationPath`     | string   | No       | The iteration path for the work item                                                                       |
| `priority`          | number   | No       | The priority of the work item                                                                              |
| `parentId`          | number   | No       | Optional parent work item ID to link via `System.LinkTypes.Hierarchy-Reverse`                              |
| `tags`              | string[] | No       | Optional list of tags to apply to the work item                                                            |
| `additionalFields`  | object   | No       | Additional fields to set on the work item (key-value pairs)                                                |

### Example Usage

```javascript
const result = await callTool('create_work_item', {
  projectId: 'my-project',
  workItemType: 'User Story',
  title: 'Implement login functionality',
  description: 'Create a secure login system with email and password authentication',
  assignedTo: 'developer@example.com',
  priority: 1,
  parentId: 42,
  tags: ['security', 'auth'],
  additionalFields: {
    'Custom.Field': 'Custom Value',
  },
});
```

## update_work_item

Updates fields, state, or tags on an existing work item.

### Parameters

| Parameter           | Type     | Required | Description                                                                                                |
| ------------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `workItemId`        | number   | Yes      | The ID of the work item to update                                                                          |
| `title`             | string   | No       | New title for the work item                                                                                |
| `description`       | string   | No       | New description (HTML by default; set `descriptionFormat` to `"markdown"` for Markdown)                    |
| `descriptionFormat` | string   | No       | Format for `description`: `"html"` (default) or `"markdown"`                                               |
| `assignedTo`        | string   | No       | New assignee email or display name                                                                         |
| `areaPath`          | string   | No       | New area path                                                                                              |
| `iterationPath`     | string   | No       | New iteration path                                                                                         |
| `priority`          | number   | No       | New priority                                                                                               |
| `state`             | string   | No       | New workflow state (e.g., `"Active"`, `"Resolved"`, `"Closed"`)                                            |
| `tags`              | string[] | No       | Replace all tags with this list                                                                            |
| `tagsToAdd`         | string[] | No       | Incrementally add tags without removing existing ones                                                      |
| `tagsToRemove`      | string[] | No       | Incrementally remove specific tags                                                                         |
| `additionalFields`  | object   | No       | Additional field updates as key-value pairs                                                                |

### Response

Returns the updated work item object.

### Example Usage

```javascript
const updated = await callTool('update_work_item', {
  workItemId: 123,
  state: 'Active',
  tagsToAdd: ['in-review'],
});
```

## list_work_items

Lists work items in a specified project using a default query, a saved query ID, or custom WIQL. Automatically chunks detail fetches into batches of 200 IDs to satisfy Azure DevOps API limits.

### Parameters

| Parameter        | Type     | Required | Description                                                                   |
| ---------------- | -------- | -------- | ----------------------------------------------------------------------------- |
| `projectId`      | string   | No       | The ID or name of the project (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`)    |
| `organizationId` | string   | No       | Optional Azure DevOps Services organization override                          |
| `teamId`         | string   | No       | The ID of the team to list work items for                                     |
| `queryId`        | string   | No       | ID of a saved work item query                                                 |
| `wiql`           | string   | No       | Work Item Query Language (WIQL) query                                         |
| `top`            | number   | No       | Maximum number of work items to return (default: `200`)                       |
| `skip`           | number   | No       | Number of work items to skip                                                  |
| `fields`         | string[] | No       | Additional work item field reference names to include alongside default fields |

### Example Usage

```javascript
const result = await callTool('list_work_items', {
  projectId: 'my-project',
  wiql: "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Task' ORDER BY [System.CreatedDate] DESC",
  top: 10,
  fields: ['Microsoft.VSTS.Scheduling.StoryPoints'],
});
```

## manage_work_item_link

Adds, removes, or updates a relationship link between two work items.

### Parameters

| Parameter          | Type   | Required | Description                                                                                                      |
| ------------------ | ------ | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `sourceWorkItemId` | number | Yes      | Source work item ID                                                                                              |
| `targetWorkItemId` | number | Yes      | Target work item ID                                                                                              |
| `operation`        | string | Yes      | Link operation: `"add"`, `"remove"`, or `"update"`                                                               |
| `relationType`     | string | Yes      | Relation type reference name (e.g., `"System.LinkTypes.Hierarchy-Forward"`, `"System.LinkTypes.Related"`)        |
| `newRelationType`  | string | No       | New relation type when `operation` is `"update"`                                                                 |
| `comment`          | string | No       | Optional comment stored on the link                                                                              |
| `projectId`        | string | No       | Project ID or name (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`)                                                  |
| `organizationId`   | string | No       | Optional Azure DevOps Services organization override                                                             |

### Example Usage

```javascript
await callTool('manage_work_item_link', {
  sourceWorkItemId: 100,
  targetWorkItemId: 101,
  operation: 'add',
  relationType: 'System.LinkTypes.Hierarchy-Forward',
  comment: 'Child task',
});
```

## get_work_item_comments

Retrieves paginated comments for a work item.

### Parameters

| Parameter           | Type    | Required | Description                                                                                 |
| ------------------- | ------- | -------- | ------------------------------------------------------------------------------------------- |
| `workItemId`        | number  | Yes      | The ID of the work item                                                                     |
| `projectId`         | string  | No       | Project ID or name (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`)                             |
| `top`               | number  | No       | Maximum number of comments to return                                                        |
| `continuationToken` | string  | No       | Continuation token for pagination                                                           |
| `includeDeleted`    | boolean | No       | Include deleted comments (default: `false`)                                                 |
| `expand`            | string  | No       | Expansion mode: `"none"`, `"reactions"`, `"renderedText"`, or `"all"` (default: `"none"`)   |
| `order`             | string  | No       | Sort order: `"asc"` or `"desc"` (default: `"desc"`)                                         |

### Response

Returns `{ totalCount, count, comments, continuationToken? }`.

## create_work_item_attachment

Streams a local file from disk and attaches it to a work item via an `AttachedFile` relation.

### Parameters

| Parameter    | Type   | Required | Description                                            |
| ------------ | ------ | -------- | ------------------------------------------------------ |
| `workItemId` | number | Yes      | The ID of the work item to attach the file to          |
| `filePath`   | string | Yes      | Absolute path to the file to upload                    |
| `fileName`   | string | No       | Attachment name; defaults to the basename of `filePath` |
| `comment`    | string | No       | Optional comment stored on the attachment relation     |

Returns the updated work item (including relations).

## get_work_item_attachment

Downloads an attachment by GUID using backpressure-aware streaming and writes it to a local path (creating parent directories as needed and cleaning up partial files on error).

### Parameters

| Parameter      | Type   | Required | Description                                        |
| -------------- | ------ | -------- | -------------------------------------------------- |
| `attachmentId` | string | Yes      | Attachment GUID (from the work item relation URL)  |
| `outputPath`   | string | Yes      | Absolute path where the file will be saved         |

Returns `{ filePath, fileName, size }`.

## delete_work_item_attachment

Removes an `AttachedFile` relation from a work item (unlinks the attachment from the work item).

### Parameters

| Parameter      | Type   | Required | Description                |
| -------------- | ------ | -------- | -------------------------- |
| `workItemId`   | number | Yes      | The ID of the work item    |
| `attachmentId` | string | Yes      | Attachment GUID to remove  |

Returns the updated work item.
