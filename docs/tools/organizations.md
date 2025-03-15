# Azure DevOps Organizations Tools

This document describes the tools available for working with Azure DevOps organizations.

## list_organizations

Lists all Azure DevOps organizations accessible to the authenticated user.

### Description

The `list_organizations` tool retrieves all Azure DevOps organizations that the authenticated user has access to. This is useful for discovering which organizations are available before performing operations on specific projects or repositories.

Unlike most other tools in this server, this tool uses Axios for direct API calls rather than the Azure DevOps Node API client, as the WebApi client doesn't support the organizations endpoint.

### Parameters

This tool doesn't require any parameters.

```json
{
  // No parameters required
}
```

### Response

The tool returns an array of organization objects, each containing:

- `id`: The unique identifier of the organization
- `name`: The name of the organization
- `url`: The URL of the organization

Example response:

```json
[
  {
    "id": "org1-id",
    "name": "org1-name",
    "url": "https://dev.azure.com/org1-name"
  },
  {
    "id": "org2-id",
    "name": "org2-name",
    "url": "https://dev.azure.com/org2-name"
  }
]
```

### Error Handling

The tool may throw the following errors:

- `AzureDevOpsAuthenticationError`: If authentication fails or the user profile cannot be retrieved
- General errors: If the accounts API call fails or other unexpected errors occur

### Example Usage

```typescript
// Example MCP client call
const result = await mcpClient.callTool("list_organizations", {});
console.log(result);
```

### Implementation Details

This tool uses a two-step process to retrieve organizations:

1. First, it gets the user profile from `https://app.vssps.visualstudio.com/_apis/profile/profiles/me`
2. Then it extracts the `publicAlias` from the profile response
3. Finally, it uses the `publicAlias` to get organizations from `https://app.vssps.visualstudio.com/_apis/accounts?memberId={publicAlias}`

Authentication is handled using Basic Auth with the Personal Access Token. 