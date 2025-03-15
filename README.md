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
- Either:
  - A Personal Access Token (PAT) with appropriate scopes, or
  - Azure Active Directory (AAD) credentials for modern authentication

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/your-username/azure-devops-mcp.git
   cd azure-devops-mcp
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up your environment:

   Option A: Using the automated setup script (recommended):
   ```
   chmod +x setup_env.sh
   ./setup_env.sh
   ```
   This script will:
   - Check for and install the Azure CLI DevOps extension if needed
   - Let you select from your available Azure DevOps organizations
   - Optionally set a default project
   - Create a Personal Access Token with the required permissions
   - Generate your `.env` file with the correct settings

   Option B: Manual setup:
   ```
   cp .env.example .env
   ```
   Then edit the `.env` file with your Azure DevOps credentials (see Authentication section below).

### Running the Server

Build the TypeScript files:
```
npm run build
```

Start the server:
```
npm start
```

For development with hot reloading:
```
npm run dev
```

## Authentication Methods

This server supports two authentication methods for connecting to Azure DevOps APIs:

### 1. Personal Access Token (PAT) Authentication

PAT authentication is the simplest method and works well for personal use or testing:

1. Generate a PAT in Azure DevOps:
   - Go to https://dev.azure.com/{your-organization}/_usersSettings/tokens
   - Or click on your profile picture > Personal access tokens
   - Select "+ New Token"
   - Name your token (e.g., "MCP Server Access")
   - Set an expiration date
   - Select the following scopes:
     - **Code**: Read & Write
     - **Work Items**: Read & Write
     - **Build**: Read & Execute
     - **Project and Team**: Read
     - **Graph**: Read
     - **Release**: Read & Execute
   - Click "Create" and copy the generated token

2. Configure your `.env` file:
   ```
   AZURE_DEVOPS_AUTH_METHOD=pat
   AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
   AZURE_DEVOPS_PAT=your-personal-access-token
   AZURE_DEVOPS_DEFAULT_PROJECT=your-default-project
   ```

3. Security considerations:
   - PATs have an expiration date and will need to be renewed
   - Store your PAT securely and never commit it to source control
   - Consider using environment variables or a secrets manager in production

### 2. Azure Active Directory (AAD) Authentication

AAD authentication is recommended for production environments and provides more robust security:

