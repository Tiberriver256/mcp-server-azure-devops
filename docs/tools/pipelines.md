# Pipeline Tools

This document describes the tools available for working with Azure DevOps pipelines.

## Table of Contents

- [`list_pipelines`](#list_pipelines) - List pipelines in a project
- [`get_pipeline`](#get_pipeline) - Get details of a specific pipeline
- [`list_pipeline_runs`](#list_pipeline_runs) - List recent runs for a pipeline
- [`get_pipeline_run`](#get_pipeline_run) - Get details of a specific run (plus artifacts)
- [`download_pipeline_artifact`](#download_pipeline_artifact) - Download an artifact file as text
- [`pipeline_timeline`](#pipeline_timeline) - Retrieve the stage and job timeline for a run
- [`get_pipeline_log`](#get_pipeline_log) - Retrieve raw or JSON-formatted log content
- [`trigger_pipeline`](#trigger_pipeline) - Trigger a pipeline run

## list_pipelines

Lists pipelines in a project.

### Parameters

| Parameter   | Type   | Required | Description                                               |
| ----------- | ------ | -------- | --------------------------------------------------------- |
| `projectId` | string | No       | The ID or name of the project (Default: from environment) |
| `orderBy`   | string | No       | Order by field and direction (e.g., "createdDate desc")   |
| `top`       | number | No       | Maximum number of pipelines to return                     |

### Response

Returns an array of pipeline objects:

```json
{
  "count": 2,
  "value": [
    {
      "id": 4,
      "revision": 2,
      "name": "Node.js build pipeline",
      "folder": "\\",
      "url": "https://dev.azure.com/organization/project/_apis/pipelines/4"
    },
    {
      "id": 1,
      "revision": 1,
      "name": "Sample Pipeline",
      "folder": "\\",
      "url": "https://dev.azure.com/organization/project/_apis/pipelines/1"
    }
  ]
}
```

### Error Handling

- Returns `AzureDevOpsResourceNotFoundError` if the project does not exist
- Returns `AzureDevOpsAuthenticationError` if authentication fails
- Returns generic error messages for other failures

### Example Usage

```javascript
// Using default project from environment
const result = await callTool('list_pipelines', {});

// Specifying project and limiting results
const limitedResult = await callTool('list_pipelines', {
  projectId: 'my-project',
  top: 10,
  orderBy: 'name asc',
});
```

## get_pipeline

Gets details of a specific pipeline.

### Parameters

| Parameter         | Type   | Required | Description                                                       |
| ----------------- | ------ | -------- | ----------------------------------------------------------------- |
| `projectId`       | string | No       | The ID or name of the project (Default: from environment)         |
| `pipelineId`      | number | Yes      | The numeric ID of the pipeline to retrieve                        |
| `pipelineVersion` | number | No       | The version of the pipeline to retrieve (latest if not specified) |

### Response

Returns a pipeline object with the following structure:

```json
{
  "id": 4,
  "revision": 2,
  "name": "Node.js build pipeline",
  "folder": "\\",
  "url": "https://dev.azure.com/organization/project/_apis/pipelines/4",
  "_links": {
    "self": {
      "href": "https://dev.azure.com/organization/project/_apis/pipelines/4"
    },
    "web": {
      "href": "https://dev.azure.com/organization/project/_build/definition?definitionId=4"
    }
  },
  "configuration": {
    "path": "azure-pipelines.yml",
    "repository": {
      "id": "bd0e8130-7fba-4f3b-8559-54760b6e7248",
      "type": "azureReposGit"
    },
    "type": "yaml"
  }
}
```

### Error Handling

- Returns `AzureDevOpsResourceNotFoundError` if the pipeline or project does not exist
- Returns `AzureDevOpsAuthenticationError` if authentication fails
- Returns generic error messages for other failures

### Example Usage

```javascript
// Get latest version of a pipeline
const result = await callTool('get_pipeline', {
  pipelineId: 4,
});

// Get specific version of a pipeline
const versionResult = await callTool('get_pipeline', {
  projectId: 'my-project',
  pipelineId: 4,
  pipelineVersion: 2,
});
```

## list_pipeline_runs

Lists recent runs for a given pipeline with optional filtering by branch, state, result, or time window.

### Parameters

| Parameter           | Type         | Required | Description                                                                 |
| ------------------- | ------------ | -------- | --------------------------------------------------------------------------- |
| `projectId`         | string       | No       | The ID or name of the project (Default: from environment)                   |
| `pipelineId`        | number       | Yes      | Numeric ID of the pipeline whose runs should be returned                    |
| `top`               | number       | No       | Maximum rows to return (1-100, default 50)                                  |
| `continuationToken` | string       | No       | Continuation token for paging through long histories                         |
| `branch`            | string       | No       | Filter runs by branch (accepts `main` or full ref like `refs/heads/main`)   |
| `state`             | string       | No       | Filter by current run state (`notStarted`, `inProgress`, `completed`, etc.) |
| `result`            | string       | No       | Filter by final run result (`succeeded`, `failed`, `canceled`, etc.)        |
| `createdFrom`       | string (ISO) | No       | Restrict runs created on or after this timestamp                            |
| `createdTo`         | string (ISO) | No       | Restrict runs created on or before this timestamp                           |
| `orderBy`           | string       | No       | Sort order for creation date (`createdDate desc` by default)                |

### Response

Returns the runs plus a continuation token when more pages are available:

```json
{
  "runs": [
    {
      "id": 13590799,
      "name": "20251001.2",
      "createdDate": "2025-10-01T08:59:27.343Z",
      "state": "completed",
      "result": "succeeded",
      "pipeline": { "id": 69847, "name": "embed-confluence-content" },
      "_links": {
        "web": {
          "href": "https://dev.azure.com/org/project/_build/results?buildId=13590799"
        }
      }
    }
  ],
  "continuationToken": "eyJwYWdlIjoxfQ=="
}
```

### Error Handling

- Returns `AzureDevOpsResourceNotFoundError` if the pipeline or project does not exist
- Returns `AzureDevOpsAuthenticationError` if authentication fails
- Returns generic error messages for other failures

### Example Usage

```javascript
// Fetch the latest 10 runs on the main branch
const runs = await callTool('list_pipeline_runs', {
  pipelineId: 69847,
  top: 10,
  branch: 'main',
});

// Continue from a previous page
const nextPage = await callTool('list_pipeline_runs', {
  pipelineId: 69847,
  continuationToken: runs.continuationToken,
});
```

## get_pipeline_run

Gets detailed information about a single pipeline run, including artifact listings when available.

### Parameters

| Parameter    | Type   | Required | Description                                                                 |
| ------------ | ------ | -------- | --------------------------------------------------------------------------- |
| `projectId`  | string | No       | The ID or name of the project (Default: from environment)                   |
| `runId`      | number | Yes      | Numeric ID of the pipeline run                                              |
| `pipelineId` | number | No       | Optional guard to validate the run belongs to the specified pipeline        |

### Response

Returns the pipeline run enriched with artifact metadata:

```json
{
  "id": 13590799,
  "name": "20251001.2",
  "state": "completed",
  "result": "succeeded",
  "pipeline": { "id": 69847, "name": "embed-confluence-content" },
  "createdDate": "2025-10-01T08:59:27.343Z",
  "artifacts": [
    {
      "name": "embedding-batch",
      "type": "PipelineArtifact",
      "downloadUrl": "https://.../embedding-batch.zip",
      "signedContentUrl": "https://.../signedContent",
      "items": [
        { "path": "logs", "itemType": "folder" },
        { "path": "logs/summary.json", "itemType": "file" }
      ]
    },
    {
      "name": "embedding-metrics",
      "type": "Container",
      "containerId": 39106000,
      "rootPath": "embedding-metrics",
      "items": [
        { "path": "embedding_metrics.json", "itemType": "file", "size": 2048 }
      ]
    }
  ]
}
```

### Error Handling

- Returns `AzureDevOpsResourceNotFoundError` if the run or project does not exist
- Returns `AzureDevOpsResourceNotFoundError` if `pipelineId` is provided and does not match the run
- Returns `AzureDevOpsAuthenticationError` if authentication fails
- Returns generic error messages for other failures

### Example Usage

```javascript
// Inspect a run and the files it produced
const run = await callTool('get_pipeline_run', {
  runId: 13590799,
});

// Guard against a run from another pipeline
await callTool('get_pipeline_run', {
  pipelineId: 69847,
  runId: 13590799,
});
```

## download_pipeline_artifact

Downloads a single file from a pipeline run artifact (container or pipeline artifact) and returns its textual content.

### Parameters

| Parameter      | Type   | Required | Description                                                                 |
| -------------- | ------ | -------- | --------------------------------------------------------------------------- |
| `projectId`    | string | No       | The ID or name of the project (Default: from environment)                   |
| `runId`        | number | Yes      | Numeric ID of the pipeline run                                              |
| `artifactPath` | string | Yes      | Artifact name and file path (e.g., `artifact-name/path/to/file.json`)       |
| `pipelineId`   | number | No       | Optional guard to disambiguate runs triggered by different pipelines        |

### Response

Returns the file content along with artifact metadata:

```json
{
  "artifact": "embedding-metrics",
  "path": "embedding-metrics/embedding_metrics.json",
  "content": "{\n  \"status\": \"ok\"\n}"
}
```

### Error Handling

- Returns `AzureDevOpsResourceNotFoundError` if the artifact or requested file is missing
- Returns `AzureDevOpsAuthenticationError` if the artifact storage cannot be accessed
- Returns generic error messages for other failures

### Example Usage

```javascript
// Download a JSON summary generated by the run
const artifact = await callTool('download_pipeline_artifact', {
  runId: 13590799,
  artifactPath: 'embedding-metrics/embedding_metrics.json',
});
console.log(JSON.parse(artifact.content));
```

## pipeline_timeline

Retrieves the timeline of stages, jobs, and tasks for a pipeline run with optional filtering by state and result.

### Parameters

| Parameter    | Type                   | Required | Description                                                                     |
| ------------ | ---------------------- | -------- | ------------------------------------------------------------------------------- |
| `projectId`  | string                 | No       | The ID or name of the project (Default: from environment)                       |
| `runId`      | number                 | Yes      | Numeric ID of the pipeline run                                                  |
| `timelineId` | string                 | No       | Fetch a specific timeline record (otherwise returns the default timeline)       |
| `pipelineId` | number                 | No       | Optional reference to the pipeline for documentation purposes                   |
| `state`      | string or string array | No       | Filter returned records by state (`pending`, `inProgress`, `completed`)         |
| `result`     | string or string array | No       | Filter returned records by result (`succeeded`, `failed`, `canceled`, etc.)     |

### Response

Returns the timeline records (filtered when requested):

```json
{
  "id": "f9d9c210-06c7-4e53-b45f-6b661341fa7f",
  "records": [
    {
      "id": "Stage_1",
      "name": "Build",
      "type": "Stage",
      "state": "completed",
      "result": "succeeded",
      "startTime": "2025-10-01T08:59:30.123Z",
      "finishTime": "2025-10-01T09:02:10.456Z"
    },
    {
      "id": "Job_1",
      "name": "Agent job",
      "type": "Job",
      "parentId": "Stage_1",
      "state": "completed",
      "result": "succeeded"
    }
  ]
}
```

### Error Handling

- Returns `AzureDevOpsResourceNotFoundError` if the timeline or project does not exist
- Returns `AzureDevOpsAuthenticationError` if authentication fails
- Returns generic error messages for other failures

### Example Usage

```javascript
// Fetch the full timeline
const timeline = await callTool('pipeline_timeline', {
  runId: 13590799,
});

// Only keep completed records
const completed = await callTool('pipeline_timeline', {
  runId: 13590799,
  state: 'completed',
});
```

## get_pipeline_log

Retrieves log content for a specific timeline log. Supports plain text or JSON (structured lines) formats.

### Parameters

| Parameter    | Type   | Required | Description                                                                  |
| ------------ | ------ | -------- | ---------------------------------------------------------------------------- |
| `projectId`  | string | No       | The ID or name of the project (Default: from environment)                    |
| `runId`      | number | Yes      | Numeric ID of the pipeline run                                               |
| `logId`      | number | Yes      | Log identifier from the timeline records                                    |
| `format`     | string | No       | `plain` (default) or `json`                                                  |
| `startLine`  | number | No       | First line to include (useful for large logs)                                |
| `endLine`    | number | No       | Last line to include (exclusive, when paired with `startLine`)               |
| `pipelineId` | number | No       | Optional reference to help locate the log when working across many pipelines |

### Response

- When `format` is omitted or set to `plain`, returns a newline-delimited string:

```text
Queueing build...
Starting: Build
##[section]Starting: Initialize job
```

- When `format` is set to `json`, returns the structured log payload from Azure DevOps:

```json
[
  {
    "line": 1,
    "stepRecordId": "Job_1",
    "content": "##[section]Starting: Initialize job"
  }
]
```

### Error Handling

- Returns `AzureDevOpsResourceNotFoundError` if the log or project does not exist
- Returns `AzureDevOpsAuthenticationError` if authentication fails
- Returns generic error messages for other failures

### Example Usage

```javascript
// Grab the first 200 lines of plain text
const logText = await callTool('get_pipeline_log', {
  runId: 13590799,
  logId: 12,
  startLine: 0,
  endLine: 200,
});

// Fetch the same lines as structured JSON
const logJson = await callTool('get_pipeline_log', {
  runId: 13590799,
  logId: 12,
  format: 'json',
  startLine: 0,
  endLine: 200,
});
```

## trigger_pipeline

Triggers a run of a specific pipeline. Allows specifying the branch to run on and passing variables to customize the pipeline execution.

### Parameters

| Parameter            | Type   | Required | Description                                                           |
| -------------------- | ------ | -------- | --------------------------------------------------------------------- |
| `projectId`          | string | No       | The ID or name of the project (Default: from environment)             |
| `pipelineId`         | number | Yes      | The numeric ID of the pipeline to trigger                             |
| `branch`             | string | No       | The branch to run the pipeline on (e.g., "main", "feature/my-branch") |
| `variables`          | object | No       | Variables to pass to the pipeline run                                 |
| `templateParameters` | object | No       | Parameters for template-based pipelines                               |
| `stagesToSkip`       | array  | No       | Stages to skip in the pipeline run                                    |

#### Variables Format

```json
{
  "myVariable": {
    "value": "my-value",
    "isSecret": false
  },
  "secretVariable": {
    "value": "secret-value",
    "isSecret": true
  }
}
```

### Response

Returns a run object with details about the triggered pipeline run:

```json
{
  "id": 12345,
  "name": "20230215.1",
  "createdDate": "2023-02-15T10:30:00Z",
  "url": "https://dev.azure.com/organization/project/_apis/pipelines/runs/12345",
  "_links": {
    "self": {
      "href": "https://dev.azure.com/organization/project/_apis/pipelines/runs/12345"
    },
    "web": {
      "href": "https://dev.azure.com/organization/project/_build/results?buildId=12345"
    }
  },
  "state": 1,
  "result": null,
  "variables": {
    "myVariable": {
      "value": "my-value"
    }
  }
}
```

### Error Handling

- Returns `AzureDevOpsResourceNotFoundError` if the pipeline or project does not exist
- Returns `AzureDevOpsAuthenticationError` if authentication fails
- Returns generic error messages for other failures

### Example Usage

```javascript
// Trigger a pipeline on the default branch
// In this case, use default project from environment variables
const result = await callTool('trigger_pipeline', {
  pipelineId: 4,
});

// Trigger a pipeline on a specific branch with variables
const runWithOptions = await callTool('trigger_pipeline', {
  projectId: 'my-project',
  pipelineId: 4,
  branch: 'feature/my-branch',
  variables: {
    deployEnvironment: {
      value: 'staging',
      isSecret: false,
    },
  },
});
```
