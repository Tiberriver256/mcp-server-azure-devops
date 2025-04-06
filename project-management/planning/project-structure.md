Below is the conceptual structure for the Azure DevOps MCP server project. This structure follows the Feature-Sliced Design architecture, which emphasizes business domains and use cases over technical implementations, creating a "screaming architecture" that clearly expresses the application's purpose.

```
azure-devops-mcp-server/
├── src/                             # Source code for the server
│   ├── features/                    # Business-domain features organized by entity
│   │   ├── {entity}/                # Entity represents a business domain (e.g., organizations, projects, work-items)
│   │   │   ├── {feature}/           # Specific feature implementation (e.g., list-projects, create-work-item)
│   │   │   │   ├── feature.ts       # Main feature implementation
│   │   │   │   ├── feature.spec.unit.ts   # Unit tests
│   │   │   │   ├── feature.spec.int.ts    # Integration tests
│   │   │   │   ├── schema.ts        # Feature request/response schema
│   │   │   │   └── index.ts         # Feature exports
│   │   │   ├── index.ts             # Exports all features for this entity
│   │   │   ├── schemas.ts           # Shared schemas across entity features
│   │   │   ├── types.ts             # Shared types for entity features
│   │   │   └── __test__/            # Test utilities and fixtures for this entity
│   │   │       ├── fixtures.ts      # Test fixtures
│   │   │       └── test-helpers.ts  # Test helper functions
│   │   └── ...                      # Additional entity folders follow the same pattern
│   ├── shared/                      # Shared utilities and infrastructure
│   │   ├── api/                     # API client logic
│   │   ├── auth/                    # Authentication functionality
│   │   ├── config/                  # Configuration management
│   │   ├── errors/                  # Error handling utilities
│   │   ├── test/                    # Shared testing utilities
│   │   └── types/                   # Shared type definitions
│   ├── index.ts                     # Server entry point
│   └── server.ts                    # Server implementation
├── tests/                           # Global test configuration
├── project-management/              # Project documentation
└── ...                              # Configuration files, etc.
```

### Explanation of Feature-Sliced Architecture

The project follows the Feature-Sliced Design methodology, with the following key aspects:

- **Feature-First Organization**: The code is organized primarily by business domain features rather than technical concerns, making the architecture "scream" about what the application does rather than how it's built.

- **Entity and Feature Structure**: 
  - Each `{entity}` folder represents a business domain area (organizations, projects, work-items, etc.)
  - Within each entity, `{feature}` folders represent specific use cases (list, create, update, etc.)
  - Features follow a consistent pattern with implementation, tests, schema validation, and exports

- **Layers**:
  - **Features**: Business domain functionality organized by entity
  - **Shared**: Cross-cutting concerns like API clients, authentication, configuration, and error handling
  
- **Benefits of this Architecture**:
  - Clear separation of business domains makes the codebase easy to navigate
  - Features can be developed, tested, and maintained independently
  - Business logic is isolated from implementation details
  - New developers can quickly understand what the system does by looking at the feature structure
  - Testing is simplified with well-defined feature boundaries

### Examples of Actual Feature Implementations

The project currently implements features for several entities including:

- **organizations**: Listing and managing Azure DevOps organizations
- **projects**: Getting project information and details
- **repositories**: Managing code repositories
- **work-items**: Creating, updating, and linking work items
- **search**: Searching across code, work items, and wikis
- **users**: User management and information

Each feature follows the structure outlined above, creating a consistent, maintainable, and scalable architecture that clearly communicates the application's purpose without being tied to any specific framework or implementation details.
