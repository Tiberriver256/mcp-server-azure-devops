# Azure DevOps MCP Server

A Model Context Protocol (MCP) server implementation for Azure DevOps, allowing AI assistants to interact with Azure DevOps APIs through a standardized protocol.

> **Looking for the official server?** Microsoft maintains a product-supported Azure DevOps MCP at [microsoft/azure-devops-mcp](https://github.com/microsoft/azure-devops-mcp). If you use Azure DevOps Services (cloud), start there.
>
> This community server remains a good fit when you need **Azure DevOps Server (on-premises)** support — especially older versions that may not work with Microsoft's MCP — or features not yet available in the official server. See [Discussion #237](https://github.com/Tiberriver256/mcp-server-azure-devops/discussions/237) for more context.

## Overview

This server implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) for Azure DevOps, enabling AI assistants like Claude to interact with Azure DevOps resources securely. The server acts as a bridge between AI models and Azure DevOps APIs, providing a standardized way to:

- Access and manage projects, work items, repositories, and more
- Create and update work items, branches, and pull requests
- Execute common DevOps workflows through natural language
- Access repository content via standardized resource URIs
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
- **Feature Modules**: Organized by feature area (work-items, projects, repositories, etc.)
- **Request Handlers**: Each feature module provides request identification and handling functions
- **Tool Handlers**: Modular functions for each Azure DevOps operation
- **Configuration**: Environment-based configuration for organization URL, PAT, etc.

The server uses a feature-based architecture where each feature area (like work-items, projects, repositories) is encapsulated in its own module. This makes the codebase more maintainable and easier to extend with new features.

## Getting Started

### Prerequisites

- Node.js (v16+)
- npm or yarn
- Azure DevOps account with appropriate access
- Authentication credentials (see [Authentication Guide](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/authentication.md) for details):
  - Personal Access Token (PAT), or
  - Azure Identity credentials, or
  - Azure CLI login

### Running from npm (npx)

If you just want to run the **published** server package, you **do not** need to clone or build this repository:

```bash
npx -y @tiberriver256/mcp-server-azure-devops
```

### Running locally (from source)

From a checkout of this repository:

```bash
npm ci
cp .env.example .env   # then edit values
npm run build
npm start              # runs: node dist/index.js
```

### Transport modes

This server supports two transports:

- `stdio` for local, process-spawned MCP clients
- `http` for explicit, opt-in Streamable HTTP usage

`stdio` remains the default. If you do not pass any HTTP-related configuration, the server behaves exactly as before.

#### Default stdio mode

```bash
npm start
```

Equivalent explicit form:

```bash
npm start -- --transport stdio
```

#### Optional HTTP mode

HTTP mode is disabled unless you explicitly select it with a CLI flag or environment variable.

CLI flags:

```bash
npm start -- --transport http --host 127.0.0.1 --port 3000
```

Environment variables:

```bash
MCP_TRANSPORT=http MCP_HOST=127.0.0.1 MCP_PORT=3000 npm start
```

HTTP mode exposes a native MCP Streamable HTTP endpoint at `/mcp`.

This implementation is intentionally conservative:

- stdio remains the default and recommended mode for local integrations
- HTTP mode is stateless and POST-only in this first pass
- remote exposure should usually be protected externally by a reverse proxy, firewall, private network boundary, or similar control plane
- this repository does not add a custom HTTP auth layer in front of the MCP endpoint

For iterative development (auto-reload):

```bash
npm run dev            # runs src/index.ts via ts-node-dev
```

For iterative development in HTTP mode:

```bash
npm run dev -- --transport http --host 127.0.0.1 --port 3000
```

### HTTP deployment caution

Running the server over HTTP changes the trust boundary compared to stdio.

Use HTTP mode only when you intentionally need a network endpoint, and prefer putting it behind:

- a reverse proxy that terminates TLS
- network-level access controls
- an internal-only or loopback binding where possible

Binding directly to `0.0.0.0` is convenient for containers and local testing, but it should not be treated as a production-hardening strategy by itself.

### Docker

This repository now ships a hardened Dockerfile for HTTP mode and can be built locally:

```bash
docker build -t mcp-server-azure-devops:http .
```

The runtime image is based on a distroless Node.js image to reduce the final attack surface compared to a general-purpose Node runtime image.

Run the locally built image:

