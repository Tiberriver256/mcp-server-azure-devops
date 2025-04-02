# Implement create_test_plan Azure DevOps-specific feature

## Overview
Implement a new handler for creating test plans in Azure DevOps projects. This feature will enable users to programmatically create test plans through the MCP Server, which is essential for automated testing workflows and CI/CD pipeline integration.

## Background
Test Plans in Azure DevOps are containers for organizing test cases and tracking testing activities across project iterations. They provide a structured approach to test management, enabling teams to plan, track, and report on their testing efforts. Programmatic creation of test plans allows for automation of testing workflows and integration with development processes.

## Requirements

### Functionality
The `create_test_plan` handler should:
1. Accept parameters for creating a test plan in Azure DevOps
2. Validate input parameters
3. Authenticate with Azure DevOps using a provided access token
4. Construct and send an API request to create the test plan
5. Process the response and return the created test plan details

### API Details
The handler will use the Azure DevOps REST API endpoint:
```
POST https://dev.azure.com/{organization}/{project}/_apis/test/plans?api-version=5.0
```

### Parameters
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

### Response Format
The handler should return a JSON object containing:
1. The ID of the created test plan
2. The name of the test plan
3. The URL to access the test plan in Azure DevOps
4. Other relevant metadata from the Azure DevOps API response

### Implementation Notes
1. **Authentication**: Use the provided access token in the Authorization header with the Bearer scheme
2. **Parameter Validation**: 
   - Ensure required parameters are present
   - Validate date formats for start_date and end_date
   - Check string lengths for name and description
3. **Request Construction**:
   - Format the area_path and iteration_path correctly in the request body
   - Convert snake_case parameter names to camelCase as needed for the API
4. **Error Handling**:
   - Handle missing required parameters
   - Handle authentication failures
   - Handle API request errors and rate limiting
   - Provide meaningful error messages

### Error Handling
The handler should handle and return appropriate errors for:
1. Missing required parameters (400 Bad Request)
2. Invalid parameter formats (400 Bad Request)
3. Authentication failures (401 Unauthorized)
4. API request failures (various status codes)
5. Rate limiting issues (429 Too Many Requests)

## Security Considerations
1. **Token Handling**: Ensure that access tokens are never logged or exposed
2. **Input Validation**: Validate all inputs to prevent injection attacks
3. **Error Messages**: Ensure error messages don't expose sensitive information

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

## Resources
- [Azure DevOps Test Plans REST API](https://learn.microsoft.com/en-us/rest/api/azure/devops/test/test-plans?view=azure-devops-rest-5.0)
- [Azure DevOps Authentication Documentation](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate)

## Acceptance Criteria
1. The handler successfully creates a test plan in Azure DevOps when provided with valid parameters
2. Required parameters are properly validated
3. Optional parameters are correctly handled when provided
4. The handler returns appropriate error messages for invalid inputs
5. The response format includes the test plan ID, name, URL, and other relevant details
6. Authentication is handled securely
7. Code follows project coding standards and includes appropriate documentation
8. Unit tests cover the handler functionality
9. Integration tests verify the handler works correctly with the Azure DevOps API 