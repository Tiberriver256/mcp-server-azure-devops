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
- For large logs that exceed MCP token limits, use `get_pipeline_log_content` for direct access or `download_pipeline_run_logs` for bulk downloads

## get_pipeline_log_content

Get specific log content from a pipeline run with automatic download and caching. This is the recommended tool for accessing pipeline logs.

### Parameters

| Parameter          | Type    | Required | Description                                                            |
| ------------------ | ------- | -------- | ---------------------------------------------------------------------- |
| `projectId`        | string  | No       | The ID or name of the project (Default: from environment)              |
| `pipelineId`       | number  | Yes      | The ID of the pipeline                                                 |
| `runId`            | number  | Yes      | The ID of the run                                                      |
| `logId`            | number  | Yes      | The ID of the specific log to retrieve                                 |
| `offset`           | number  | No       | Line number to start reading from (0-based)                            |
| `limit`            | number  | No       | Maximum number of lines to return (default: 1000, max: 5000)           |
| `includeDownloadPath` | boolean | No    | Whether to include the local download path in the response             |

### Response

Returns the log content with metadata:

```json
{
  "logId": 23,
  "content": "2025-08-19T02:01:13.414Z Starting: Build\n...",
  "lineCount": 100,
  "totalLines": 7945,
  "size": 1146865,
  "offset": 0,
  "limit": 100,
  "hasMore": true,
  "cached": false,
  "downloadPath": "/tmp/azure-devops-logs/pipeline-83-run-92527"
}
```

### Example Usage

```javascript
// Get specific log content directly (recommended approach)
const logContent = await callTool('get_pipeline_log_content', {
  pipelineId: 83,
  runId: 92527,
  logId: 23,
  offset: 0,
  limit: 1000,
});

// Read from the middle of a large log
const middleContent = await callTool('get_pipeline_log_content', {
  pipelineId: 83,
  runId: 92527,
  logId: 23,
  offset: 3000,
  limit: 500,
});

// Get the end of a log
const endContent = await callTool('get_pipeline_log_content', {
  pipelineId: 83,
  runId: 92527,
  logId: 23,
  offset: 7900,
  limit: 100,
});
```

### Notes

- **Automatic caching**: Downloads logs on first access, reuses for 15 minutes
- **Smart pagination**: Handle massive logs with offset/limit parameters
- **No path management**: Automatically manages download locations
- **Efficient**: Subsequent reads from cache are instant
- **Single-step access**: No need to manually download then read

## download_pipeline_run_logs

Downloads all logs from a pipeline run to local files. Useful for bulk operations, archiving, or custom storage locations.

### Parameters

| Parameter   | Type   | Required | Description                                                       |
| ----------- | ------ | -------- | ----------------------------------------------------------------- |
| `projectId` | string | No       | The ID or name of the project (Default: from environment)         |
| `pipelineId`| number | Yes      | The ID of the pipeline                                            |
| `runId`     | number | Yes      | The ID of the run                                                 |
| `outputDir` | string | No       | Output directory for downloaded logs (defaults to current directory) |

### Response

Returns information about the downloaded files:

```json
{
  "downloadPath": "/path/to/pipeline-83-run-12345-logs",
  "files": [
    {
      "logId": 1,
      "fileName": "log-001.txt",
      "lineCount": 150,
      "size": 4096
    },
    {
      "logId": 2,
      "fileName": "log-002.txt",
      "lineCount": 200,
      "size": 8192
    }
  ],
  "totalSize": 12288
}
```

### Example Usage

```javascript
// Download all logs to current directory
const download = await callTool('download_pipeline_run_logs', {
  pipelineId: 83,
  runId: 92527,
});

// Download to specific directory
const download = await callTool('download_pipeline_run_logs', {
  projectId: 'my-project',
  pipelineId: 83,
  runId: 92527,
  outputDir: '/tmp/pipeline-logs',
});
```

### Notes

- Creates a subdirectory named `pipeline-{pipelineId}-run-{runId}-logs` in the output directory
- Each log is saved as a separate file named `log-XXX.txt` (with zero-padded IDs)
- A `summary.json` file is created with metadata about all downloaded logs
- Failed downloads are logged but don't stop the process from downloading other logs
- Uses signed URLs for authentication when available
- Best for archiving, compliance, or when you need persistent storage beyond the 15-minute cache

## read_downloaded_log

Read a previously downloaded log file from the MCP server. Supports pagination for large files.

### Parameters

| Parameter      | Type   | Required | Description                                                     |
| -------------- | ------ | -------- | --------------------------------------------------------------- |
| `downloadPath` | string | Yes      | The path returned by download_pipeline_run_logs                 |
| `fileName`     | string | Yes      | The name of the file to read (e.g., "log-001.txt" or "summary.json") |
| `offset`       | number | No       | Line number to start reading from (0-based)                     |
| `limit`        | number | No       | Maximum number of lines to return (default: 1000, max: 5000)    |

### Response

Returns the file content with metadata:

```json
{
  "fileName": "log-023.txt",
  "content": "Log content here...",
  "size": 1146865,
  "lineCount": 100,
  "offset": 0,
  "limit": 100,
  "totalLines": 7945,
  "hasMore": true
}
```

### Example Usage

```javascript
// Read a specific downloaded log
const content = await callTool('read_downloaded_log', {
  downloadPath: '/tmp/pipeline-83-run-92527-logs',
  fileName: 'log-023.txt',
  offset: 0,
  limit: 1000,
});

// Read the summary file
const summary = await callTool('read_downloaded_log', {
  downloadPath: '/tmp/pipeline-83-run-92527-logs',
  fileName: 'summary.json',
});
```

## list_downloaded_logs

List available files in a download directory.

### Parameters

| Parameter      | Type   | Required | Description                                     |
| -------------- | ------ | -------- | ----------------------------------------------- |
| `downloadPath` | string | Yes      | The path returned by download_pipeline_run_logs |

### Response

Returns a list of available files with metadata:

```json
{
  "downloadPath": "/tmp/pipeline-83-run-92527-logs",
  "files": [
    {
      "fileName": "log-001.txt",
      "size": 7192,
      "modifiedTime": "2025-08-19T11:28:35.121Z"
    },
    {
      "fileName": "log-002.txt",
      "size": 9577,
      "modifiedTime": "2025-08-19T11:28:35.311Z"
    }
  ],
  "summary": {
    "pipelineId": 83,
    "runId": 92527,
    "projectId": "CCTV",
    "downloadedAt": "2025-08-19T11:28:37.668Z",
    "logsCount": 24,
    "totalSize": 2316893
  }
}
```

### Example Usage

```javascript
// List all downloaded files
const files = await callTool('list_downloaded_logs', {
  downloadPath: '/tmp/pipeline-83-run-92527-logs',
});

// Check what's available before reading
console.log(`Found ${files.files.length} log files`);
console.log(`Total size: ${files.summary.totalSize} bytes`);
```

## Pipeline Log Tools Summary

### Quick Access (Recommended for Most Users)
- **`get_pipeline_log_content`** - Direct access to specific logs with automatic caching and pagination

### Advanced Control (Power Users)
- **`download_pipeline_run_logs`** - Bulk download all logs with custom storage locations
- **`list_downloaded_logs`** - Explore previously downloaded files
- **`read_downloaded_log`** - Read specific downloaded files with pagination

### Legacy Tools
- **`get_pipeline_run_logs`** - List log metadata or fetch content (limited by token size)