```bash
docker run --rm -p 3000:3000 \
  -e AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization \
  -e AZURE_DEVOPS_AUTH_METHOD=pat \
  -e AZURE_DEVOPS_PAT=your-personal-access-token \
  mcp-server-azure-devops:http
```

The container defaults to HTTP mode with these runtime settings:

- `MCP_TRANSPORT=http`
- `MCP_HOST=0.0.0.0`
- `MCP_PORT=3000`

The HTTP endpoint is exposed at `/mcp`.

For local orchestration with Docker Compose:

```bash
docker compose up --build
```

The compose file reads Azure DevOps settings from your shell environment or a local `.env` file.

GitHub Actions also publishes the image to GHCR for this repository:

```bash
docker pull ghcr.io/estebanjosse/mcp-server-azure-devops:latest
```

Example with the published image:

```bash
docker run --rm -p 3000:3000 \
  -e AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization \
  -e AZURE_DEVOPS_AUTH_METHOD=pat \
  -e AZURE_DEVOPS_PAT=your-personal-access-token \
  ghcr.io/estebanjosse/mcp-server-azure-devops:latest
```

Published tags include `latest` on `main`, the commit SHA, and the semantic version extracted from release tags such as `mcp-server-azure-devops-v0.1.45`.

The repository also includes a dedicated validation workflow for pull requests that builds the container image without publishing it, so Docker regressions are caught before merge.

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

Azure DevOps Server (on-prem) requires PAT authentication. Example:

```json
{
  "mcpServers": {
    "azureDevOps": {
      "command": "npx",
      "args": ["-y", "@tiberriver256/mcp-server-azure-devops"],
      "env": {
        "AZURE_DEVOPS_ORG_URL": "https://server:8080/tfs/DefaultCollection",
        "AZURE_DEVOPS_AUTH_METHOD": "pat",
        "AZURE_DEVOPS_PAT": "<YOUR_PAT>",
        "AZURE_DEVOPS_DEFAULT_PROJECT": "your-project-name"
      }
    }
  }
}
```

For detailed configuration instructions and more authentication options, see the [Authentication Guide](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/authentication.md).

## Authentication Methods

This server supports multiple authentication methods for connecting to Azure DevOps APIs. For detailed setup instructions, configuration examples, and troubleshooting tips, see the [Authentication Guide](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/authentication.md).

### Supported Authentication Methods

1. **Personal Access Token (PAT)** - Simple token-based authentication
2. **Azure Identity (DefaultAzureCredential)** - Flexible authentication using the Azure Identity SDK
3. **Azure CLI** - Authentication using your Azure CLI login

