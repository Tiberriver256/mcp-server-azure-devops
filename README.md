# Azure DevOps MCP Server

A reference server implementation for the Model Context Protocol (MCP) that integrates with Azure DevOps. This server enables AI-driven workflows from user story creation to pull request management.

## Features

- Core Azure DevOps navigation (organizations, projects, repositories)
- Work item management (create/update user stories, tasks, bugs)
- Repository operations (file creation/updates, pushing changes)
- Branch and pull request management
- Pipeline interactions
- Search capabilities across Azure DevOps entities

## Prerequisites

- Node.js (v18 or higher)
- TypeScript
- Azure DevOps account with appropriate permissions
- Personal Access Token (PAT) or Azure Active Directory (AAD) credentials

## Installation

```bash
# Clone the repository
git clone [repository-url]
cd azure-devops-mcp

# Install dependencies
npm install
```

## Dependencies

This project relies on the following key dependencies:

- **@modelcontextprotocol/sdk**: The official MCP SDK for TypeScript, providing the core functionality for creating MCP servers with tools, resources, and prompts.
- **azure-devops-node-api**: The official Node.js client for Azure DevOps REST APIs, simplifying interactions with Azure DevOps services.
- **zod**: A TypeScript-first schema validation library used for defining tool parameter schemas.
- **dotenv**: For loading environment variables from a .env file.
- **@azure/identity**: Facilitates Azure Active Directory (AAD) authentication.
- **axios**: A promise-based HTTP client for making API requests not covered by the Azure DevOps Node API.

Development dependencies include TypeScript, Jest for testing, ESLint and Prettier for code quality, and other tools to enhance the development experience.

## Configuration

1. Copy the `.env.example` file to `.env` and update with your Azure DevOps credentials:
```bash
cp .env.example .env
```

2. Edit the `.env` file with your specific values:
```env
AZURE_DEVOPS_PAT=your_pat_here
AZURE_DEVOPS_ORG=your_organization
AZURE_DEVOPS_PROJECT=your_project
```

2. Configure authentication method in your MCP client:
```json
{
  "mcpServers": {
    "azuredevops": {
      "command": "npx",
      "args": ["-y", "@your-org/server-azuredevops"],
      "env": {
        "AUTH_METHOD": "PAT",
        "AZURE_DEVOPS_PAT": "<YOUR_PAT>",
        "AZURE_DEVOPS_ORG": "your-org",
        "AZURE_DEVOPS_PROJECT": "your-project"
      }
    }
  }
}
```

## Development

```bash
# Build the project
npm run build

# Run tests
npm test

# Run in development mode
npm run dev
```

## Testing

The project includes:
- Unit tests for individual tools
- Integration tests for end-to-end workflows
- Security tests for authentication and permissions

Run tests with:
```bash
npm test
npm run test:integration
npm run test:security
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Security

- Use environment variables for sensitive data
- Scope permissions appropriately in Azure DevOps
- Follow security best practices when handling credentials

## Support

For support, please:
1. Check the documentation in the `docs/` directory
2. Search existing issues
3. Open a new issue if needed
