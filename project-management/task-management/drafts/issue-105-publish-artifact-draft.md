# Issue #105: Implement publish_artifact Azure DevOps-specific Feature - DRAFT

## Feature Overview

The `publish_artifact` feature enables publishing build artifacts to Azure DevOps. This is specific to Azure DevOps and needs to follow its artifact publishing conventions and REST API.

## Key Research Findings

### Types of Artifacts in Azure DevOps

Azure DevOps supports two primary types of artifacts:

1. **Pipeline Artifacts**: Recommended for Azure DevOps Services for faster performance. These are the newer, preferred type.
   - Not supported in release pipelines
   - Stored in Azure Artifacts
   - Not billed for storage

2. **Build Artifacts**: Legacy approach, but still supported
   - Can be used in release pipelines
   - Can be published to a file share

### API Endpoint for Publishing Artifacts

The primary REST API endpoint for publishing build artifacts is:

```
POST https://dev.azure.com/{organization}/{project}/_apis/build/builds/{buildId}/artifacts?api-version=7.1
```

### Required Parameters

- **organization**: The name of the Azure DevOps organization
- **project**: Project ID or project name
- **buildId**: The ID of the build
- **api-version**: Version of the API (should be '7.1')

### Request Body Structure

```json
{
  "name": "string",           // The name of the artifact
  "source": "string",         // The source job that produced this artifact
  "resource": {
    "type": "string",         // Type of resource: File container, version control folder, UNC path, etc.
    "data": "string",         // Type-specific data about the artifact
    "url": "string",          // The full http link to the resource
    "downloadUrl": "string",  // A link to download the resource
    "properties": {}          // Type-specific properties of the artifact
  }
}
```

### Response

A successful operation returns a 200 OK status with a `BuildArtifact` object containing information about the published artifact.

## Implementation Requirements

1. The `publish_artifact` handler must support:
   - Specifying the artifact name
   - Specifying the path to the files to publish
   - Publishing to both pipeline artifacts and build artifacts (with pipeline artifacts as default)
   - Specifying the target build ID

2. Authentication:
   - Must use OAuth2 with the appropriate scope: `vso.build_execute`
   - Should handle PAT (Personal Access Token) authentication

3. Error Handling:
   - Proper error response if build ID doesn't exist
   - Handling of permissions issues
   - Handling file path validation

## Implementation Strategy

1. Create a new `handlers/azure_devops/publish_artifact.py` file
2. Implement the handler with the following parameters:
   - `artifact_name`: Name of the artifact to publish
   - `path`: Path to the files to publish
   - `build_id`: ID of the build to associate the artifact with
   - `artifact_type`: "pipeline" (default) or "build"
   - `organization`: Azure DevOps organization name
   - `project`: Project name or ID

3. Use the Azure DevOps REST API to publish the artifact
4. Return appropriate success/error messages and status codes

## Security Considerations

- The feature requires build execution permissions
- Access tokens should be securely handled and not logged
- File paths should be validated to prevent path traversal attacks

## Testing Approach

1. Unit tests to validate request formatting and parameter validation
2. Integration tests with mock Azure DevOps API
3. End-to-end tests against actual Azure DevOps instance (if available in CI/CD)

## Future Enhancements

- Support for specifying artifact properties
- Support for .artifactignore files to exclude specific files
- Integration with release pipelines (for build artifacts) 