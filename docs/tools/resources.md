# Azure DevOps Resource URIs

In addition to tools, the Azure DevOps MCP server provides access to resources via standardized URI patterns. Resources allow AI assistants to directly reference and retrieve content from Azure DevOps repositories using simple, predictable URLs.

## Repository Content Resources

The server supports accessing files and directories from Git repositories using the following resource URI patterns.

### Available Resource URI Templates

| Resource Type | URI Template | Description |
| ------------- | ------------ | ----------- |
| Default Branch Content | `ado://{organization}/{project}/{repo}/contents{/path*}` | Access file or directory content from the default branch |
| Branch-Specific Content | `ado://{organization}/{project}/{repo}/branches/{branch}/contents{/path*}` | Access content from a specific branch |
| Commit-Specific Content | `ado://{organization}/{project}/{repo}/commits/{commit}/contents{/path*}` | Access content from a specific commit |
| Tag-Specific Content | `ado://{organization}/{project}/{repo}/tags/{tag}/contents{/path*}` | Access content from a specific tag |
| Pull Request Content | `ado://{organization}/{project}/{repo}/pullrequests/{prId}/contents{/path*}` | Access content from a pull request |

### URI Components

- `{organization}`: Your Azure DevOps organization name
- `{project}`: The project name or ID
- `{repo}`: The repository name or ID
- `{path*}`: The path to the file or directory within the repository (optional)
- `{branch}`: The name of a branch
- `{commit}`: The SHA-1 hash of a commit
- `{tag}`: The name of a tag
- `{prId}`: The ID of a pull request

## Examples

### Accessing Files from the Default Branch

To access the content of a file in the default branch:

```
ado://myorg/MyProject/MyRepo/contents/src/index.ts
```

This retrieves the content of `index.ts` from the `src` directory in the default branch.

### Accessing Directory Content

To list the contents of a directory:

```
ado://myorg/MyProject/MyRepo/contents/src
```

This returns a JSON array containing information about all items in the `src` directory.

### Accessing Content from a Specific Branch

To access content from a feature branch:

```
ado://myorg/MyProject/MyRepo/branches/feature/new-ui/contents/src/index.ts
```

This retrieves the content of `index.ts` from the `feature/new-ui` branch.

### Accessing Content from a Specific Commit

To access content at a specific commit:

```
ado://myorg/MyProject/MyRepo/commits/a1b2c3d4e5f6g7h8i9j0/contents/src/index.ts
```

This retrieves the version of `index.ts` at the specified commit.

### Accessing Content from a Tag

To access content from a tagged release:

```
ado://myorg/MyProject/MyRepo/tags/v1.0.0/contents/README.md
```

This retrieves the README.md file from the v1.0.0 tag.

### Accessing Content from a Pull Request

To access content from a pull request:

```
ado://myorg/MyProject/MyRepo/pullrequests/42/contents/src/index.ts
```

This retrieves the version of `index.ts` from pull request #42.

## Implementation Details

When a resource URI is requested, the server:

1. Parses the URI to extract the components (organization, project, repository, path, etc.)
2. Establishes a connection to Azure DevOps using the configured authentication method
3. Determines if a specific version (branch, commit, tag) is requested
4. Uses the `getFileContent` functionality to retrieve the content
5. Returns the content with the appropriate MIME type

## Response Format

Responses are returned with the appropriate MIME type based on the file extension. For example:

- `.ts`, `.tsx` files: `application/typescript`
- `.js` files: `application/javascript`
- `.json` files: `application/json`
- `.md` files: `text/markdown`
- `.txt` files: `text/plain`
- `.html`, `.htm` files: `text/html`
- Image files (`.png`, `.jpg`, `.gif`, etc.): appropriate image MIME types

For directories, the content is returned as a JSON array with MIME type `application/json`.

## Error Handling

The resource handler may throw the following errors:

- `AzureDevOpsResourceNotFoundError`: If the specified resource cannot be found (project, repository, path, or version)
- `AzureDevOpsAuthenticationError`: If authentication fails
- `AzureDevOpsValidationError`: If the URI format is invalid
- Other errors: For unexpected issues

## Related Tools

While resource URIs provide direct access to repository content, you can also use the following tools for more advanced operations:

- `get_file_content`: Get content of a file or directory with more options and metadata
- `get_repository`: Get details about a specific repository
- `get_repository_details`: Get comprehensive repository information including statistics and refs
- `list_repositories`: List all repositories in a project
- `search_code`: Search for code in repositories 