## Architectural Guide

### Overview

The architectural guide outlines a modular, tool-based structure for the Azure DevOps MCP server, aligning with MCP’s design principles. It emphasizes clarity, maintainability, and scalability, while incorporating best practices for authentication, error handling, and security. This structure ensures the server is extensible and adaptable to evolving requirements.

### Server Structure

The server is organized into distinct modules, each with a specific responsibility:

- **Tools Module**: Houses the definitions and implementations of MCP tools (e.g., `list_projects`, `create_work_item`). Each tool is an async function with defined inputs and outputs.
- **API Client Module**: Abstracts interactions with Azure DevOps APIs, supporting both PAT and AAD authentication. It provides a unified interface for tools to access API functionality.
- **Configuration Module**: Manages server settings, such as authentication methods and default Azure DevOps organization/project/repository values, loaded from environment variables or a config file.
- **Utilities Module**: Contains reusable helper functions for error handling, logging, and input validation to ensure consistency.
- **Server Entry Point**: The main file (e.g., `index.ts`) that initializes the server with `getMcpServer`, registers tools, and starts the server.

### Authentication and Configuration

- **Multiple Authentication Methods**: Supports PAT and AAD token-based authentication, configurable via an environment variable (e.g., `AZURE_DEVOPS_AUTH_METHOD`).
  - **PAT**: Uses the `WebApi` class from `azure-devops-node-api`.
  - **AAD**: Implements a custom Axios-based client with Bearer token authorization.
- **Secure Credential Storage**: Stores credentials in environment variables (e.g., `AZURE_DEVOPS_PAT`, `AZURE_AD_TOKEN`) to avoid hardcoding or exposure in the codebase.
- **Default Settings**: Allows configuration of default organization, project, and repository values, with tools able to override these via parameters.

### Tool Implementation

- **Tool Definitions**: Each tool specifies a name, an async handler, and an inputs schema. Example:
  ```ts
  const listProjects = {
    handler: async () => {
      const coreApi = await getCoreApi();
      return coreApi.getProjects();
    },
    inputs: {},
  };
  ```
- **Error Handling**: Wraps tool logic in try-catch blocks to capture errors and return them in a standard format (e.g., `{ error: 'Failed to list projects' }`).
- **Safe Operations**: Ensures tools perform non-destructive actions (e.g., creating commits instead of force pushing) and validate inputs to prevent errors or security issues.

### API Client Management

- **Singleton API Client**: Reuses a single API client instance (e.g., `WebApi` or Axios-based) across tools to optimize performance and reduce overhead.
- **Conditional Initialization**: Initializes the client based on the selected authentication method, maintaining flexibility without code duplication.

### Security Best Practices

- **Minimal Permissions**: Recommends scoping PATs and AAD service principals to the least required privileges (e.g., read-only for listing operations).
- **Logging and Auditing**: Implements logging for tool executions and errors, avoiding exposure of sensitive data.
- **Rate Limiting**: Handles API rate limits (e.g., 429 errors) with retry logic to maintain responsiveness.
- **Secure Communication**: Assumes MCP’s local socket communication is secure; ensures any remote connections use HTTPS.

### Testing and Quality Assurance

- **Unit Tests**: Verifies individual tool functionality and error handling.
- **Integration Tests**: Validates end-to-end workflows (e.g., user story to pull request).
- **Security Testing**: Checks for vulnerabilities like injection attacks or unauthorized access.

### Documentation

- **README.md**: Provides setup instructions, authentication setup, tool descriptions, and usage examples.
- **Examples Folder**: Includes sample configurations and tool usage scenarios (e.g., integration with MCP clients like Claude Desktop).
- **Troubleshooting Guide**: Addresses common issues, such as authentication errors or API rate limits.
