# Implement publish_artifact Azure DevOps-specific feature

## Overview

This issue addresses the implementation of a new `publish_artifact` handler specifically for Azure DevOps. The feature will allow users to publish build artifacts to Azure DevOps through the MCP Server.

## Background

In Azure DevOps CI/CD pipelines, artifacts represent the files produced by a build or release process. These could be compiled binaries, packages, test results, or any other files that need to be persisted, shared between pipeline stages, or downloaded later.

## Requirements

### Functionality

The handler should:
- Allow users to publish artifacts to Azure DevOps builds
- Support both Pipeline Artifacts and Build Artifacts types
- Accept file paths or directory paths to publish
- Return artifact details, including URLs to access the published artifacts

### API Details

The implementation will use the Azure DevOps REST API:
- Primary endpoint: `POST https://dev.azure.com/{organization}/{project}/_apis/build/builds/{buildId}/artifacts?api-version=7.1`
- Authentication: OAuth2 or PAT with `vso.build_execute` scope

### Parameters

The handler must accept:
1. **artifact_name** (string, required): Name to identify the artifact
2. **path** (string, required): Path to the files to publish
3. **build_id** (integer, required): ID of the build to associate the artifact with
4. **artifact_type** (string, optional): "pipeline" (default) or "build"
5. **organization** (string, required): Azure DevOps organization name
6. **project** (string, required): Project name or ID
7. **description** (string, optional): Description of the artifact
8. **publish_location** (string, optional): For build artifacts, can be "azure" or "filepath"
9. **auth_token** (string, required): PAT or OAuth token for authentication

### Response Format

Success response should be structured as:
```json
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

## Implementation Notes

### Project Structure
- Create a new handler file: `handlers/azure_devops/publish_artifact.py`
- Tests should be in `tests/handlers/azure_devops/test_publish_artifact.py`

### Error Handling
The handler should handle:
- Missing required parameters
- Invalid paths or files not found
- Unauthorized access or insufficient permissions
- Build ID not found
- Network or API errors

### Security Considerations
- Securely handle authentication tokens
- Validate file paths to prevent path traversal attacks
- Ensure proper access control
- Avoid logging sensitive information

## Example Usage

```python
response = mcp_client.azure_devops.publish_artifact(
    artifact_name="build-outputs",
    path="./dist",
    build_id=1234,
    artifact_type="pipeline",
    organization="my-org",
    project="my-project",
    auth_token="TOKEN"
)
```

## Resources and References

- [Azure DevOps REST API - Artifacts](https://learn.microsoft.com/en-us/rest/api/azure/devops/build/artifacts?view=azure-devops-rest-7.1)
- [Pipeline Artifacts in Azure DevOps](https://learn.microsoft.com/en-us/azure/devops/pipelines/artifacts/pipeline-artifacts?view=azure-devops)
- [Build Artifacts in Azure DevOps](https://learn.microsoft.com/en-us/azure/devops/pipelines/artifacts/build-artifacts?view=azure-devops)

## Acceptance Criteria

- [ ] Implement the `publish_artifact` handler with specified parameters
- [ ] Create comprehensive unit tests
- [ ] Create integration tests with mocked responses
- [ ] Ensure proper error handling and validation
- [ ] Document the handler and usage examples
- [ ] Secure handling of authentication and sensitive data 