Example configuration files for each authentication method are available in the [examples directory](https://github.com/tiberriver256/mcp-server-azure-devops/tree/main/docs/examples).

Azure DevOps Server (on-prem) supports PAT authentication only. Azure Identity and Azure CLI are supported for Azure DevOps Services.

## Environment Variables

For a complete list of environment variables and their descriptions, see the [Authentication Guide](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/authentication.md#configuration-reference).

Key environment variables include:

| Variable                       | Description                                                                        | Required                     | Default          |
| ------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------- | ---------------- |
| `AZURE_DEVOPS_AUTH_METHOD`     | Authentication method (`pat`, `azure-identity`, or `azure-cli`) - case-insensitive | No                           | `azure-identity` |
| `AZURE_DEVOPS_ORG_URL`         | Full URL to your Azure DevOps organization or Server collection (e.g., `https://server:8080/tfs/DefaultCollection`) | Yes                          | -                |
| `AZURE_DEVOPS_PAT`             | Personal Access Token (for PAT auth)                                               | Only with PAT auth           | -                |
| `AZURE_DEVOPS_DEFAULT_PROJECT` | Default project if none specified                                                  | No                           | -                |
| `AZURE_DEVOPS_API_VERSION`     | API version to use                                                                 | No                           | Latest           |
| `AZURE_TENANT_ID`              | Azure AD tenant ID (for service principals)                                        | Only with service principals | -                |
| `AZURE_CLIENT_ID`              | Azure AD application ID (for service principals)                                   | Only with service principals | -                |
| `AZURE_CLIENT_SECRET`          | Azure AD client secret (for service principals)                                    | Only with service principals | -                |
| `MCP_TRANSPORT`                | MCP transport selection (`stdio` or `http`)                                        | No                           | `stdio`          |
| `MCP_HOST`                     | Host interface for HTTP mode                                                       | Only with HTTP transport     | `127.0.0.1`      |
| `MCP_PORT`                     | TCP port for HTTP mode                                                             | Only with HTTP transport     | `3000`           |
| `LOG_LEVEL`                    | Logging level (debug, info, warn, error)                                           | No                           | info             |

## Troubleshooting Authentication

For detailed troubleshooting information for each authentication method, see the [Authentication Guide](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/authentication.md#troubleshooting-authentication-issues).

Common issues include:

- Invalid or expired credentials
- Insufficient permissions
- Network connectivity problems
- Configuration errors

## Authentication Implementation Details

For technical details about how authentication is implemented in the Azure DevOps MCP server, see the [Authentication Guide](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/authentication.md) and the source code in the `src/auth` directory.

## Available Tools

The Azure DevOps MCP server provides a variety of tools for interacting with Azure DevOps resources. For detailed documentation on each tool, please refer to the corresponding documentation.

### User Tools

- `get_me`: Get details of the authenticated user (id, displayName, email) (Azure DevOps Services only)

### Organization Tools

- `list_organizations`: List all accessible organizations (Azure DevOps Services only)

### Project Tools

- `list_projects`: List all projects in an organization
- `get_project`: Get details of a specific project
- `get_project_details`: Get comprehensive details of a project including process, work item types, and teams

### Repository Tools

- `list_repositories`: List all repositories in a project
- `get_repository`: Get details of a specific repository
- `get_repository_details`: Get detailed information about a repository including statistics and refs
- `get_file_content`: Get content of a file or directory from a repository
- `get_repository_tree`: List a repository's file tree from any path and depth
- `create_branch`: Create a new branch from an existing one
- `create_commit`: Commit multiple file changes to a branch using unified diffs or search/replace instructions

### Work Item Tools

- `get_work_item`: Retrieve a work item by ID
- `create_work_item`: Create a new work item
- `update_work_item`: Update an existing work item
- `list_work_items`: List work items in a project
- `manage_work_item_link`: Add, remove, or update links between work items

### Search Tools

- `search_code`: Search for code across repositories in a project
- `search_wiki`: Search for content across wiki pages in a project
- `search_work_items`: Search for work items across projects in Azure DevOps

### Pipelines Tools

- `list_pipelines`: List pipelines in a project
- `get_pipeline`: Get details of a specific pipeline
- `list_pipeline_runs`: List recent runs for a pipeline with optional filters
- `get_pipeline_run`: Get detailed run information and artifact summaries
- `download_pipeline_artifact`: Download a single artifact file as text
- `pipeline_timeline`: Retrieve the stage and job timeline for a run
- `get_pipeline_log`: Retrieve raw or JSON-formatted log content
- `trigger_pipeline`: Trigger a pipeline run with customizable parameters

### Wiki Tools

- `get_wikis`: List all wikis in a project
- `get_wiki_page`: Get content of a specific wiki page as plain text

### Pull Request Tools

- [`create_pull_request`](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/tools/pull-requests.md#create_pull_request) - Create a new pull request
- [`get_pull_request`](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/tools/pull-requests.md#get_pull_request) - Get a pull request by ID
- [`list_pull_requests`](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/tools/pull-requests.md#list_pull_requests) - List pull requests in a repository
- [`add_pull_request_comment`](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/tools/pull-requests.md#add_pull_request_comment) - Add a comment to a pull request
- [`get_pull_request_comments`](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/tools/pull-requests.md#get_pull_request_comments) - Get comments from a pull request
- [`update_pull_request`](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/tools/pull-requests.md#update_pull_request) - Update an existing pull request (title, description, status, draft state, reviewers, work items)
- [`get_pull_request_changes`](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/tools/pull-requests.md#get_pull_request_changes) - List changes in a pull request and policy evaluation status
- [`get_pull_request_checks`](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/tools/pull-requests.md#get_pull_request_checks) - Summarize status checks, policy evaluations, and their related pipelines

For comprehensive documentation on all tools, see the [Tools Documentation](https://github.com/tiberriver256/mcp-server-azure-devops/tree/main/docs/tools).

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/CONTRIBUTING.md) for contribution guidelines.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=tiberriver256/mcp-server-azure-devops&type=Date)](https://www.star-history.com/#tiberriver256/mcp-server-azure-devops&Date)

## License

MIT
