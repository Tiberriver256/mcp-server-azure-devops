# Azure DevOps Organizations Tools

This document describes the tools available for working with Azure DevOps organizations.

> **Cloud only:** `list_organizations` calls the Azure DevOps Services profile and accounts endpoints (`https://app.vssps.visualstudio.com`). Calling it against an on-premises Azure DevOps Server URL returns an `AzureDevOpsValidationError`.

## list_organizations

Lists all Azure DevOps organizations accessible to the authenticated user.

### Description

The `list_organizations` tool retrieves all Azure DevOps Services organizations accessible to the authenticated identity. It uses the shared `AzureDevOpsSession` HTTP client (`fetch`) with your configured authentication method (PAT, Azure Identity, or Azure CLI).

### Parameters

This tool does not require any parameters.

```json
{}
```

### Response

Returns an array of organization objects (`{ id, name, url }`):

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

- `AzureDevOpsValidationError`: When configured with an on-premises Azure DevOps Server URL
- `AzureDevOpsAuthenticationError`: When credentials are invalid or expired
- `AzureDevOpsError`: For other unexpected API or transport failures

### Example Usage

```typescript
const orgs = await mcpClient.callTool('list_organizations', {});
```

### Implementation Details

1. Queries `https://app.vssps.visualstudio.com/_apis/profile/profiles/me` to retrieve the caller's `publicAlias`
2. Queries `https://app.vssps.visualstudio.com/_apis/accounts?memberId={publicAlias}` to list all accessible organizations
3. Supports all configured authentication methods (`pat`, `azure-identity`, and `azure-cli`) via `ctx.getAuthHeader()`.
