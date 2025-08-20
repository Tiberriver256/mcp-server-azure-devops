# Build Tools

Tools for accessing build artifacts, code coverage, and test results from Azure DevOps builds.

## Available Tools

### list_build_artifacts

List all artifacts associated with a specific build.

**Parameters:**
- `buildId` (required): The ID of the build
- `projectId` (optional): The project ID or name (defaults to environment setting)

**Example:**
```json
{
  "buildId": 92813
}
```

**Returns:**
- Array of artifacts with id, name, source, size, and download URL
- Total count of artifacts

### get_build_artifact

Get detailed information about a specific build artifact.

**Parameters:**
- `buildId` (required): The ID of the build
- `artifactName` (required): The name of the artifact
- `projectId` (optional): The project ID or name

**Example:**
```json
{
  "buildId": 92813,
  "artifactName": "Code Coverage Report_92813"
}
```

**Returns:**
- Artifact details including id, name, source, download URL
- Size in bytes
- List of files in the artifact (if manifest is available)

### get_code_coverage

Get code coverage summary for a build.

**Parameters:**
- `buildId` (required): The ID of the build
- `projectId` (optional): The project ID or name
- `flags` (optional): Coverage data flags

**Example:**
```json
{
  "buildId": 92813
}
```

**Returns:**
- Coverage data with build flavor and platform
- Coverage statistics including:
  - Lines covered/total
  - Branches covered/total
  - Coverage percentages

### get_code_coverage_details

Get detailed code coverage data including module and function-level coverage.

**Parameters:**
- `buildId` (required): The ID of the build
- `projectId` (optional): The project ID or name
- `flags` (optional): Coverage data flags
- `top` (optional): Number of results to return
- `continuationToken` (optional): Token for pagination

**Example:**
```json
{
  "buildId": 92813,
  "top": 100
}
```

**Returns:**
- Module-level coverage with statistics
- Function-level coverage within each module
- Continuation token for pagination

### get_test_results

Get test results for a build with filtering options.

**Parameters:**
- `buildId` (required): The ID of the build
- `projectId` (optional): The project ID or name
- `publishContext` (optional): Publish context GUID
- `top` (optional): Maximum number of results to return
- `skip` (optional): Number of results to skip
- `outcomes` (optional): Array of outcome filters (e.g., ["passed", "failed"])

**Example:**
```json
{
  "buildId": 92813,
  "outcomes": ["failed"],
  "top": 50
}
```

**Returns:**
- Array of test results with:
  - Test case title and automated test name
  - Outcome (passed, failed, etc.)
  - Duration, start and completion times
  - Error messages and stack traces for failures
- Total count of results

### get_test_run_stats

Get test run statistics and summary for a build.

**Parameters:**
- `buildId` (required): The ID of the build
- `projectId` (optional): The project ID or name

**Example:**
```json
{
  "buildId": 92813
}
```

**Returns:**
- Array of test runs with statistics
- Summary including:
  - Total number of runs
  - Total tests across all runs
  - Passed/failed test counts
  - Overall pass rate percentage

## Usage Examples

### Get Build Quality Metrics
```json
// Get code coverage
{
  "tool": "get_code_coverage",
  "buildId": 92813
}

// Get test results summary
{
  "tool": "get_test_run_stats",
  "buildId": 92813
}
```

### Investigate Failed Tests
```json
// Get only failed test results
{
  "tool": "get_test_results",
  "buildId": 92813,
  "outcomes": ["failed"],
  "top": 100
}
```

### List Build Outputs
```json
// List all artifacts
{
  "tool": "list_build_artifacts",
  "buildId": 92813
}

// Get specific artifact details
{
  "tool": "get_build_artifact",
  "buildId": 92813,
  "artifactName": "version"
}
```