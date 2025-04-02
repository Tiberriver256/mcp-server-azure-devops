# Azure DevOps Test Plans - create_test_plan Feature Implementation

## Feature Overview
The `create_test_plan` feature will allow users to create test plans in Azure DevOps through the MCP Server. This feature enables teams to establish testing structures for their projects, organize test cases, and manage testing activities directly from their automation workflows.

## Background
Test Plans in Azure DevOps provide a comprehensive solution for managing test activities within a project lifecycle. They serve as containers for test suites and test cases, allowing teams to plan and track testing progress. Test plans are particularly useful in structured testing methodologies and enable teams to:

1. Organize test cases in a hierarchical structure
2. Track test execution progress
3. Manage test configurations
4. Associate tests with specific iterations and releases
5. Generate test execution reports and metrics

## API Details

### Endpoint
```
POST https://dev.azure.com/{organization}/{project}/_apis/test/plans?api-version=5.0
```

### Required Headers
- `Content-Type: application/json`
- `Authorization: Bearer {PAT or OAuth token}`

### Request Body Structure
The request body is a JSON object containing test plan details:

```json
{
  "name": "Test Plan Name",
  "area": {
    "name": "ProjectName\\AreaPath"
  },
  "iteration": "ProjectName\\IterationPath",
  "description": "Description of the test plan",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "state": "Active",
  "owner": {
    "id": "ownerId"
  }
}
```

### Response Format
A successful operation returns a `200 OK` response with a `TestPlan` object:

```json
{
  "id": 123,
  "name": "Test Plan Name",
  "url": "https://dev.azure.com/organization/project/_apis/test/Plans/123",
  "project": {
    "id": "project-guid",
    "name": "ProjectName",
    "url": "https://dev.azure.com/organization/_apis/projects/ProjectName"
  },
  "area": {
    "id": "area-id",
    "name": "ProjectName\\AreaPath"
  },
  "description": "Description of the test plan",
  "startDate": "YYYY-MM-DDT00:00:00Z",
  "endDate": "YYYY-MM-DDT00:00:00Z",
  "iteration": "ProjectName\\IterationPath",
  "state": "Active",
  "revision": 1,
  "owner": {
    "id": "owner-guid",
    "displayName": "Owner Name",
    "uniqueName": "owner@email.com",
    "url": "https://dev.azure.com/organization/_apis/Identities/owner-guid",
    "imageUrl": "https://dev.azure.com/organization/_api/_common/identityImage?id=owner-guid"
  },
  "rootSuite": {
    "id": "suite-id",
    "name": "Test Plan Name",
    "url": "https://dev.azure.com/organization/project/_apis/test/Plans/123/Suites/suite-id"
  }
}
```

## Authentication
Azure DevOps API supports two primary authentication methods:
1. **Personal Access Tokens (PAT)**: Generated in the user's Azure DevOps settings
2. **OAuth 2.0**: For applications requiring delegated user access

For the MCP Server implementation, PAT is recommended for simplicity and security. The token requires the `vso.test_write` scope, which grants the ability to read, create, and update test plans and related artifacts.

## Implementation Requirements

### Handler Parameters
The `create_test_plan` handler should accept the following parameters:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| organization | string | Yes | Azure DevOps organization name |
| project | string | Yes | Project ID or name where the test plan will be created |
| name | string | Yes | Name of the test plan |
| description | string | No | Description of the test plan |
| area_path | string | No | Area path for the test plan |
| iteration_path | string | No | Iteration path for the test plan |
| start_date | string | No | Start date in ISO format (YYYY-MM-DD) |
| end_date | string | No | End date in ISO format (YYYY-MM-DD) |
| state | string | No | State of the test plan (e.g., "Active", "Inactive") |
| owner_id | string | No | ID of the test plan owner |
| access_token | string | Yes | Azure DevOps PAT with appropriate permissions |

### Handler Behavior
The handler should:

1. Validate all required parameters
2. Format optional parameters correctly when provided
3. Construct the API request with proper authentication
4. Send the request to the Azure DevOps API
5. Process the response and return appropriate results
6. Handle errors and provide meaningful error messages

### Error Handling
The handler should handle the following error scenarios:

1. Missing required parameters
2. Invalid parameter formats (e.g., invalid date format)
3. Authentication failures
4. API request failures
5. Rate limiting issues
6. Network connectivity problems

## Implementation Strategy

### Step 1: Create the Handler File
Create a new file for the handler in the appropriate location within the project structure.

### Step 2: Parameter Validation
Implement validation for all parameters, ensuring:
- Required parameters are present
- Dates are in valid ISO format
- Strings have appropriate lengths and formats

### Step 3: Request Construction
Construct the API request with:
- Properly formatted URL with organization and project
- Required headers including authentication
- JSON request body with all provided parameters

### Step 4: API Interaction
Implement the API call using appropriate HTTP client libraries, handling:
- Request timeouts
- Response parsing
- Error detection and handling

### Step 5: Response Processing
Process the API response to:
- Extract relevant information
- Format the response consistently with other MCP handlers
- Include necessary metadata

## Security Considerations
1. **Token Handling**: Never log or expose access tokens
2. **Input Validation**: Validate all inputs to prevent injection attacks
3. **Error Messages**: Ensure error messages don't expose sensitive information
4. **Access Control**: Implement appropriate access controls for the handler

## Example Usage
```javascript
// Example client code using the handler
const result = await client.handlers.create_test_plan({
  organization: "my-organization",
  project: "my-project",
  name: "Sprint 27 Testing",
  description: "Testing for Sprint 27 features",
  area_path: "my-project\\Quality",
  iteration_path: "my-project\\Sprint 27",
  start_date: "2023-07-01",
  end_date: "2023-07-15",
  access_token: "PAT_TOKEN"
});

console.log(`Created test plan with ID: ${result.id}`);
```

## Related Documentation
- [Azure DevOps Test Plans REST API](https://learn.microsoft.com/en-us/rest/api/azure/devops/test/test-plans)
- [Azure DevOps Authentication](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate)
- [Test Plan Management Best Practices](https://learn.microsoft.com/en-us/azure/devops/test/new-test-plans-page)

## Implementation Timeline
Estimated development time: 2-3 days, including:
- Initial implementation: 1 day
- Testing and validation: 1 day
- Documentation and code review: 0.5-1 day 