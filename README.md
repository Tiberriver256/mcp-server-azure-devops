# Azure DevOps MCP Server

A Model Context Protocol (MCP) server implementation for Azure DevOps, allowing AI assistants to interact with Azure DevOps APIs through a standardized protocol.

> **Looking for the official server?** Microsoft maintains a product-supported Azure DevOps MCP at [microsoft/azure-devops-mcp](https://github.com/microsoft/azure-devops-mcp). If you use Azure DevOps Services (cloud), start there.
>
> This community server remains a good fit when you need **Azure DevOps Server (on-premises)** support — especially older versions that may not work with Microsoft's MCP — or features not yet available in the official server. See [Discussion #237](https://github.com/Tiberriver256/mcp-server-azure-devops/discussions/237) for more context. See [ROADMAP.md](./ROADMAP.md) for where this server differentiates and what is planned.

## Overview

This server implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) for Azure DevOps, enabling AI assistants like Claude to interact with Azure DevOps resources securely. The server acts as a bridge between AI models and Azure DevOps APIs, providing a standardized way to:

- Access and manage projects, teams, work items, sprints/iterations, repositories, pull requests, pipelines, wikis, search, test plans, OData analytics, and real-time events
- Create and update work items, branches, commits, pull requests, wiki pages, and test suites
- Execute common DevOps workflows through natural language over stdio or Streamable HTTP (with Docker support)
- Access repository content and live event streams via standardized `ado://` resource URIs
- Safely authenticate and interact with both Azure DevOps Services (cloud) and Azure DevOps Server (on-premises), with prompt-injection Spotlighting enabled by default

## Server Structure

The server is structured around the Model Context Protocol (MCP) for communicating with AI assistants. It provides 77 tools organized into 13 toolsets:

- Users
- Organizations
- Projects
- Repositories
- Work Items
- Search
- Pull Requests
- Pipelines
- Wikis
- Test Plans
- Work (Sprints & Iterations)
- Analytics (OData v4)
- Events (MCP Events & Webhooks)

### Core Components

- **MCP Server (`src/server.ts`)**: Initializes the MCP server, resolves enabled toolsets/presets/filters upfront, registers `ListTools`, `CallTool` (with full `ToolAnnotations` and default-ON Spotlighting), `ListResources`, `ListResourceTemplates`, `ReadResource`, `resources/subscribe`, and SEP-3415 `events/*` handlers, and dispatches tools in O(1) via a prebuilt registry map.
- **Transports (`src/transport/`)**: Supports both MCP `stdio` (default) and zero-dependency `node:http` Streamable HTTP (`--transport http`), with DNS-rebinding/Origin protection, Bearer/per-request PAT auth, bounded body/session limits, and Docker packaging.
- **Session & Auth (`src/shared/session/`, `src/shared/auth/`)**: Single cached `AzureDevOpsSession` per server instance managing validated configuration, cached `WebApi` connections, lazy-loaded `@azure/identity` token refresh, and a native `fetch`-based `HttpClient`.
- **Declarative Feature Modules (`src/features/*`)**: Each feature area binds its Zod schemas, full MCP `ToolAnnotations` metadata, and typed handlers via `defineTool`, ensuring tool schemas, definitions, and dispatch stay in sync.
- **Events & Resource URIs (`src/shared/events/`, `src/shared/resources/`)**: Serves `ado://` repository and event resource URIs, bounded event ring buffers, `POST /webhooks/ado` ingestion, and per-session `resources/subscribe` polling.

## Getting Started

### Prerequisites

- Node.js (`>=24.0.0`)
- npm or yarn
- Azure DevOps account with appropriate access
- Authentication credentials (see [Authentication Guide](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/authentication.md) for details):
  - Personal Access Token (PAT), or
  - Azure Identity credentials (cloud only), or
  - Azure CLI login (cloud only)

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

For iterative development (auto-reload):

```bash
npm run dev            # runs src/index.ts via native node --watch
```

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

1. **Personal Access Token (PAT)** - Simple token-based authentication (supported on both Cloud and Azure DevOps Server on-prem)
2. **Azure Identity (DefaultAzureCredential)** - Flexible authentication using the Azure Identity SDK (Azure DevOps Services cloud only)
3. **Azure CLI** - Authentication using your Azure CLI login (Azure DevOps Services cloud only)

