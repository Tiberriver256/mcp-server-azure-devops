## Completed Tasks

- [x] **Task 7.3.1**: Optimize git hooks performance using lint-staged
  - **Role**: Full-Stack Developer
  - **Phase**: Completed
  - **Notes**:
    - Current pre-commit hooks were running eslint and prettier on the entire project
    - Implemented lint-staged to run these tools only on staged files
    - This significantly improves the performance of git commits
    - Implementation details:
      1. Added lint-staged configuration to package.json to run prettier and eslint on staged *.ts files
      2. Updated .husky/pre-commit to use lint-staged instead of running npm scripts
      3. Tested and verified that lint-staged works correctly
  - **Completed**: April 2, 2025

- [x] **Task**: Fix search_work_items API authentication error with Azure Identity (GitHub Issue #120)
  - **Role**: Full-Stack Developer
  - **Phase**: Completed
  - **Notes**:
    - Fixed an authentication issue with the search_work_items API when using Azure Identity authentication
    - The search API was returning HTML for a login page instead of JSON data
    - Identified that the search API endpoints (almsearch.dev.azure.com) require Bearer token authentication when using Azure Identity
    - Fixed all three search features (work items, code, wiki) to properly handle Azure Identity authentication
    - Added unit and integration tests to verify the fix
  - **Sub-tasks**:
    - [x] Updated the getAuthorizationHeader function in search-work-items feature to properly handle Azure Identity authentication
    - [x] Applied the same fix to search-code and search-wiki features for consistency
    - [x] Added unit tests to verify Azure Identity token acquisition
    - [x] Added integration tests for the Azure Identity authentication path
  - **Completed**: April 2, 2025

- [x] **Task**: Migrate release automation to use Release Please for version management (GitHub Issue #113)
  - **Role**: DevOps Engineer
  - **Phase**: Completed
  - **Notes**:
    - Implemented a new Release Please GitHub Action workflow
    - Created Release Please configuration and manifest files
    - Updated package.json to remove standard-version scripts and add Release Please config
    - Deprecated the existing manual release workflow
    - Added comprehensive documentation for the migration
    - Updated CONTRIBUTING.md to reflect the new release process
  - **Sub-tasks**:
    - [x] Created .github/workflows/release-please.yml
    - [x] Created .github/release-please-config.json
    - [x] Created .github/release-please-manifest.json
    - [x] Updated package.json to remove standard-version
    - [x] Marked existing release.yml as deprecated
    - [x] Updated CONTRIBUTING.md with new process
    - [x] Created migration guide in docs/release-please-migration.md
  - **Completed**: April 2, 2025

- [x] **Task**: Implement get_project_details core functionality (GitHub Issue #101)
  - **Role**: Full-Stack Developer
  - **Phase**: Completed
  - **Notes**:
    - Implemented a handler for the `get_project_details` functionality
    - Added support for retrieving comprehensive project information including:
      - Basic project metadata
      - Process information
      - Work item types and their structure
      - Fields applicable to each work item type
      - Project teams
    - Created unit tests and integration tests
    - Registered the handler in the server
  - **Sub-tasks**:
    - [x] Created schema for get_project_details
    - [x] Created tests for get_project_details
    - [x] Implemented get_project_details feature
    - [x] Registered the handler in server.ts
    - [x] Updated exports in projects/index.ts
  - **Completed**: April 2, 2025
  - **Pull Request**: [#111](https://github.com/Tiberriver256/mcp-server-azure-devops/pull/111)
- [x] **Task 6.4**: Implement `search_work_items` handler with tests
  - **Role**: Full-Stack Developer
  - **Phase**: Completed
  - **Notes**:
    - Implemented a handler to search for work items in Azure DevOps projects
    - Used the Azure DevOps Work Item Search API
    - Added support for filtering, pagination, and proper error handling
    - Created unit and integration tests
  - **Sub-tasks**:
    - [x] Created the necessary types and schemas
    - [x] Implemented the search_work_items handler
    - [x] Wrote unit tests
    - [x] Wrote integration tests
    - [x] Updated server.ts to register the new tool
  - **Completed**: April 2, 2025

- [x] **Task 3.1**: Implement get_repository_details core functionality
  - **Role**: Full-Stack Developer
  - **Phase**: Completed
  - **Notes**:
    - Implemented a handler to fetch detailed information about a specific Git repository in Azure DevOps
    - Added support for repository metadata, branch statistics, and refs information
    - Created unit tests and integration tests
    - Updated documentation
  - **Sub-tasks**:
    - [x] Created schema for get_repository_details
    - [x] Implemented core functionality to fetch repository details
    - [x] Added support for branch statistics
    - [x] Added support for repository refs
    - [x] Wrote unit tests
    - [x] Wrote integration tests
    - [x] Updated documentation
  - **Completed**: April 2, 2025

- [x] **Task 2.8**: Allow `get_work_item` to default to 'Expand All' when no specific fields are requested. There isn't usually enough information on the default Get_work_item response now.
  - **Role**: Full-Stack Developer
  - **Phase**: Completed
  - **Notes**:
    - Current implementation in `src/features/work-items/get-work-item/feature.ts` only requested minimal fields by default
    - Azure DevOps API supports WorkItemExpand enum with options: None, Relations, Fields, Links, All
    - When using expand parameter, we should not specify fields array
    - Current schema in `src/features/work-items/schemas.ts` didn't expose expand parameter
  - **Implementation**:
    - Updated `GetWorkItemSchema` in `src/features/work-items/schemas.ts` to include the optional expand parameter
    - Modified `getWorkItem` function in `src/features/work-items/get-work-item/feature.ts` to use `WorkItemExpand.All` by default
    - Updated documentation in `docs/tools/work-items.md` to reflect the new default behavior
    - Added tests in `src/features/work-items/get-work-item/feature.spec.int.ts` to verify the expanded data retrieval
  - **Completed**: March 31, 2024

- [x] **Task 1.0**: Implement `manage_work_item_link` handler with tests
  - **Role**: Full-Stack Developer
  - **Phase**: Completed
  - **Notes**:
    - Work item links in Azure DevOps represent relationships between work items
    - Common link types include:
      - Hierarchy links (Parent/Child)
      - Related links
      - Dependency links (Predecessor/Successor)
      - Custom link types specific to the organization
    - Azure DevOps API provides the following for work item links:
      - Work Item Relation Types API: Lists available link types
      - Work Items API: Can create/update work items with links via JSON Patch operations
      - Reporting Work Item Links API: Can retrieve work item link information
    - Creating a link requires:
      - Source work item ID
      - Target work item ID
      - Relation type reference name (e.g., "System.LinkTypes.Hierarchy-Forward")
    - Links are managed via JSON Patch document with operations like:
      - "add" operation to add a link
      - "remove" operation to remove a link
    - The `manage_work_item_link` handler supports:
      - Adding a link between two work items
      - Removing a link between two work items
      - Updating a link type (removing existing and adding new)
    - Implementation:
      - Created schema for handler parameters
      - Implemented handler function that creates the appropriate JSON patch document
      - Added proper error handling and validation
      - Added unit and integration tests
      - Updated documentation
  - **Sub-tasks**:
    - [x] Research Azure DevOps API for work item link management
    - [x] Define schema for the handler (inputs and outputs)
    - [x] Create test cases for the handler
    - [x] Implement the handler
    - [x] Ensure proper error handling and validation
    - [x] Write and run both unit and integration tests
  - **Completed**: March 31, 2024

- [x] **Task 2.6**: Implement `list_work_items` handler with tests

  - **Role**: Full-Stack Developer
  - **Phase**: Completion
  - **Description**: Implement the `list_work_items` tool for the Azure DevOps MCP server using WebApi with tests.
  - **Notes**:
    - Implemented the `list_work_items` handler according to the pattern established in server-coverage.test.ts
    - Created comprehensive unit tests for the handler function
    - Fixed the test file to properly mock Azure DevOps API
    - Ensured all tests pass successfully
    - Implemented error handling for API errors and validation errors
    - Aligned the implementation with the established project patterns

- [x] **Task 1.8**: Document core navigation tools (usage, parameters)

  - **Role**: Technical Writer
  - **Phase**: Completion
  - **Description**: Create comprehensive documentation for the core navigation tools (list_organizations, list_projects, list_repositories)
  - **Notes**:
    - Created detailed documentation for `list_projects` in docs/tools/projects.md
    - Created detailed documentation for `list_repositories` in docs/tools/repositories.md
    - Created an overview document in docs/tools/core-navigation.md that explains how the core navigation tools work together
    - Updated the main README.md to reference the new documentation files
    - Created a docs/tools/README.md file to serve as an index for all tool documentation
    - Each tool documentation includes detailed parameter descriptions, response formats, error handling, and usage examples

- [x] **Task 1.6**: Implement `list_repositories` using WebApi with tests

  - **Role**: Full-Stack Developer
  - **Phase**: Completion
  - **Description**: Implement the `list_repositories` tool for the Azure DevOps MCP server using WebApi with tests.
  - **Notes**:
    - Implemented the `list_repositories` tool for fetching repositories from Azure DevOps
    - Created unit tests to verify functionality with proper error handling
    - Ensured proper parameter validation and documentation
    - Connected the tool to the Azure DevOps WebApi using the existing implementation
    - Integrated with the MCP server interface

- [x] **Task 1.4**: Implement `list_projects` using WebApi with tests

  - **Role**: Full-Stack Developer
  - **Phase**: Completion
  - **Description**: Implement the `list_projects` tool for the Azure DevOps MCP server using WebApi with tests.
  - **Notes**:
    - Implemented the `list_projects` tool in the core tools section
    - Created unit tests to verify functionality
    - Ensured proper error handling and parameter validation
    - Connected the tool to the MCP server interface
    - Verified integration with the Azure DevOps WebApi

- [x] **Task A.7**: Update authentication documentation

  - **Role**: Technical Writer
  - **Phase**: Completion
  - **Description**: Document new authentication methods, add examples for all supported auth methods, and update troubleshooting guide.
  - **Notes**:
    - Created comprehensive authentication documentation in `docs/authentication.md`
    - Added example configuration files for all authentication methods in `docs/examples/`
    - Updated README.md to reference the new authentication documentation
    - Documented all three authentication methods: PAT, Azure Identity, and Azure CLI
    - Added troubleshooting tips for common authentication issues
    - Created a configuration reference table for environment variables
    - Added best practices for authentication security

- [x] **Task A.1**: Research and document Azure Identity implementation options

  - **Role**: Technical Architect
  - **Phase**: Research
  - **Description**: Research DefaultAzureCredential and related Azure Identity SDKs, determine ideal authentication flow using Azure CLI credentials, and document findings and implementation approach.
  - **Notes**:

    - **Azure Identity SDK Overview**:
      - The `@azure/identity` package provides various credential types for authenticating with Azure services
      - Key credential types include `DefaultAzureCredential`, `AzureCliCredential`, `ChainedTokenCredential`, and others
      - These credentials can be used with Azure DevOps by obtaining a bearer token and using it with the `BearerCredentialHandler`
    - **DefaultAzureCredential**:
      - Provides a simplified authentication experience by trying multiple credential types in sequence
      - Attempts to authenticate using environment variables, managed identity, Azure CLI, Visual Studio Code, and other methods
      - Ideal for applications that need to work in different environments (local development, Azure-hosted) without code changes
      - For Azure DevOps, it requires the resource ID `499b84ac-1321-427f-aa17-267ca6975798` to obtain the correct token scope
    - **AzureCliCredential**:
      - Authenticates using the Azure CLI's logged-in account
      - Requires the Azure CLI to be installed and the user to be logged in (`az login`)
      - Good for local development scenarios where developers are already using the Azure CLI
      - Can be used as a fallback mechanism in a `ChainedTokenCredential`
    - **Implementation Approach**:
      - Create an abstraction layer for authentication that supports both PAT and Azure Identity methods
      - Implement a factory pattern to create the appropriate credential based on configuration
      - Use `DefaultAzureCredential` as the primary Azure Identity method with `AzureCliCredential` as a fallback
      - Update the configuration to support specifying the authentication method (PAT, AAD, DefaultAzureCredential)
      - Implement proper error handling and logging for authentication failures
    - **Integration with Azure DevOps Node API**:
      - The Azure DevOps Node API supports bearer token authentication via the `BearerCredentialHandler` class
      - Tokens obtained from Azure Identity can be used with this handler to authenticate API requests
      - Example: `const authHandler = new BearerCredentialHandler(token.token); const connection = new WebApi(orgUrl, authHandler);`
    - **Configuration Requirements**:
      - For PAT: `AZURE_DEVOPS_PAT` and `AZURE_DEVOPS_ORG_URL`
      - For DefaultAzureCredential: `AZURE_DEVOPS_ORG_URL` and potentially `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` depending on the environment
      - New configuration option: `AZURE_DEVOPS_AUTH_METHOD` to specify which authentication method to use

  - **Sub-tasks**:
    - [x] Research DefaultAzureCredential and related Azure Identity SDKs
    - [x] Determine ideal authentication flow using Azure CLI credentials
    - [x] Document findings and implementation approach
  - **Completed**: March 15, 2024
  - **Pull Request**: [#12](https://github.com/Tiberriver256/azure-devops-mcp/pull/12)

- [x] **Task 0.11**: Document project setup and authentication (README)

  - **Role**: Technical Writer
  - **Phase**: Research
  - **Description**: Create comprehensive documentation for setting up the Azure DevOps MCP server, including authentication methods (PAT and AAD), setup instructions, and examples.
  - **Notes**:
    - Added detailed overview section to README.md
    - Documented both PAT and AAD authentication methods with step-by-step instructions
    - Created a table of environment variables with descriptions
    - Added troubleshooting tips for authentication issues
    - Included technical details about authentication implementation
  - **Completed**: March 15, 2024

- [x] **Task 0.7**: Fix MCP Server Implementation

  - **Role**: Full-Stack Developer
  - **Phase**: Research
  - **Description**: Fix the Azure DevOps MCP server implementation to correctly use the MCP SDK. Currently, the server is not properly implementing the MCP protocol, causing connection errors when trying to use it with the inspector.
  - **Notes**:

    - **How we discovered the issue**:
      - Attempted to connect to our server with the MCP inspector
      - Received error: "TypeError: transport.onMessage is not a function at AzureDevOpsServer.connect"
      - Root cause: We're incorrectly implementing the MCP server protocol
    - **What we can learn from the GitHub implementation**:
      - GitHub implementation in `project-management/reference/mcp-server/src/github/index.ts` shows the correct pattern
      - They directly use the `Server` class from the SDK rather than creating a custom class
      - They register handlers using `server.setRequestHandler()` for specific request schemas
      - They have a clear pattern for tool implementation and error handling
    - **Key differences in implementation**:
      - GitHub uses `import { Server } from "@modelcontextprotocol/sdk/server/index.js"`
      - They register request handlers with `server.setRequestHandler(ListToolsRequestSchema, async () => {...})`
      - Tool implementations follow a switch/case pattern based on the tool name
      - They connect to the transport using `await server.connect(transport)`
      - Our implementation attempts to handle transport messages directly which is incorrect
    - **Learning resources**:

      - Reference implementation in `project-management/reference/mcp-server/`
      - MCP SDK documentation
      - The specific schema structure shown in the GitHub reference

    - **Specific Changes Required**:

      1. Server Class Changes:
         - Replace our custom `McpServer` usage with `Server` from SDK
         - Remove our custom `connect()` method implementation
         - Move Azure DevOps connection logic to tool handlers
      2. Tool Registration Changes:
         - Replace our custom `tool()` method with proper request handlers
         - Implement `ListToolsRequestSchema` handler to declare available tools
         - Implement `CallToolRequestSchema` handler with switch/case for tool execution
         - Move tool implementations into separate modules like GitHub's pattern
      3. Transport Handling:
         - Remove custom transport handling code
         - Let SDK handle transport via `server.connect(transport)`
         - Ensure proper error handling and response formatting
      4. Configuration:
         - Keep Azure DevOps config but integrate it with SDK server config
         - Move tool-specific config into tool modules
         - Ensure proper typing for all configurations

  - **Sub-tasks**:
    - [x] Research the MCP SDK Server and Transport interfaces
    - [x] Refactor AzureDevOpsServer class to properly extend/use the MCP SDK Server
    - [x] Implement correct request handlers for ListToolsRequestSchema and CallToolRequestSchema
    - [x] Properly convert our existing tool implementations to the SDK pattern
    - [x] Fix the connection logic to correctly use the transport
    - [x] Test the implementation with the MCP inspector
    - [x] Ensure all existing unit tests still pass

- [x] **Task 0.6**: Implement basic server structure following TDD (Express setup with tests)

  - **Role**: Full-Stack Developer
  - **Phase**: Completion
  - **Notes**:
    - Implemented the basic server structure using TDD approach
    - Followed the red-green-refactor methodology
    - Built the server using the MCP Protocol SDK
    - Integrated with the Azure DevOps Node API
    - Created tests first, then implemented to make them pass
    - Added integration tests for the server
  - **Sub-tasks**:
    - [x] Research MCP server structure requirements
    - [x] Write failing tests for basic server functionality
    - [x] Implement minimal code to make tests pass
    - [x] Refactor code while keeping tests green
    - [x] Document the server structure setup in README.md

- [x] **Task 0.3**: Configure CI/CD pipeline with a basic build

  - **Role**: Full-Stack Developer
  - **Phase**: Implementation
  - **Notes**:
    - Researched best practices for CI/CD pipelines in GitHub Actions.
    - Identified the necessary steps for a basic build pipeline.
  - **Sub-tasks**:
    - [x] Created a new workflow in GitHub Actions.
    - [x] Configured the workflow to trigger on code commits.
    - [x] Added a build step to compile the Typescript code.
    - [x] Added a test step to run the unit tests.

- [x] **Task 0.4**: Set up development environment (Node.js, Typescript, VS Code)

  - **Role**: Full-Stack Developer
  - **Phase**: Research
  - **Notes**:
    - Verified Node.js v22.14.0 and npm v10.9.2 are installed and working correctly.
    - Updated TypeScript configuration with additional options for better development experience.
    - Verified VS Code setup with recommended extensions.
    - Confirmed build, test, and lint processes are working correctly.
  - **Sub-tasks**:
    - [x] Verified Node.js installation and version
    - [x] Configured TypeScript compiler options
    - [x] Set up VS Code with recommended extensions
    - [x] Verified the development environment works correctly

- [x] **Task 0.5**: Install project dependencies (e.g., azure-devops-node-api, @modelcontextprotocol/sdk)

  - **Role**: Full-Stack Developer
  - **Phase**: Implementation
  - **Notes**:
    - Successfully installed and configured the MCP Typescript SDK.
    - Verified Azure DevOps Node API is properly installed and working.
    - Added Zod for schema validation with the MCP SDK.
    - Updated package.json with all required dependencies.
    - Created a sample .env.example file for configuration.
    - Updated README with detailed dependency information.
    - Created test files to verify the dependencies are working correctly.
  - **Sub-tasks**:
    - [x] Installed and configured the MCP Typescript SDK
    - [x] Verified Azure DevOps Node API is properly installed
    - [x] Installed additional required dependencies (Zod)
    - [x] Updated package.json with appropriate versions and scripts

- [x] **Task 0.9**: Implement PAT-based authentication handler with tests

  - **Role**: Full-Stack Developer
  - **Phase**: Completion
  - **Notes**:
    - Implemented a robust authentication system for Azure DevOps using Personal Access Tokens
    - Created a comprehensive error handling system with custom error classes
    - Built a reusable client interface for accessing various Azure DevOps APIs
    - Added extensive test coverage for all components
    - Fixed all test failures and ensured proper error handling
  - **Sub-tasks**:
    - [x] Research Azure DevOps PAT authentication requirements and best practices
    - [x] Design the authentication handler interface
    - [x] Implement the authentication handler
      - [x] Create error handling classes
      - [x] Implement PAT validation
      - [x] Create authentication client factory
      - [x] Implement reusable API client class
    - [x] Write comprehensive tests
      - [x] Error class tests
      - [x] Authentication handler tests
      - [x] API client tests
      - [x] Configure Jest for proper coverage reporting
    - [x] Document the implementation
      - [x] Add JSDoc comments to all public interfaces
      - [x] Create README.md with usage examples
      - [x] Add troubleshooting guide

- [x] **Task 0.10**: Fix integration tests in CI environment

  - **Role**: Full-Stack Developer
  - **Phase**: Completed
  - **Description**: Configure integration tests to work in CI environment by properly handling credentials and environment setup
  - **Notes**:
    - Updated integration tests to better handle CI environment
    - Added detailed logging for connection testing
    - Updated GitHub Actions workflow to use secrets for credentials
    - Created documentation for setting up CI environment
    - Improved error handling in server connection functions
  - **Sub-tasks**:
    - ✅ Analyze current integration test failures in CI
    - ✅ Implement secure credential handling for CI
    - ✅ Update test configuration for CI environment
    - ✅ Verify tests pass in CI environment

- [x] **Task 1.2**: Implement `list_organizations` using Axios with tests

  - **Role**: Full-Stack Developer
  - **Phase**: Completion
  - **Description**: Implement the list_organizations tool which allows users to retrieve all Azure DevOps organizations accessible to the authenticated user. This tool will use Axios for direct API calls rather than the WebApi client.
  - **Research Findings**:
    - The organizations API is not directly supported by the azure-devops-node-api library, requiring Axios for implementation
    - Retrieving organizations requires a two-step process:
      1. First get the user profile: `GET https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0`
      2. Extract the `publicAlias` from the profile response
      3. Use the `publicAlias` to get organizations: `GET https://app.vssps.visualstudio.com/_apis/accounts?memberId={publicAlias}&api-version=6.0`
    - Authentication requires a PAT token sent via Basic Auth header
    - Response will include organization name, ID, and URL
    - The setup_env.sh script provides a working example of this API call sequence
  - **Implementation Details**:
    - Created the organizations module with the listOrganizations function
    - Implemented proper error handling for authentication failures
    - Added the tool to the server.ts file
    - Created comprehensive tests that verify all functionality
    - All tests are passing with good code coverage
    - Added documentation in docs/tools/organizations.md
  - **Completed**: March 15, 2024

- [x] **Task 2.2**: Implement `create_work_item` handler with tests

  - **Role**: Full-Stack Developer
  - **Phase**: Completion
  - **Description**: Implement the `create_work_item` tool for the Azure DevOps MCP server with tests.
  - **Notes**:
    - Designed and implemented the `CreateWorkItemSchema` with proper validation
    - Created the `createWorkItem` function with comprehensive error handling
    - Registered the tool in the server's tool registry
    - Added unit tests achieving 97.53% statement coverage for workitems.ts
    - Improved overall project test coverage to 93.97%
    - Created detailed documentation in docs/tools/work-items.md
    - Updated the main documentation index to include work item tools
  - **Completed**: March 15, 2024

- [x] **Task 2.4**: Implement `update_work_item` handler with tests
  - **Role**: Full-Stack Developer
  - **Phase**: Completion
  - **Description**: Implement the `update_work_item` handler for the Azure DevOps MCP server with comprehensive tests.
  - **Notes**:
    - Implemented the `update_work_item` handler for updating existing work items in Azure DevOps
    - Created comprehensive unit tests with high coverage
    - Ensured proper error handling and validation
    - Added support for updating various fields including title, description, state, and custom fields
    - Integrated the handler with the MCP server interface
  - **Sub-tasks**:
    - [x] Research Azure DevOps API for updating work items
    - [x] Write failing tests for the update_work_item handler
    - [x] Implement the handler to make tests pass
    - [x] Refactor and optimize the implementation
  - **Completed**: March 20, 2024
  - **Pull Request**: [#18](https://github.com/Tiberriver256/azure-devops-mcp/pull/18)

### Task 0.1: Initialize Git repository and set up branch policies

**Role**: Full-Stack Developer
**Completed**: ✓
**Phase**: Research

#### Notes

- Need to initialize a new Git repository
- Set up branch protection rules
- Configure main branch as protected
- Require pull request reviews
- Enable status checks

#### Sub-tasks

1. [x] Initialize Git repository
2. [x] Create initial project structure
3. [x] Set up branch protection for main branch
4. [x] Configure pull request requirements
5. [x] Add initial README.md
6. [x] Add .gitignore file

### Task A.2: Create authentication abstraction layer

- **Role**: Full-Stack Developer
- **Phase**: Completed
- Design interface to abstract authentication methods (PAT, AAD, DefaultAzureCredential)
- Implement factory pattern for credential creation
- Add unit tests

#### Notes and Sub-tasks:

- Created auth-factory.ts to implement the authentication factory pattern
- Created client-factory.ts to provide a client interface using the authentication factory
- Added support for PAT, DefaultAzureCredential, and AzureCliCredential authentication methods
- Updated server.ts and index.ts to use the new authentication abstraction
- Added unit tests for the authentication factory and client factory
- Updated .env.example to include the new authentication methods

- [x] **Task 1.0**: Reorganize repository structure around "Screaming Architecture" and "Vertical Slices"

  - **Role**: Software Architect, Full-Stack Developer
  - **Phase**: Implementation
  - **Description**: Refactor directory structure to emphasize business domains rather than technical layers, group related functionality into feature-based modules, ensure each vertical slice contains all necessary components, and update imports and references across the codebase.
  - **Completion Date**: 2023-06-13
  - **Pull Request**: [#20](https://github.com/Tiberriver256/azure-devops-mcp/pull/20)
  - **Notes**:

    - **Current Architecture Analysis**:
      - The codebase currently follows a mostly layer-based architecture with some domain grouping
      - Main directories: src/api, src/auth, src/common, src/config, src/operations, src/tools, src/types, src/utils
      - Operations are somewhat grouped by domain (workitems, organizations, projects, repositories)
      - Tests follow a similar structure to the source code
      - Client initialization and auth logic is separated from domain operations
    - **Screaming Architecture Understanding**:

      - Focuses on making the architecture "scream" about the business domain, not technical details
      - Names directories/components after business concepts, not technical layers
      - Makes the application purpose clear at a glance through its structure

    - **Vertical Slice Architecture Understanding**:
      - Organizes code by features rather than layers
      - Each slice contains all components needed for a single feature (API, business logic, data access)
      - Allows for independent development and changes to features
      - High cohesion within a slice, loose coupling between slices
      - Easier to navigate and understand when working on a specific feature
    - **Feature-Sliced Design Understanding**:
      - Formalized architectural methodology with three key concepts:
        - Layers: Top-level folders that define the application structure
        - Slices: Domain divisions within layers
        - Segments: Technical divisions within slices
      - Clear import rules: A module can only import other slices when they are located on layers strictly below
      - Promotes loose coupling and high cohesion like Vertical Slice Architecture
    - **Proposed New Structure**:
      - Group code by Azure DevOps domain concepts (Work Items, Repositories, Projects, Organizations, etc.)
      - Each domain folder contains all functionality related to that domain
      - Inside each domain folder, implement vertical slices for each operation
      - Move shared code to a dedicated location
      - Colocate unit tests with the implementation files
    - **Benefits of New Structure**:

      - Makes the purpose of the application clear through the directory structure
      - Easier to find and modify specific features
      - Isolates changes to a specific domain/feature
      - Improves developer experience by keeping related code together
      - Colocation of tests with implementation makes test coverage more obvious

    - **Progress So Far**:

      - Created the new directory structure with `features` and `shared` top-level folders
      - Implemented the work-items feature with vertical slices for:
        - list-work-items
        - get-work-item
        - create-work-item
        - update-work-item
      - Implemented the projects feature with vertical slices for:
        - get-project
        - list-projects
      - Implemented the repositories feature with vertical slices for:
        - get-repository
        - list-repositories
      - Implemented the organizations feature with vertical slice for:
        - list-organizations
      - Updated the server.ts file to use the new implementations
      - Fixed Jest configuration to recognize tests in the src directory
      - Moved some shared code (errors, config, types) to the shared directory
      - Moved exploration test files from src root to project-management/spikes
      - Successfully ran tests for the work-items, projects, repositories, and organizations features
      - Fixed error handling in the organizations feature to properly throw AzureDevOpsAuthenticationError for profile API errors
      - Fixed import paths in the server-list-work-items.test.ts file
      - Removed unused imports from shared modules
      - Fixed mocks and references in tests/unit/server-coverage.test.ts to match the new feature structure
      - Fixed import paths in the integration test (tests/integration/server.test.ts)
      - Achieved passing tests for 30 out of 31 test suites (only integration test failing due to missing valid credentials)
      - Improved code coverage close to threshold requirements (78.38% statements, 78.29% lines)
      - Deleted obsolete directories and files after confirming migration was complete:
        - Removed old layer-based directories: api/, auth/, common/, config/, types/, tools/, utils/
        - Removed operations/ directory after verifying all functionality was migrated to features/
        - Cleaned up outdated imports in remaining test files
      - Successfully moved all unit tests to be co-located with implementation files:
        - Moved server-list-work-items.test.ts to src/features/work-items/list-work-items/server.test.ts
        - Moved all feature-based tests to their corresponding feature directories
        - Moved all shared module tests to their respective locations
        - Fixed import paths in some of the moved test files
        - Removed the obsolete tests/unit directory
      - Feature tests are all passing with good coverage:
        - All work-items feature tests pass: 100% coverage
        - All projects feature tests pass: 100% coverage
        - All repositories feature tests pass: 100% coverage
        - All organizations feature tests pass: 97% coverage (only missing one branch case)
      - Reorganized test structure to follow co-location pattern:
        - Created client-factory.test.ts from server-client.test.ts
        - Enhanced auth-factory.test.ts with server-auth.test.ts tests
        - Created server.test.ts from server-coverage.test.ts

    - **Next Steps**:
      - Fix remaining test issues:
        - Fix resetTime/resetAt property issues in error tests
        - Fix integration tests with valid credentials
      - Improve coverage for shared modules (auth, api, errors)
      - Ensure all tests pass after refactoring

  - **Sub-tasks**:
    - [x] Research Screaming Architecture and Vertical Slices patterns
    - [x] Analyze current codebase organization
    - [x] Design new directory structure
    - [x] Create base directory structure
    - [x] Implement list-work-items feature as example
    - [x] Refactor remaining work-items features
    - [x] Refactor projects features
    - [x] Refactor repositories features
    - [x] Refactor organizations features
    - [x] Update imports and references in server.ts
    - [x] Fix error handling in the organizations feature
    - [x] Fix some import paths in shared modules
    - [x] Fix coverage tests
    - [x] Delete unused files and empty directories
    - [x] Move unit tests to be co-located with implementation files
      - [x] Move work-items/list-work-items server tests
      - [x] Move work-items feature tests
      - [x] Move repositories feature tests
      - [x] Move projects and organizations tests
      - [x] Move API/auth tests
      - [x] Move server and index tests
      - [x] Update import paths in moved test files
        - [x] Fixed list-work-items server test imports
        - [x] Fixed list-work-items operations test imports
        - [x] Removed duplicate test files
        - [x] Deleted tests/unit directory
        - [x] Fixed workitems-coverage.test.ts imports
        - [x] Fixed server-coverage.test.ts imports
        - [x] Fixed update-work-item/server.test.ts imports
        - [x] Fixed create-work-item/server.test.ts imports
    - [x] Fix remaining test issues:
      - [x] Update import paths in the remaining test files:
        - [x] Update auth related test files
        - [x] Update server-client.test.ts and api-errors.test.ts
        - [x] Update feature tests/operations.test.ts files
        - [x] Update server.test.ts
      - [ ] Fix resetTime/resetAt property issues in error tests
      - [ ] Fix integration tests with valid credentials

- [x] **Task 6.6**: Implement `search_wiki` handler with tests
  - **Role**: Full-Stack Developer
  - **Phase**: Completed
  - **Notes**:
    - Implemented a handler to search wiki pages in Azure DevOps projects
    - Followed the same pattern as the existing `search_code` handler
    - Added appropriate types, schemas, and tests
  - **Sub-tasks**:
    - [x] Created the necessary interfaces in types.ts
    - [x] Created the schema in schemas.ts
    - [x] Implemented the search_wiki handler in a new directory
    - [x] Wrote unit tests for the handler
    - [x] Wrote integration tests for the handler
    - [x] Updated the server.ts file to register the new tool
    - [x] Updated the search/index.ts file to export the new functionality
  - **Completed**: April 2, 2025