1. Register an application in Azure Active Directory:
   - Go to the [Azure Portal](https://portal.azure.com)
   - Navigate to "Azure Active Directory" > "App registrations"
   - Click "+ New registration"
   - Name your application (e.g., "Azure DevOps MCP Server")
   - Set the redirect URI to the appropriate value for your application
   - Click "Register"

2. Configure API permissions:
   - In your registered app, go to "API permissions"
   - Click "Add a permission"
   - Select "Azure DevOps"
   - Choose the following permissions:
     - `user_impersonation` (or specific scopes as needed)
   - Click "Add permissions"
   - Grant admin consent if required

3. Create a client secret:
   - Go to "Certificates & secrets"
   - Click "+ New client secret"
   - Add a description and select an expiration
   - Copy the generated secret value (you won't be able to see it again)

4. Configure your `.env` file:
   ```
   AZURE_DEVOPS_AUTH_METHOD=aad
   AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
   AZURE_DEVOPS_DEFAULT_PROJECT=your-default-project
   AZURE_AD_TENANT_ID=your-tenant-id
   AZURE_AD_CLIENT_ID=your-application-id
   AZURE_AD_CLIENT_SECRET=your-client-secret
   ```

5. Security considerations:
   - Client secrets should be rotated regularly
   - Use managed identities in Azure for improved security
   - Implement proper access controls and principle of least privilege

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `AZURE_DEVOPS_AUTH_METHOD` | Authentication method (`pat` or `aad`) | Yes | `pat` |
| `AZURE_DEVOPS_ORG` | Azure DevOps organization name | No | Extracted from URL |
| `AZURE_DEVOPS_ORG_URL` | Full URL to your Azure DevOps organization | Yes | - |
| `AZURE_DEVOPS_PAT` | Personal Access Token (for PAT auth) | Only with PAT auth | - |
| `AZURE_DEVOPS_DEFAULT_PROJECT` | Default project if none specified | No | - |
| `AZURE_DEVOPS_API_VERSION` | API version to use | No | Latest |
| `AZURE_AD_TENANT_ID` | Azure AD tenant ID (for AAD auth) | Only with AAD auth | - |
| `AZURE_AD_CLIENT_ID` | Azure AD application ID (for AAD auth) | Only with AAD auth | - |
| `AZURE_AD_CLIENT_SECRET` | Azure AD client secret (for AAD auth) | Only with AAD auth | - |
| `PORT` | Server port | No | 3000 |
| `HOST` | Server host | No | localhost |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | No | info |

## Troubleshooting Authentication

### PAT Authentication Issues

1. **Invalid PAT**: Ensure your PAT hasn't expired and has the required scopes
2. **Scope issues**: If receiving 403 errors, check if your PAT has the necessary permissions
3. **Organization access**: Verify your PAT has access to the organization specified in the URL

### AAD Authentication Issues

1. **Invalid credentials**: Check client ID, tenant ID, and client secret
2. **Permission issues**: Ensure your app has been granted the correct permissions
3. **Consent problems**: Admin consent may be required for some permissions
4. **Token acquisition errors**: Check network connectivity and AAD endpoint availability

### General Authentication Troubleshooting

1. Check that your environment variables are correctly set
2. Verify organization URL format (should be `https://dev.azure.com/your-organization`)
3. Examine server logs for detailed error messages
4. Test connectivity to Azure DevOps APIs directly using a tool like Postman

## Authentication Implementation Details

The Azure DevOps MCP server implements authentication through abstracted clients that handle different authentication methods:

### PAT Authentication Implementation

PAT authentication uses the official Azure DevOps Node.js SDK:

```typescript
import { WebApi, getPersonalAccessTokenHandler } from 'azure-devops-node-api';

// Create authentication handler using PAT
const authHandler = getPersonalAccessTokenHandler(pat);

// Create API client with the auth handler
const client = new WebApi(orgUrl, authHandler);
```

This approach:
- Uses the official SDK for authentication
- Validates the connection immediately upon creation
- Provides typed access to all Azure DevOps APIs

### Client Architecture

The server implements a client wrapper that:

1. **Lazy initialization**: Creates the authenticated client only when needed
2. **Connection pooling**: Reuses authenticated connections
3. **Error handling**: Provides consistent error handling with specific error types
4. **API access**: Exposes methods to access different Azure DevOps APIs:
   ```typescript
   const coreApi = await client.getCoreApi();
   const gitApi = await client.getGitApi();
   const workItemTrackingApi = await client.getWorkItemTrackingApi();
   ```

### Security Considerations

1. **Token validation**: PATs are validated for proper format before use
2. **Error sanitization**: Authentication errors are sanitized to prevent information leakage
3. **Delayed initialization**: Authentication happens only when needed, minimizing exposure
4. **Token scope**: Tools respect the minimum required scope for operations

## Available Tools

### Project Tools
- `list_projects`: List all accessible projects
- `get_project`: Get details of a specific project

### Work Item Tools
- `get_work_item`: Retrieve a work item by ID
- `create_work_item`: Create a new work item

### Repository Tools
- `list_repositories`: List all repositories in a project
- `get_repository`: Get repository details

## Testing

### Unit Tests

Run unit tests with:

```bash
npm run test:unit
```

### Integration Tests

Integration tests require a connection to a real Azure DevOps instance. To run them:

1. Ensure your `.env` file is configured with valid Azure DevOps credentials:
   ```
   AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
   AZURE_DEVOPS_PAT=your-personal-access-token
   AZURE_DEVOPS_DEFAULT_PROJECT=your-project-name
   ```

2. Run the integration tests:
   ```bash
   npm run test:integration
   ```

### CI Environment

For running tests in CI environments (like GitHub Actions), see [CI Environment Setup](docs/ci-setup.md) for instructions on configuring secrets.

## Development

This project follows Test-Driven Development practices. Each new feature should:

1. Begin with a failing test
2. Implement the minimal code to make the test pass
3. Refactor while keeping tests green

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
