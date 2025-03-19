Below is the tree view of the folder structure for the Azure DevOps MCP server project. This structure is designed to be modular, organized, and easy to navigate, with clear separation between source code, tests, documentation, and configuration. The `tools/` directory is further categorized to enhance scalability and maintainability.

```
azure-devops-mcp-server/
├── src/                             # Source code for the server
│   ├── tools/                       # MCP tools organized by category
│   │   ├── core/                    # Tools for core functionality (e.g., listing orgs, projects)
│   │   │   ├── list_organizations.ts
│   │   │   ├── list_projects.ts
│   │   │   └── index.ts             # Exports all core tools
│   │   ├── repository/              # Tools for repository operations
│   │   │   ├── create_or_update_file.ts
│   │   │   ├── push_changes.ts
│   │   │   └── index.ts
│   │   ├── workitem/                # Tools for work item management
│   │   │   ├── create_work_item.ts
│   │   │   ├── update_work_item.ts
│   │   │   └── index.ts
│   │   ├── branch_pr/               # Tools for branch and pull request management
│   │   │   ├── create_branch.ts
│   │   │   ├── create_pull_request.ts
│   │   │   └── index.ts
│   │   ├── pipeline/                # Tools for pipeline interactions
│   │   │   ├── trigger_pipeline.ts
│   │   │   ├── get_pipeline_status.ts
│   │   │   └── index.ts
│   │   └── search/                  # Tools for search and query operations
│   │       ├── search_code.ts
│   │       ├── search_work_items.ts
│   │       └── index.ts
│   ├── api/                         # API client logic for Azure DevOps
│   │   ├── client.ts                # Initializes and manages API client
│   │   ├── auth.ts                  # Handles authentication (PAT, AAD)
│   │   └── requests.ts              # Custom requests for unsupported endpoints
│   ├── config/                      # Configuration management
│   │   └── index.ts                 # Loads and exports configuration
│   ├── utils/                       # Utility functions
│   │   ├── error.ts                 # Error handling utilities
│   │   ├── logger.ts                # Logging functions
│   │   └── validation.ts            # Input validation helpers
│   ├── types/                       # Shared type definitions
│   │   ├── tool.ts                  # Interfaces for MCP tools
│   │   └── api.ts                   # Types for API responses
│   └── index.ts                     # Server entry point (initializes server)
├── tests/                           # Test suites
│   ├── unit/                        # Unit tests
│   │   ├── tools/                   # Mirrors src/tools structure
│   │   │   ├── core/
│   │   │   │   ├── list_organizations.test.ts
│   │   │   │   └── ...
│   │   │   └── ...
│   │   ├── api/
│   │   │   ├── client.test.ts
│   │   │   └── ...
│   │   └── utils/
│   │       ├── error.test.ts
│   │       └── ...
│   └── integration/                 # Integration tests
│       └── workflow.test.ts         # End-to-end workflow tests
├── docs/                            # Documentation
│   ├── examples/                    # Usage examples and tutorials
│   │   ├── claude-desktop.md        # Example integration with Claude Desktop
│   │   └── config.json              # Sample configuration file
│   └── troubleshooting.md           # Troubleshooting guide
├── .gitignore                       # Git ignore file
├── package.json                     # Project dependencies and scripts
├── tsconfig.json                    # Typescript configuration
├── jest.config.js                   # Jest configuration for testing
├── eslint.config.js                 # ESLint configuration
├── prettier.config.js               # Prettier configuration
├── README.md                        # Main project documentation
└── LICENSE                          # Project license (e.g., MIT)
```

### Explanation of Key Components

- **`src/`**: Contains all source code, with subdirectories for tools, API logic, configuration, utilities, and type definitions. The `index.ts` file serves as the entry point for the server.
- **`tools/`**: Organized into subcategories (e.g., `core/`, `repository/`, `workitem/`) to group related functionality. Each subcategory includes an `index.ts` file to export its tools for easy importing.
- **`api/`**: Manages interaction with the Azure DevOps API, including client initialization, authentication, and custom requests.
- **`tests/`**: Houses unit and integration tests, with unit tests mirroring the `src/` structure for consistency.
- **`docs/`**: Stores documentation, including examples and troubleshooting guides, to support users and developers.
- **Root Files**: Configuration files (`tsconfig.json`, `jest.config.js`, etc.), `README.md`, and `LICENSE` reside at the root for visibility and convention.

This structure ensures the project is scalable, maintainable, and intuitive to navigate, accommodating future growth while keeping components modular and well-separated.
