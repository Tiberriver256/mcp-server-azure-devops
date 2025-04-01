# Azure DevOps MCP Server

A Model Context Protocol (MCP) server implementation for Azure DevOps, allowing AI assistants to interact with Azure DevOps APIs through a standardized protocol.

## Overview

This server implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) for Azure DevOps, enabling AI assistants like Claude to interact with Azure DevOps resources securely. The server acts as a bridge between AI models and Azure DevOps APIs, providing a standardized way to:

- Access and manage projects, work items, repositories, and more
- Create and update work items, branches, and pull requests
- Execute common DevOps workflows through natural language
- Safely authenticate and interact with Azure DevOps resources

## Server Structure

The server is structured around the Model Context Protocol (MCP) for communicating with AI assistants. It provides tools for interacting with Azure DevOps resources including:

- Projects
- Work Items
- Repositories
- Pull Requests
- Branches
- Pipelines

### Core Components

- **AzureDevOpsServer**: Main server class that initializes the MCP server and registers tools
- **Tool Handlers**: Modular functions for each Azure DevOps operation
- **Configuration**: Environment-based configuration for organization URL, PAT, etc.

## Getting Started

### Prerequisites

- Node.js (v16+)
- npm or yarn
- Azure DevOps account with appropriate access
- Authentication credentials (see [Authentication Guide](docs/authentication.md) for details):
  - Personal Access Token (PAT), or
  - Azure Identity credentials, or
  - Azure CLI login

### Running with NPX

### Usage with Claude Desktop/Cursor AI

To integrate with Claude Desktop or Cursor AI, add one of the following configurations to your configuration file.


#### Azure Identity Authentication

Be sure you are logged in to Azure CLI with `az login` then add the following:

```json
{
  "mcpServers": {
    "azureDevOps": {
      "command": "npx",
      "args": ["-y", "@tiberriver256/mcp-server-azure-devops"],
      "env": {
        "AZURE_DEVOPS_ORG_URL": "https://dev.azure.com/your-organization",
        "AZURE_DEVOPS_AUTH_METHOD": "azure-identity",
        "AZURE_DEVOPS_DEFAULT_PROJECT": "your-project-name"
      }
    }
  }
}
```


#### Personal Access Token (PAT) Authentication

```json
{
  "mcpServers": {
    "azureDevOps": {
      "command": "npx",
      "args": ["-y", "@tiberriver256/mcp-server-azure-devops"],
      "env": {
        "AZURE_DEVOPS_ORG_URL": "https://dev.azure.com/your-organization",
        "AZURE_DEVOPS_AUTH_METHOD": "pat",
        "AZURE_DEVOPS_PAT": "<YOUR_PAT>",
        "AZURE_DEVOPS_DEFAULT_PROJECT": "your-project-name"
      }
    }
  }
}
```

For detailed configuration instructions and more authentication options, see the [Authentication Guide](docs/authentication.md).


## Authentication Methods

This server supports multiple authentication methods for connecting to Azure DevOps APIs. For detailed setup instructions, configuration examples, and troubleshooting tips, see the [Authentication Guide](docs/authentication.md).

### Supported Authentication Methods

1. **Personal Access Token (PAT)** - Simple token-based authentication
2. **Azure Identity (DefaultAzureCredential)** - Flexible authentication using the Azure Identity SDK
3. **Azure CLI** - Authentication using your Azure CLI login

Example configuration files for each authentication method are available in the [examples directory](docs/examples/).

## Environment Variables

For a complete list of environment variables and their descriptions, see the [Authentication Guide](docs/authentication.md#configuration-reference).

Key environment variables include:

| Variable                       | Description                                                                        | Required           | Default            |
| ------------------------------ | ---------------------------------------------------------------------------------- | ------------------ | ------------------ |
| `AZURE_DEVOPS_AUTH_METHOD`     | Authentication method (`pat`, `azure-identity`, or `azure-cli`) - case-insensitive | No                 | `azure-identity`   |
| `AZURE_DEVOPS_ORG`             | Azure DevOps organization name                                                     | No                 | Extracted from URL |
| `AZURE_DEVOPS_ORG_URL`         | Full URL to your Azure DevOps organization                                         | Yes                | -                  |
| `AZURE_DEVOPS_PAT`             | Personal Access Token (for PAT auth)                                               | Only with PAT auth | -                  |
| `AZURE_DEVOPS_DEFAULT_PROJECT` | Default project if none specified                                                  | No                 | -                  |
| `AZURE_DEVOPS_API_VERSION`     | API version to use                                                                 | No                 | Latest             |
| `AZURE_AD_TENANT_ID`           | Azure AD tenant ID (for AAD auth)                                                  | Only with AAD auth | -                  |
| `AZURE_AD_CLIENT_ID`           | Azure AD application ID (for AAD auth)                                             | Only with AAD auth | -                  |
| `AZURE_AD_CLIENT_SECRET`       | Azure AD client secret (for AAD auth)                                              | Only with AAD auth | -                  |
| `LOG_LEVEL`                    | Logging level (debug, info, warn, error)                                           | No                 | info               |

## Troubleshooting Authentication

For detailed troubleshooting information for each authentication method, see the [Authentication Guide](docs/authentication.md#troubleshooting-authentication-issues).

Common issues include:

- Invalid or expired credentials
- Insufficient permissions
- Network connectivity problems
- Configuration errors

## Authentication Implementation Details

For technical details about how authentication is implemented in the Azure DevOps MCP server, see the [Authentication Guide](docs/authentication.md) and the source code in the `src/auth` directory.

## Available Tools

The Azure DevOps MCP server provides a variety of tools for interacting with Azure DevOps resources. For detailed documentation on each tool, please refer to the corresponding documentation.

### Core Navigation Tools

- `list_organizations`: List all accessible organizations
- `list_projects`: List all accessible projects
- `list_repositories`: List all repositories in a project

For comprehensive documentation on all core navigation tools, see the [Core Navigation Tools Guide](docs/tools/core-navigation.md).

### Project Tools

- `get_project`: Get details of a specific project

For project-specific tool documentation, see the [Projects Tools Guide](docs/tools/projects.md).

### Repository Tools

- `get_repository`: Get repository details

For repository-specific tool documentation, see the [Repositories Tools Guide](docs/tools/repositories.md).

### Work Item Tools

- `get_work_item`: Retrieve a work item by ID
- `create_work_item`: Create a new work item
- `update_work_item`: Update an existing work item
- `list_work_items`: List work items in a project
- `manage_work_item_link`: Add, remove, or update links between work items

### Search Tools

- `search_code`: Search for code across repositories in a project

For search-specific tool documentation, see the [Search Tools Guide](docs/tools/search.md).

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

MIT
