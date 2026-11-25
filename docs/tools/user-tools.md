# Azure DevOps User Tools

This document describes the user-related tools provided by the Azure DevOps MCP server.

> **Cloud only:** `get_me` calls the Azure DevOps Services profile endpoint (`https://app.vssps.visualstudio.com/_apis/profile/profiles/me`). Calling it against an on-premises Azure DevOps Server URL returns an `AzureDevOpsValidationError`.

## get_me

Retrieves profile details for the currently authenticated user.

### Parameters

This tool does not require any input parameters.

```json
{}
```

### Response

Returns `{ id, displayName, email }`:

```json
{
  "id": "01234567-89ab-cdef-0123-456789abcdef",
  "displayName": "John Doe",
  "email": "john.doe@example.com"
}
```

### Error Handling

- `AzureDevOpsValidationError`: When configured with an on-premises Azure DevOps Server URL
- `AzureDevOpsAuthenticationError`: When authentication fails
- `AzureDevOpsError`: For other API or network errors