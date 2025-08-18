# Pipeline Tools

This document describes the tools available for working with Azure DevOps pipelines.

## Table of Contents

- [`list_pipelines`](#list_pipelines) - List pipelines in a project
- [`get_pipeline`](#get_pipeline) - Get details of a specific pipeline
- [`trigger_pipeline`](#trigger_pipeline) - Trigger a pipeline run
- [`list_pipeline_runs`](#list_pipeline_runs) - List recent runs for a specific pipeline
- [`get_pipeline_run`](#get_pipeline_run) - Get details of a specific pipeline run
- [`get_pipeline_run_logs`](#get_pipeline_run_logs) - Get logs from a specific pipeline run

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

## list_pipeline_runs

Lists recent runs for a specific pipeline with optional limiting.

### Parameters

| Parameter    | Type   | Required | Description                                                            |
| ------------ | ------ | -------- | ---------------------------------------------------------------------- |
| `projectId`  | string | No       | The ID or name of the project (Default: from environment)              |
| `pipelineId` | number | Yes      | The ID of the pipeline to get runs for                                 |
| `top`        | number | No       | Maximum number of runs to return (default: 50, max: 1000)              |

### Response

Returns an array of run objects with details about each pipeline run:

```json
[
  {
    "id": 12345,
    "name": "20230215.1",
    "state": "completed",
    "result": "succeeded",
    "createdDate": "2023-02-15T10:30:00Z",
    "finishedDate": "2023-02-15T10:45:00Z",
    "url": "https://dev.azure.com/organization/project/_apis/pipelines/runs/12345",
    "_links": {
      "self": {
        "href": "https://dev.azure.com/organization/project/_apis/pipelines/runs/12345"
      },
      "web": {
        "href": "https://dev.azure.com/organization/project/_build/results?buildId=12345"
      }
    },
    "pipeline": {
      "id": 4,
      "name": "Node.js build pipeline"
    }
  },
  {
    "id": 12344,
    "name": "20230214.2",
    "state": "completed",
    "result": "failed",
    "createdDate": "2023-02-14T15:20:00Z",
    "finishedDate": "2023-02-14T15:35:00Z",
    "url": "https://dev.azure.com/organization/project/_apis/pipelines/runs/12344"
  }
]
```

### Error Handling

- Returns `AzureDevOpsResourceNotFoundError` if the pipeline or project does not exist
- Returns `AzureDevOpsAuthenticationError` if authentication fails
- Returns generic error messages for other failures

### Example Usage

```javascript
// List runs for a pipeline (default: 50 runs)
const runs = await callTool('list_pipeline_runs', {
  pipelineId: 4,
});

// List only the 10 most recent runs
const recentRuns = await callTool('list_pipeline_runs', {
  pipelineId: 4,
  top: 10,
});

// List runs with specific project and limit
const projectRuns = await callTool('list_pipeline_runs', {
  projectId: 'my-project',
  pipelineId: 4,
  top: 100,
});
```

### Note on Large Result Sets

The Azure DevOps API can return up to 10,000 runs for a pipeline. For pipelines with extensive history, use the `top` parameter to limit the response size and avoid potential token limit issues when using through MCP.

## get_pipeline_run

Gets detailed information about a specific pipeline run.

### Parameters

| Parameter    | Type   | Required | Description                                               |
| ------------ | ------ | -------- | --------------------------------------------------------- |
| `projectId`  | string | No       | The ID or name of the project (Default: from environment) |
| `pipelineId` | number | Yes      | The ID of the pipeline                                    |
| `runId`      | number | Yes      | The ID of the run                                         |

### Response

Returns a detailed run object with complete information about the pipeline run:

```json
{
  "id": 12345,
  "name": "20230215.1",
  "state": "completed",
  "result": "succeeded",
  "createdDate": "2023-02-15T10:30:00Z",
  "finishedDate": "2023-02-15T10:45:00Z",
  "url": "https://dev.azure.com/organization/project/_apis/pipelines/runs/12345",
  "_links": {
    "self": {
      "href": "https://dev.azure.com/organization/project/_apis/pipelines/runs/12345"
    },
    "web": {
      "href": "https://dev.azure.com/organization/project/_build/results?buildId=12345"
    }
  },
  "pipeline": {
    "id": 4,
    "name": "Node.js build pipeline",
    "revision": 2
  },
  "resources": {
    "repositories": {
      "self": {
        "refName": "refs/heads/main",
        "version": "abc123def456"
      }
    }
  },
  "templateParameters": {
    "environment": "production"
  },
  "variables": {
    "BUILD_CONFIG": {
      "value": "Release"
    },
    "deployEnvironment": {
      "value": "staging"
    }
  },
  "finalYaml": "# Pipeline YAML content..."
}
```

### Run States

- `unknown`: The run state is unknown
- `inProgress`: The run is currently in progress
- `canceling`: The run is being canceled
- `completed`: The run has completed

### Run Results

- `unknown`: The run result is unknown
- `succeeded`: The run completed successfully
- `failed`: The run failed
- `canceled`: The run was canceled

### Error Handling

- Returns `AzureDevOpsResourceNotFoundError` if the run, pipeline, or project does not exist
- Returns `AzureDevOpsAuthenticationError` if authentication fails
- Returns generic error messages for other failures

### Example Usage

```javascript
// Get details of a specific run
const runDetails = await callTool('get_pipeline_run', {
  pipelineId: 4,
  runId: 12345,
});

// Get run details with specific project
const projectRunDetails = await callTool('get_pipeline_run', {
  projectId: 'my-project',
  pipelineId: 4,
  runId: 12345,
});
```

## get_pipeline_run_logs

Gets logs from a specific pipeline run. Can retrieve all logs for a run or a specific log by ID, with optional content fetching.

### Parameters

| Parameter      | Type    | Required | Description                                                                                              |
| -------------- | ------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `projectId`    | string  | No       | The ID or name of the project (Default: from environment)                                                |
| `pipelineId`   | number  | Yes      | The ID of the pipeline                                                                                   |
| `runId`        | number  | Yes      | The ID of the run                                                                                        |
| `logId`        | number  | No       | Optional: The ID of a specific log to retrieve. If not provided, all logs are listed                     |
| `fetchContent` | boolean | No       | Whether to fetch the actual log content (default: false)                                                 |
| `expand`       | string  | No       | The level of detail to include: "none" or "signedContent" (default: "signedContent" for URLs to download logs) |

### Response

Returns an object containing logs metadata and optionally the actual log content:

```json
{
  "logs": {
    "count": 3,
    "value": [
      {
        "id": 1,
        "createdOn": "2023-02-15T10:30:00Z",
        "lineCount": 150,
        "url": "https://dev.azure.com/.../logs/1"
      },
      {
        "id": 2,
        "createdOn": "2023-02-15T10:31:00Z",
        "lineCount": 200,
        "url": "https://dev.azure.com/.../logs/2"
      },
      {
        "id": 3,
        "createdOn": "2023-02-15T10:32:00Z",
        "lineCount": 75,
        "url": "https://dev.azure.com/.../logs/3"
      }
    ]
  },
  "content": [
    "2023-02-15T10:30:00 Starting pipeline...\n2023-02-15T10:30:01 Checking out repository...",
    "2023-02-15T10:31:00 Building application...\n2023-02-15T10:31:05 Running npm install...",
    "2023-02-15T10:32:00 Running tests...\n2023-02-15T10:32:10 All tests passed!"
  ]
}
```

### Error Handling

- Returns `AzureDevOpsResourceNotFoundError` if the run, pipeline, or project does not exist
- Returns `AzureDevOpsAuthenticationError` if authentication fails
- Returns generic error messages for other failures
- Failed content fetches are logged but don't fail the operation

### Example Usage

```javascript
// List all logs for a run (metadata only)
const logsMetadata = await callTool('get_pipeline_run_logs', {
  pipelineId: 4,
  runId: 12345,
});

// List all logs and fetch their content
const logsWithContent = await callTool('get_pipeline_run_logs', {
  pipelineId: 4,
  runId: 12345,
  fetchContent: true,
});

// Get a specific log by ID with content
const specificLog = await callTool('get_pipeline_run_logs', {
  projectId: 'my-project',
  pipelineId: 4,
  runId: 12345,
  logId: 2,
  fetchContent: true,
});

// Get logs without signed URLs (metadata only)
const logsNoUrls = await callTool('get_pipeline_run_logs', {
  pipelineId: 4,
  runId: 12345,
  expand: 'none',
});
```

### Notes

- The `expand` parameter controls whether signed URLs are included for downloading log content
- When `fetchContent` is true, the tool will attempt to download and include the actual log text
- Large log files may take time to download and could impact performance
- Log content is returned as an array of strings, with each string corresponding to a log in the same order as the logs array
- If a specific log's content cannot be fetched (e.g., network error), an empty string is returned for that log
