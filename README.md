# Azure DevOps MCP Server

A Model Context Protocol (MCP) server implementation for Azure DevOps, allowing AI assistants to interact with Azure DevOps APIs through a standardized protocol.

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
- Azure DevOps account with a Personal Access Token

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
   Then edit the `.env` file with your Azure DevOps credentials:
   ```
   AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
   AZURE_DEVOPS_PAT=your-personal-access-token
   AZURE_DEVOPS_DEFAULT_PROJECT=your-default-project
   ```

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
