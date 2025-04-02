# Issue #105: Implement publish_artifact Azure DevOps-specific Feature

## Feature Overview

The `publish_artifact` feature will enable users to publish build artifacts to Azure DevOps through the MCP Server. This feature specifically targets Azure DevOps's artifact publishing capabilities and leverages their REST API for implementation.

## Background

In Azure DevOps CI/CD pipelines, artifacts represent the files produced by a build or release process. These could be compiled binaries, packages, test results, or any other files that need to be persisted, shared between pipeline stages, or downloaded later.

## Types of Artifacts in Azure DevOps

Azure DevOps supports two primary types of artifacts:

1. **Pipeline Artifacts**:
   - Modern, optimized artifact type recommended for Azure DevOps Services
   - Faster performance compared to build artifacts
   - Not supported in release pipelines (only in build pipelines)
   - Stored in Azure Artifacts and not counted toward storage billing
   - Cannot be published to file shares, only to Azure Artifacts
   - Uses the `PublishPipelineArtifact@1` task in YAML pipelines

2. **Build Artifacts**:
   - Legacy artifact type that's still fully supported
   - Can be used in both build and release pipelines
   - Can be published to a file share or to Azure Artifacts
   - Uses the `PublishBuildArtifacts@1` task in YAML pipelines

## API Details

### Build Artifacts API Endpoint

```
POST https://dev.azure.com/{organization}/{project}/_apis/build/builds/{buildId}/artifacts?api-version=7.1
```

### Required Parameters

- **organization**: The name of the Azure DevOps organization
- **project**: Project ID or project name
- **buildId**: The ID of the build
- **api-version**: Version of the API (should be '7.1')

### Request Body

```json
{
  "name": "string",           // The name of the artifact (required)
  "source": "string",         // The source job that produced this artifact
  "resource": {               // The actual resource details (required)
    "type": "string",         // Type of resource: "filepath", "container", etc.
    "data": "string",         // Path to the artifact content or other type-specific data
    "url": "string",          // The full http link to the resource
    "downloadUrl": "string",  // A link to download the resource
    "properties": {}          // Type-specific properties of the artifact
  }
}
```

### Response (200 OK)

```json
{
  "id": 1,                   // The artifact ID
  "name": "MyArtifact",      // The name of the artifact
  "source": "Job1",          // The artifact source
  "resource": {
    "type": "Container",     // The resource type
    "data": "...",           // Type-specific data
    "url": "https://...",    // The full http link
    "downloadUrl": "https://...", // Download link
    "properties": {}         // Properties
  }
}
```

### Authentication

- OAuth2 flow with the scope: `vso.build_execute`
- PAT (Personal Access Token) can also be used for authentication
- Basic authentication may be used depending on Azure DevOps server configuration

## Implementation Requirements

### Handler Parameters

The `publish_artifact` handler should accept the following parameters:

1. **artifact_name** (string, required): Name to identify the artifact
2. **path** (string, required): Path to the files to publish
3. **build_id** (integer, required): ID of the build to associate the artifact with
4. **artifact_type** (string, optional): "pipeline" (default) or "build"
5. **organization** (string, required): Azure DevOps organization name
6. **project** (string, required): Project name or ID
7. **description** (string, optional): Description of the artifact
8. **publish_location** (string, optional): For build artifacts, can be "azure" or "filepath"
9. **auth_token** (string, required): PAT or OAuth token for authentication

### Handler Behavior

1. Validate all required parameters
2. Package the files from the specified path
3. Construct the appropriate API request based on artifact_type
4. Upload the artifact to Azure DevOps
5. Return a response with artifact details, including the URL to access it

### Error Handling

The handler should properly handle and return meaningful errors for:
- Missing required parameters
- Invalid path or files not found
- Unauthorized access or insufficient permissions
- Build ID not found
- Network or API errors
- Rate limiting issues

## Implementation Strategy

1. Create a new handler file: `handlers/azure_devops/publish_artifact.py`
2. Implement parameter validation and error handling
3. Implement file packaging using appropriate compression methods
4. Create API client specific to Azure DevOps artifacts functionality
5. Implement the API call to publish artifacts
6. Return a structured response with success/error details

## Security Considerations

1. **Authentication**: Securely handle authentication tokens
2. **File Path Validation**: Validate file paths to prevent path traversal attacks
3. **Access Control**: Ensure the handler respects Azure DevOps permissions
4. **Sensitive Data**: Avoid logging sensitive information like tokens or credentials

## Testing Strategy

1. **Unit Tests**:
   - Test parameter validation
   - Test request formatting
   - Test error handling

2. **Integration Tests**:
   - Test with mock Azure DevOps API
   - Test different artifact types and configurations

3. **End-to-End Tests**:
   - Test against actual Azure DevOps instances
   - Test with various file types and sizes

## Example Usage

```python
# Example client code for using the handler
response = mcp_client.azure_devops.publish_artifact(
    artifact_name="build-outputs",
    path="./dist",
    build_id=1234,
    artifact_type="pipeline",
    organization="my-org",
    project="my-project",
    auth_token="TOKEN"
)

# Example response
{
    "success": true,
    "artifact": {
        "id": 789,
        "name": "build-outputs",
        "url": "https://dev.azure.com/my-org/my-project/_artifacts/feed/my-artifacts/build-outputs",
        "download_url": "https://dev.azure.com/my-org/my-project/_apis/build/builds/1234/artifacts?artifactName=build-outputs&api-version=7.1"
    }
}
```

## Related Documentation

- [Azure DevOps REST API - Artifacts](https://learn.microsoft.com/en-us/rest/api/azure/devops/build/artifacts?view=azure-devops-rest-7.1)
- [Pipeline Artifacts in Azure DevOps](https://learn.microsoft.com/en-us/azure/devops/pipelines/artifacts/pipeline-artifacts?view=azure-devops)
- [Build Artifacts in Azure DevOps](https://learn.microsoft.com/en-us/azure/devops/pipelines/artifacts/build-artifacts?view=azure-devops)

## Implementation Timeline

- Estimated development time: 3-5 days
- Includes implementation, testing, and documentation 