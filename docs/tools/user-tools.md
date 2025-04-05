# Azure DevOps User Tools

This document describes the user-related tools provided by the Azure DevOps MCP server.

## get_me

The `get_me` tool retrieves information about the currently authenticated user.

### Input

This tool doesn't require any input parameters.

```json
{}
```

### Output

The tool returns the user's profile information including:
- `id`: The unique identifier for the user
- `displayName`: The user's display name
- `email`: The user's email address

#### Example Response

```json
{
  "id": "01234567-89ab-cdef-0123-456789abcdef",
  "displayName": "John Doe",
  "email": "john.doe@example.com"
}
```

### Error Handling

The tool may return the following errors:

- `AzureDevOpsAuthenticationError`: If authentication fails
- `AzureDevOpsError`: For general errors when retrieving user information 