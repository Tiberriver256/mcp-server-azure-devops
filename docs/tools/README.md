# Azure DevOps MCP Server Tools Documentation

This directory contains documentation for all tools available in the Azure DevOps MCP server. Each tool is documented with examples, parameters, response formats, and error handling information.

## Navigation

- [Core Navigation Tools](./core-navigation.md) - Overview of tools for navigating Azure DevOps resources
  - [Organizations](./organizations.md) - Tools for working with organizations
  - [Projects](./projects.md) - Tools for working with projects
  - [Repositories](./repositories.md) - Tools for working with Git repositories
  - [Work Items](./work-items.md) - Tools for working with work items

## Tools by Category

### Organization Tools
- [`list_organizations`](./organizations.md#list_organizations) - List all Azure DevOps organizations accessible to the user

### Project Tools
- [`list_projects`](./projects.md#list_projects) - List all projects in the organization
- [`get_project`](./projects.md#get_project) - Get details of a specific project

### Repository Tools
- [`list_repositories`](./repositories.md#list_repositories) - List all repositories in a project
- [`get_repository`](./repositories.md#get_repository) - Get details of a specific repository

### Work Item Tools
- [`get_work_item`](./work-items.md#get_work_item) - Retrieve a work item by ID
- [`create_work_item`](./work-items.md#create_work_item) - Create a new work item
- [`list_work_items`](./work-items.md#list_work_items) - List work items in a project

## Tool Structure

Each tool documentation follows a consistent structure:

1. **Description**: Brief explanation of what the tool does
2. **Parameters**: Required and optional parameters with explanations
3. **Response**: Expected response format with examples
4. **Error Handling**: Potential errors and how they're handled
5. **Example Usage**: Code examples showing how to use the tool
6. **Implementation Details**: Technical details about how the tool works

## Examples

Examples of using multiple tools together can be found in the [Core Navigation Tools](./core-navigation.md#common-use-cases) documentation. 