Example configuration files for each authentication method are available in the [examples directory](https://github.com/tiberriver256/mcp-server-azure-devops/tree/main/docs/examples).

Azure DevOps Server (on-prem) supports PAT authentication only. Azure Identity and Azure CLI are supported for Azure DevOps Services.

## Environment Variables

For a complete list of environment variables and their descriptions, see the [Authentication Guide](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/authentication.md#configuration-reference).

Key environment variables include:

| Variable                       | Description                                                                                                                                                                                                                                                       | Required                     | Default          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------- |
| `AZURE_DEVOPS_AUTH_METHOD`     | Authentication method (`pat`, `azure-identity`, or `azure-cli`) - case-insensitive                                                                                                                                                                                | No                           | `azure-identity` |
| `AZURE_DEVOPS_ORG_URL`         | Full URL to your Azure DevOps organization or Server collection (e.g., `https://server:8080/tfs/DefaultCollection`)                                                                                                                                               | Yes                          | -                |
| `AZURE_DEVOPS_PAT`             | Personal Access Token (for PAT auth)                                                                                                                                                                                                                              | Only with PAT auth           | -                |
| `AZURE_DEVOPS_DEFAULT_PROJECT` | Default project if none specified                                                                                                                                                                                                                                 | No                           | -                |
| `AZURE_DEVOPS_API_VERSION`     | REST api-version for tools that call the REST API directly ([per-release values](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/authentication.md#rest-api-version))                                                                     | No                           | `7.1`            |
| `AZURE_TENANT_ID`              | Azure AD tenant ID (for service principals)                                                                                                                                                                                                                       | Only with service principals | -                |
| `AZURE_CLIENT_ID`              | Azure AD application ID (for service principals)                                                                                                                                                                                                                  | Only with service principals | -                |
| `AZURE_CLIENT_SECRET`          | Azure AD client secret (for service principals)                                                                                                                                                                                                                   | Only with service principals | -                |
| `AZURE_DEVOPS_TOOLSETS`        | Comma-separated toolsets or presets (`all`, `users`, `organizations`, `projects`, `repositories`, `work-items`, `search`, `pull-requests`, `pipelines`, `wikis`, `test-plans`, `work`, `analytics`, `events`; presets: `pr-review`, `ci-debug`, `boards`, `core`) | No                           | `all`            |
| `AZURE_DEVOPS_ENABLED_TOOLS`   | Comma-separated allowlist of specific tool names to expose                                                                                                                                                                                                        | No                           | all              |
| `AZURE_DEVOPS_DISABLED_TOOLS`  | Comma-separated denylist of specific tool names to hide/block                                                                                                                                                                                                     | No                           | -                |
| `AZURE_DEVOPS_READ_ONLY`       | Set to `true` to expose only read-only tools and block all write operations                                                                                                                                                                                       | No                           | `false`          |
| `AZURE_DEVOPS_SPOTLIGHTING`    | Wrap tool outputs in per-call 128-bit nonce prompt-injection delimiters (`false` or `--no-spotlighting` to disable)                                                                                                                                               | No                           | `true`           |
| `AZURE_DEVOPS_TRANSPORT`       | Transport mode (`stdio` or `http` for Streamable HTTP)                                                                                                                                                                                                            | No                           | `stdio`          |
| `AZURE_DEVOPS_LOG_LEVEL`       | Stderr logging threshold (`debug`, `info`, `warn`, `error`); `debug` also prints sanitized startup config (falls back to `LOG_LEVEL`)                                                                                                                             | No                           | `info`           |

### Tool Filtering, Presets, Spotlighting & Read-Only Mode

To reduce tool count (e.g., for clients with tool limits) or prevent mutations, you can filter registered tools using environment variables or CLI flags (CLI flags take precedence over environment variables and support both `--flag value` and `--flag=value` syntax):

```bash
# Use a curated workflow preset (pr-review, ci-debug, boards, core)
npx -y @tiberriver256/mcp-server-azure-devops --toolsets pr-review

# Only expose work-items and pull-requests toolsets, in read-only mode
npx -y @tiberriver256/mcp-server-azure-devops --toolsets work-items,pull-requests --read-only

# Or pick specific tools / exclude specific tools (--flag=value syntax also supported)
npx -y @tiberriver256/mcp-server-azure-devops --enabled-tools=get_work_item,list_work_items
npx -y @tiberriver256/mcp-server-azure-devops --disabled-tools create_commit,delete_work_item_attachment

# Run over Streamable HTTP (loopback-only by default; see Dockerfile for container deployment)
npx -y @tiberriver256/mcp-server-azure-devops --transport http --port 3000 --http-auth-token <TOKEN>
```

- **Curated presets:** `pr-review` (`users,projects,repositories,pull-requests`), `ci-debug` (`projects,pipelines,pull-requests`), `boards` (`users,projects,work-items,search,work`), and `core` (`users,organizations,projects,repositories,work-items,pull-requests`).
- **Toolset aliases:** Common aliases are accepted: `repos` (`repositories`), `prs`/`pull_requests`/`pullrequests` (`pull-requests`), `work_items`/`workitems` (`work-items`), `test_plans`/`testplans` (`test-plans`), `sprints`/`iterations` (`work`), and `odata` (`analytics`).
- **Evaluation order:** `toolsets` → `enabled-tools` (intersection) → `disabled-tools` → `read-only` (fail-closed: write tools cannot be re-enabled when `--read-only` / `AZURE_DEVOPS_READ_ONLY=true` is set).
- **Read-only scope:** `--read-only` / `AZURE_DEVOPS_READ_ONLY=true` prevents all Azure DevOps state mutations as well as local file writes (`get_work_item_attachment` is classified as a write/destructive tool and is excluded in read-only mode).
- **Spotlighting:** Enabled by default (`AZURE_DEVOPS_SPOTLIGHTING=true`) to delimit untrusted Azure DevOps tool output with per-call 128-bit cryptographic nonces; opt out with `--no-spotlighting` or `AZURE_DEVOPS_SPOTLIGHTING=false`.
- Disabled tools are both omitted from `tools/list` and rejected if invoked via `tools/call`.

## Troubleshooting Authentication

For detailed troubleshooting information for each authentication method, see the [Authentication Guide](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/authentication.md#troubleshooting-authentication-issues).

Common issues include:

- Invalid or expired credentials
- Insufficient permissions
- Network connectivity problems
- Configuration errors

## Authentication Implementation Details

For technical details about how authentication is implemented in the Azure DevOps MCP server, see the [Authentication Guide](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/authentication.md) and the source code in the `src/shared/auth` directory.

## Available Tools

The Azure DevOps MCP server provides 77 tools across 13 toolsets. For detailed parameter tables, response formats, and examples, see the [Tools Documentation](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/tools/README.md).

### User Tools (1)

- `get_me`: Get details of the authenticated user (id, displayName, email) (Azure DevOps Services only)

### Organization Tools (1)

- `list_organizations`: List all accessible organizations (Azure DevOps Services only)

### Project Tools (4)

- `list_projects`: List all projects in an organization
- `get_project`: Get details of a specific project
- `get_project_details`: Get comprehensive details of a project including process, work item types, fields, and teams
- `list_teams`: List teams in a project

### Repository Tools (10)

- `list_repositories`: List all repositories in a project
- `get_repository`: Get details of a specific repository
- `get_repository_details`: Get detailed information about a repository including statistics and refs
- `get_file_content`: Get content of a file or directory from a repository
- `get_all_repositories_tree`: Display hierarchical file trees across multiple repositories in a project
- `get_repository_tree`: List a repository's file tree from any path and depth
- `create_branch`: Create a new branch from an existing one
- `create_commit`: Commit multiple file changes to a branch using unified diffs or search/replace instructions
- `list_commits`: List recent commits on a branch with diff summaries
- `list_branches`: List branches in a repository with ahead/behind and creator metadata

### Work Item Tools (11)

- `get_work_item`: Retrieve a work item by ID
- `create_work_item`: Create a new work item
- `update_work_item`: Update an existing work item
- `list_work_items`: List work items in a project
- `manage_work_item_link`: Add, remove, or update links between work items
- `get_work_item_comments`: Retrieve paginated comments on a work item
- `add_work_item_comment`: Add a comment to a work item
- `get_work_item_revisions`: Retrieve revision history for a work item
- `create_work_item_attachment`: Upload and attach a file to a work item
- `get_work_item_attachment`: Download an attachment from a work item
- `delete_work_item_attachment`: Delete an attachment from a work item

### Search Tools (3)

- `search_code`: Search for code across repositories in a project
- `search_wiki`: Search for content across wiki pages in a project
- `search_work_items`: Search for work items across projects in Azure DevOps

### Pipelines Tools (10)

- `list_pipelines`: List pipelines in a project
- `get_pipeline`: Get details of a specific pipeline
- `list_pipeline_runs`: List recent runs for a pipeline with optional filters
- `get_pipeline_run`: Get detailed run information and artifact summaries (runs can be referenced by pipeline name and build number)
- `download_pipeline_artifact`: Download a single artifact file as text
- `pipeline_timeline`: Retrieve the stage and job timeline for a run
- `get_pipeline_log`: Retrieve raw or JSON-formatted log content
- `trigger_pipeline`: Trigger a pipeline run with customizable parameters
- `get_build_test_results`: Retrieve test run summaries and failing test case details for a build
- `retry_pipeline_stage`: Retry a failed or canceled stage in a pipeline build

### Wiki Tools (6)

- `get_wikis`: List all wikis in a project or organization
- `get_wiki_page`: Get content of a specific wiki page as plain text
- `create_wiki`: Create a new project wiki or code wiki
- `update_wiki_page`: Update the content of an existing wiki page
- `list_wiki_pages`: List all pages within a wiki
- `create_wiki_page`: Create or update a wiki page at a specified path

### Pull Request Tools (12)

- [`create_pull_request`](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/tools/pull-requests.md#create_pull_request) - Create a new pull request
- [`get_pull_request`](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/tools/pull-requests.md#get_pull_request) - Get a pull request by ID
- [`list_pull_requests`](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/tools/pull-requests.md#list_pull_requests) - List pull requests in a repository
- [`add_pull_request_comment`](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/tools/pull-requests.md#add_pull_request_comment) - Add a comment to a pull request
- [`get_pull_request_comments`](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/tools/pull-requests.md#get_pull_request_comments) - Get comments from a pull request
- [`update_pull_request`](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/tools/pull-requests.md#update_pull_request) - Update an existing pull request (title, description, status, draft state, reviewers, work items, tags)
- [`update_pull_request_thread_status`](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/tools/pull-requests.md#update_pull_request_thread_status) - Update the status of a pull request comment thread
- [`get_pull_request_changes`](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/tools/pull-requests.md#get_pull_request_changes) - List changes in a pull request and policy evaluation status
- [`get_pull_request_checks`](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/tools/pull-requests.md#get_pull_request_checks) - Summarize status checks, policy evaluations, and their related pipelines
- [`merge_pull_request`](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/tools/pull-requests.md#merge_pull_request) - Complete (merge) an active pull request or manage auto-complete (merge strategy, delete source branch, work item transitions, policy bypass)
- `vote_pull_request`: Submit or reset a reviewer vote on a pull request
- `manage_pull_request_reviewers`: Add or remove required/optional reviewers on a pull request

### Test Plans Tools (10)

- `list_test_plans`: List test plans in a project
- `get_test_plan`: Get details of a specific test plan by ID
- `create_test_plan`: Create a new test plan in a project
- `list_test_suites`: List test suites in a test plan (flat or tree)
- `get_test_suite`: Get details of a specific test suite
- `create_test_suite`: Create a static, requirement-based, or query-based test suite
- `list_suite_test_cases`: List test cases linked to a test suite
- `add_test_cases_to_suite`: Attach existing Test Case work items to a suite
- `remove_test_cases_from_suite`: Remove test cases from a static suite
- `create_test_case`: Create a Test Case work item with structured steps XML, optional requirement link, and optional suite attachment

### Work / Sprint Tools (4)

- `list_iterations`: List project iteration classification nodes
- `list_team_iterations`: List iterations assigned to a team (all, past, current, or future)
- `get_team_settings`: Get team backlog, working days, and default iteration settings
- `get_iteration_work_items`: List work items assigned to a specific team iteration

### Analytics Tools (3)

- `get_analytics_schema`: Discover OData v4 Analytics entity sets, properties, and navigation properties from `$metadata`
- `query_analytics`: Execute guarded OData v4 queries with `$batch` support and same-origin `@odata.nextLink` paging
- `get_analytics_metrics`: Compute preset agile and CI metrics (`cycle_time`, `lead_time`, `velocity`, `burndown`, `pipeline_pass_rate`, `test_pass_rate`)

### Events Tools (2)

- `list_event_types`: List supported Azure DevOps MCP event types and payload schemas
- `poll_events`: Poll buffered Azure DevOps events by cursor and optional event type filter

For comprehensive documentation on all tools, see the [Tools Documentation](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/docs/tools/README.md).

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](https://github.com/tiberriver256/mcp-server-azure-devops/blob/main/CONTRIBUTING.md) for contribution guidelines.

## Star History

[![Star History Chart](https://star-history.dera.page/svg?repos=tiberriver256/mcp-server-azure-devops&type=Date)](https://star-history.dera.page/#tiberriver256/mcp-server-azure-devops&Date)

## License

MIT
