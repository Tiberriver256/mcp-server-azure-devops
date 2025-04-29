# Azure DevOps MCP Server Tools Documentation

This directory contains documentation for all tools available in the Azure DevOps MCP server. Each tool is documented with examples, parameters, response formats, and error handling information.

## Navigation

- [Core Navigation Tools](./core-navigation.md) - Overview of tools for navigating Azure DevOps resources
  - [Organizations](./organizations.md) - Tools for working with organizations
  - [Projects](./projects.md) - Tools for working with projects
  - [Repositories](./repositories.md) - Tools for working with Git repositories
  - [Pull Requests](./pull-requests.md) - Tools for working with pull requests
  - [Work Items](./work-items.md) - Tools for working with work items
  - [Pipelines](./pipelines.md) - Tools for working with pipelines
- [Resource URIs](./resources.md) - Documentation for accessing repository content via resource URIs

## Tools by Category

### Organization Tools

- [`list_organizations`](./organizations.md#list_organizations) - List all Azure DevOps organizations accessible to the user

### Project Tools

- [`list_projects`](./projects.md#list_projects) - List all projects in the organization
- [`get_project`](./projects.md#get_project) - Get details of a specific project

### Repository Tools

- [`list_repositories`](./repositories.md#list_repositories) - List all repositories in a project
- [`get_repository`](./repositories.md#get_repository) - Get details of a specific repository
- [`get_repository_details`](./repositories.md#get_repository_details) - Get detailed information about a repository
- [`get_file_content`](./repositories.md#get_file_content) - Get content of a file or directory from a repository

### Pull Request Tools

- [`create_pull_request`](./pull-requests.md#create_pull_request) - Create a new pull request
- [`list_pull_requests`](./pull-requests.md#list_pull_requests) - List pull requests in a repository
- [`add_pull_request_comment`](./pull-requests.md#add_pull_request_comment) - Add a comment to a pull request
- [`get_pull_request_comments`](./pull-requests.md#get_pull_request_comments) - Get comments from a pull request
- [`update_pull_request`](./pull-requests.md#update_pull_request) - Update an existing pull request (title, description, status, draft state, reviewers, work items)

### Work Item Tools

- [`get_work_item`](./work-items.md#get_work_item) - Retrieve a work item by ID
- [`create_work_item`](./work-items.md#create_work_item) - Create a new work item
- [`list_work_items`](./work-items.md#list_work_items) - List work items in a project

### Pipeline Tools

- [`list_pipelines`](./pipelines.md#list_pipelines) - List all pipelines in a project
- [`get_pipeline`](./pipelines.md#get_pipeline) - Get details of a specific pipeline

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
