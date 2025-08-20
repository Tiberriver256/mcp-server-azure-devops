# Development Guidelines for AI Agents - mcp-server-azure-devops

**This document is exclusively for AI Agent operational use. DO NOT include general development knowledge.**

## 1. Project Overview

### Purpose
- This project, `@tiberriver256/mcp-server-azure-devops`, is an MCP (Model Context Protocol) server.
- Its primary function is to provide tools for interacting with Azure DevOps services.

### Technology Stack
- **Core**: TypeScript, Node.js
- **Key Libraries**:
    - `@modelcontextprotocol/sdk`: For MCP server and type definitions.
    - `azure-devops-node-api`: For interacting with Azure DevOps.
    - `@azure/identity`: For Azure authentication.
    - `zod`: For schema definition and validation.
    - `zod-to-json-schema`: For converting Zod schemas to JSON schemas for MCP tools.
- **Testing**: Jest (for unit, integration, and e2e tests).
- **Linting/Formatting**: ESLint, Prettier.
- **Environment Management**: `dotenv`.

### Core Functionality
- Provides MCP tools to interact with Azure DevOps features including, but not limited to:
    - Organizations
    - Projects (list, get, get details)
    - Repositories (list, get, get content, get tree)
    - Work Items (list, get, create, update, manage links)
    - Pull Requests (list, get, create, update, add/get comments)
    - Pipelines (list, trigger)
    - Search (code, wiki, work items)
    - Users (get current user)
    - Wikis (list, get page, create, update page)

## 2. Project Architecture

### Main Directory Structure
- **`./` (Root)**:
    - [`package.json`](package.json:0): Project metadata, dependencies, and NPM scripts. **REFER** to this for available commands and dependencies.
    - [`tsconfig.json`](tsconfig.json:0): TypeScript compiler configuration. **ADHERE** to its settings.
    - [`.eslintrc.json`](.eslintrc.json:0): ESLint configuration for code linting. **ADHERE** to its rules.
    - [`README.md`](README.md:0): General project information.
    - `setup_env.sh`: Shell script for environment setup.
    - `CHANGELOG.md` (if present): Tracks changes between versions.
- **`src/`**: Contains all TypeScript source code.
    - **`src/features/`**: Core application logic. Each subdirectory represents a distinct Azure DevOps feature set (e.g., `projects`, `repositories`).
        - `src/features/[feature-name]/`: Contains all files related to a specific feature.
            - `src/features/[feature-name]/index.ts`: Main export file for the feature. Exports request handlers (`isFeatureRequest`, `handleFeatureRequest`), tool definitions array (`featureTools`), schemas, types, and individual tool implementation functions. **MODIFY** this file when adding new tools or functionalities to the feature.
            - `src/features/[feature-name]/schemas.ts`: Defines Zod input/output schemas for all tools within this feature. **DEFINE** new schemas here.
            - `src/features/[feature-name]/tool-definitions.ts`: Defines MCP tools for the feature using `@modelcontextprotocol/sdk` and `zodToJsonSchema`. **ADD** new tool definitions here.
            - `src/features/[feature-name]/types.ts`: Contains TypeScript type definitions specific to this feature. **DEFINE** feature-specific types here.
            - `src/features/[feature-name]/[tool-name]/`: Subdirectory for a specific tool/action within the feature.
                - `src/features/[feature-name]/[tool-name]/feature.ts`: Implements the core logic for the specific tool (e.g., API calls, data transformation). **IMPLEMENT** tool logic here.
                - `src/features/[feature-name]/[tool-name]/index.ts`: Exports the `feature.ts` logic and potentially tool-specific schemas/types if not in the parent feature files.
                - `src/features/[feature-name]/[tool-name]/schema.ts` (optional, often re-exports from feature-level `schemas.ts`): Defines or re-exports Zod schemas for this specific tool.
        - `src/features/organizations/`, `src/features/pipelines/`, `src/features/projects/`, `src/features/pull-requests/`, `src/features/repositories/`, `src/features/search/`, `src/features/users/`, `src/features/wikis/`, `src/features/work-items/`: Existing feature modules. **REFER** to these for patterns.
    - **`src/shared/`**: Contains shared modules and utilities used across features.
        - `src/shared/api/`: Azure DevOps API client setup (e.g., `client.ts`).
        - `src/shared/auth/`: Authentication logic for Azure DevOps (e.g., `auth-factory.ts`, `client-factory.ts`). **USE** these factories; DO NOT implement custom auth.
        - `src/shared/config/`: Configuration management (e.g., `version.ts`).
        - `src/shared/errors/`: Shared error handling classes and utilities (e.g., `azure-devops-errors.ts`, `handle-request-error.ts`). **USE** these for consistent error handling.
        - `src/shared/types/`: Global TypeScript type definitions (e.g., `config.ts`, `request-handler.ts`, `tool-definition.ts`).
    - **`src/utils/`**: General utility functions.
        - `src/utils/environment.ts`: Provides default values for environment variables (e.g., `defaultProject`, `defaultOrg`).
    - [`src/index.ts`](src/index.ts:1): Main application entry point. Handles environment variable loading and server initialization. **Exports** server components.
    - [`src/server.ts`](src/server.ts:1): MCP server core logic. Initializes the server, registers all tool handlers from features, and sets up request routing. **MODIFY** this file to register new feature modules (their `isFeatureRequest` and `handleFeatureRequest` handlers, and `featureTools` array).
- **`docs/`**: Currently empty. If documentation is added, **MAINTAIN** it in sync with code changes.
- **`project-management/`**: Contains project planning and design documents. **REFER** to `architecture-guide.md` for high-level design.
- **`tests/`**: Directory for global test setup or utilities if any. Most tests are co-located with source files (e.g., `*.spec.unit.ts`, `*.spec.int.ts`, `*.spec.e2e.ts`).

## 3. Code Standards

### Naming Conventions
- **Files and Directories**: USE kebab-case (e.g., `my-feature`, `get-project-details.ts`).
- **Variables and Functions**: USE camelCase (e.g., `projectId`, `listProjects`).
- **Classes, Interfaces, Enums, Types**: USE PascalCase (e.g., `AzureDevOpsClient`, `TeamProject`, `AuthenticationMethod`).
- **Test Files**:
    - Unit tests: `[filename].spec.unit.ts` (e.g., [`get-project.spec.unit.ts`](src/features/projects/get-project/feature.spec.unit.ts:0)).
    - Integration tests: `[filename].spec.int.ts` (e.g., [`get-project.spec.int.ts`](src/features/projects/get-project/feature.spec.int.ts:0)).
    - E2E tests: `[filename].spec.e2e.ts` (e.g., [`server.spec.e2e.ts`](src/server.spec.e2e.ts:0)).
- **Feature Modules**: Place under `src/features/[feature-name]/`.
- **Tool Logic**: Place in `src/features/[feature-name]/[tool-name]/feature.ts`.
- **Schemas**: Define in `src/features/[feature-name]/schemas.ts`.
- **Tool Definitions (MCP)**: Define in `src/features/[feature-name]/tool-definitions.ts`.
- **Types**: Feature-specific types in `src/features/[feature-name]/types.ts`; global types in `src/shared/types/`.

### Formatting
- **Prettier**: Enforced via ESLint and lint-staged.
- **Rule**: ADHERE to formatting rules defined by Prettier (implicitly via [`.eslintrc.json`](.eslintrc.json:1) which extends `prettier`).
- **Action**: ALWAYS run `npm run format` (or rely on lint-staged) before committing.

### Linting
- **ESLint**: Configuration in [`.eslintrc.json`](.eslintrc.json:1).
- **Rule**: ADHERE to linting rules.
- **Action**: ALWAYS run `npm run lint` (or `npm run lint:fix`) and RESOLVE all errors/warnings before committing.
- **Key Lint Rules (from [`.eslintrc.json`](.eslintrc.json:1))**:
    - `prettier/prettier: "error"` (Prettier violations are ESLint errors).
    - `@typescript-eslint/no-explicit-any: "warn"` (Avoid `any` where possible; it's "off" for `*.spec.unit.ts` and `tests/**/*.ts`).
    - `@typescript-eslint/no-unused-vars: ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }]` (No unused variables, allowing `_` prefix for ignored ones).

### Comments
- **TSDoc**: USE TSDoc for documenting public functions, classes, interfaces, and types (e.g., `/** ... */`).
- **Inline Comments**: For complex logic blocks, ADD inline comments (`// ...`) explaining the purpose.

### TypeScript Specifics (from [`tsconfig.json`](tsconfig.json:1))
- `strict: true`: ADHERE to strict mode.
- `noImplicitAny: true`: DO NOT use implicit `any`. Explicitly type all entities.
- `noUnusedLocals: true`, `noUnusedParameters: true`: ENSURE no unused local variables or parameters.
- `moduleResolution: "Node16"`: Be aware of Node.js ESM module resolution specifics.
- `paths: { "@/*": ["src/*"] }`: USE path alias `@/*` for imports from `src/`.

## 4. Functionality Implementation Standards

### Adding a New Tool/Functionality to an Existing Feature
1.  **Identify Feature**: Determine the relevant feature directory in `src/features/[feature-name]/`.
2.  **Create Tool Directory**: Inside the feature directory, CREATE a new subdirectory for your tool, e.g., `src/features/[feature-name]/[new-tool-name]/`.
3.  **Implement Logic**: CREATE `[new-tool-name]/feature.ts`. Implement the core Azure DevOps interaction logic here.
    - USE `getClient()` from `src/shared/api/client.ts` or `getConnection()` from [`src/server.ts`](src/server.ts:1) to get `WebApi`.
    - USE error handling from `src/shared/errors/`.
4.  **Define Schema**:
    - ADD Zod schema for the tool's input to `src/features/[feature-name]/schemas.ts`.
    - EXPORT it.
    - If needed, CREATE `[new-tool-name]/schema.ts` and re-export the specific schema from the feature-level `schemas.ts`.
5.  **Define MCP Tool**:
    - ADD tool definition to `src/features/[feature-name]/tool-definitions.ts`.
    - Import the Zod schema and use `zodToJsonSchema` for `inputSchema`.
    - Ensure `name` matches the intended tool name for MCP.
6.  **Update Feature Index**:
    - In `src/features/[feature-name]/index.ts`:
        - EXPORT your new tool's logic function (from `[new-tool-name]/feature.ts` or its `index.ts`).
        - ADD your new tool's name to the `includes()` check in `isFeatureRequest` function.
        - ADD a `case` for your new tool in the `handleFeatureRequest` function to call your logic. Parse arguments using the Zod schema.
7.  **Update Server**: No changes usually needed in [`src/server.ts`](src/server.ts:1) if the feature module is already registered. The feature's `tool-definitions.ts` and `handleFeatureRequest` will be picked up.
8.  **Add Tests**: CREATE `[new-tool-name]/feature.spec.unit.ts` and `[new-tool-name]/feature.spec.int.ts`.

### Adding a New Feature Module (e.g., for a new Azure DevOps Service Area)
1.  **Create Feature Directory**: CREATE `src/features/[new-feature-module-name]/`.
2.  **Implement Tools**: Follow "Adding a New Tool" steps above for each tool within this new feature module. This includes creating `schemas.ts`, `tool-definitions.ts`, `types.ts` (if needed), and subdirectories for each tool's `feature.ts`.
3.  **Create Feature Index**: CREATE `src/features/[new-feature-module-name]/index.ts`.
    - EXPORT all schemas, types, tool logic functions.
    - EXPORT the `[new-feature-module-name]Tools` array from `tool-definitions.ts`.
    - CREATE and EXPORT `is[NewFeatureModuleName]Request` (e.g., `isMyNewFeatureRequest`) type guard.
    - CREATE and EXPORT `handle[NewFeatureModuleName]Request` (e.g., `handleMyNewFeatureRequest`) request handler function.
4.  **Register Feature in Server**:
    - In [`src/server.ts`](src/server.ts:1):
        - IMPORT `[new-feature-module-name]Tools`, `is[NewFeatureModuleName]Request`, and `handle[NewFeatureModuleName]Request` from your new feature's `index.ts`.
        - ADD `...[new-feature-module-name]Tools` to the `tools` array in the `ListToolsRequestSchema` handler.
        - ADD an `if (is[NewFeatureModuleName]Request(request)) { return await handle[NewFeatureModuleName]Request(connection, request); }` block in the `CallToolRequestSchema` handler.
5.  **Add Tests**: Ensure comprehensive tests for the new feature module.

## 5. Framework/Plugin/Third-party Library Usage Standards

- **`@modelcontextprotocol/sdk`**:
    - USE `Server` class from `@modelcontextprotocol/sdk/server/index.js` to create the MCP server ([`src/server.ts`](src/server.ts:1)).
    - USE `StdioServerTransport` for transport ([`src/index.ts`](src/index.ts:1)).
    - USE schema types like `CallToolRequestSchema` from `@modelcontextprotocol/sdk/types.js`.
    - DEFINE tools as `ToolDefinition[]` (see `src/shared/types/tool-definition.ts` and feature `tool-definitions.ts` files).
- **`azure-devops-node-api`**:
    - This is the primary library for Azure DevOps interactions.
    - OBTAIN `WebApi` connection object via `getConnection()` from [`src/server.ts`](src/server.ts:1) or `AzureDevOpsClient` from `src/shared/auth/client-factory.ts`.
    - USE specific APIs from the connection (e.g., `connection.getCoreApi()`, `connection.getWorkItemTrackingApi()`).
- **`@azure/identity`**:
    - Used for Azure authentication (e.g., `DefaultAzureCredential`).
    - Primarily abstracted via `AzureDevOpsClient` in `src/shared/auth/`. PREFER using this abstraction.
- **`zod`**:
    - USE for all input/output schema definition and validation.
    - DEFINE schemas in `src/features/[feature-name]/schemas.ts`.
    - USE `z.object({...})`, `z.string()`, `z.boolean()`, etc.
    - USE `.optional()`, `.default()`, `.describe()` for schema fields.
- **`zod-to-json-schema`**:
    - USE to convert Zod schemas to JSON schemas for MCP `inputSchema` in `tool-definitions.ts`.
- **`dotenv`**:
    - Used in [`src/index.ts`](src/index.ts:1) to load environment variables from a `.env` file.
- **Jest**:
    - Test files co-located with source files or in feature-specific `__test__` directories.
    - Configuration in `jest.unit.config.js`, `jest.int.config.js`, `jest.e2e.config.js`.
- **ESLint/Prettier**: See "Code Standards".

## 6. Workflow Standards

### Development Workflow
1.  **Branch**: CREATE or CHECKOUT a feature/bugfix branch from `main` (or relevant development branch).
2.  **Implement**: WRITE code and corresponding tests.
3.  **Test**:
    - RUN unit tests: `npm run test:unit`.
    - RUN integration tests: `npm run test:int`.
    - RUN E2E tests: `npm run test:e2e`.
    - Or run all tests: `npm test`.
    - ENSURE all tests pass.
4.  **Lint & Format**:
    - RUN `npm run lint` (or `npm run lint:fix`). RESOLVE all issues.
    - RUN `npm run format`.
5.  **Commit**:
    - USE Conventional Commits specification (e.g., `feat: ...`, `fix: ...`).
    - RECOMMENDED: Use `npm run commit` (uses `cz-conventional-changelog`) for guided commit messages.
6.  **Pull Request**: PUSH branch and CREATE Pull Request against `main` (or relevant development branch).

### NPM Scripts (from [`package.json`](package.json:1))
- `build`: `tsc` (Compiles TypeScript to `dist/`).
- `dev`: `ts-node-dev --respawn --transpile-only src/index.ts` (Runs server in development with auto-restart).
- `start`: `node dist/index.js` (Runs compiled server).
- `inspector`: `npm run build && npx @modelcontextprotocol/inspector node dist/index.js` (Runs server with MCP Inspector).
- `test:unit`, `test:int`, `test:e2e`, `test`: Run respective test suites.
- `lint`, `lint:fix`: Run ESLint.
- `format`: Run Prettier.
- `prepare`: `husky install` (Sets up Git hooks).
- `commit`: `cz` (Interactive commitizen).

### CI/CD
- No explicit CI/CD pipeline configuration files (e.g., `azure-pipelines.yml`, `.github/workflows/`) were found in the file listing. If added, **REFER** to them.

## 7. Key File Interaction Standards

- **Adding/Modifying a Tool**:
    - TOUCH `src/features/[feature-name]/[tool-name]/feature.ts` (logic).
    - TOUCH `src/features/[feature-name]/schemas.ts` (Zod schema).
    - TOUCH `src/features/[feature-name]/tool-definitions.ts` (MCP tool definition).
    - TOUCH `src/features/[feature-name]/index.ts` (export logic, update request handler and guard).
    - TOUCH corresponding `*.spec.unit.ts` and `*.spec.int.ts` files.
- **Adding a New Feature Module**:
    - CREATE files within `src/features/[new-feature-module-name]/` as per "Functionality Implementation Standards".
    - MODIFY [`src/server.ts`](src/server.ts:1) to import and register the new feature module's tools and handlers.
- **Configuration Changes**:
    - Environment variables: Managed via `.env` file (loaded by `dotenv` in [`src/index.ts`](src/index.ts:1)).
    - TypeScript config: [`tsconfig.json`](tsconfig.json:1).
    - Linting config: [`.eslintrc.json`](.eslintrc.json:1).
- **Dependency Management**:
    - MODIFY [`package.json`](package.json:1) to add/update dependencies.
    - RUN `npm install` or `npm ci`.
- **Documentation**:
    - `docs/` directory is currently empty. If project documentation is added (e.g., `docs/feature-x.md`), **UPDATE** it when the corresponding feature `src/features/feature-x/` is modified.
    - [`README.md`](README.md:0): UPDATE for significant high-level changes.

## 8. AI Decision-making Standards

### When Adding a New Azure DevOps API Interaction:
1.  **Goal**: To expose a new Azure DevOps API endpoint as an MCP tool.
2.  **Decision: New or Existing Feature?**
    - IF the API relates to an existing service area (e.g., adding a new work item query type to `work-items` feature), MODIFY the existing feature module.
    - ELSE (e.g., interacting with Azure DevOps Audit Logs, a new service area), CREATE a new feature module. (See "Functionality Implementation Standards").
3.  **Pattern Adherence**:
    - FOLLOW the established pattern:
        - `src/features/[feature]/[tool]/feature.ts` for logic.
        - `src/features/[feature]/schemas.ts` for Zod schemas.
        - `src/features/[feature]/tool-definitions.ts` for MCP tool definitions.
        - `src/features/[feature]/index.ts` for feature-level exports, request guard (`isFeatureRequest`), and request handler (`handleFeatureRequest`).
    - **Example**: To add `get_pipeline_run_logs` to `pipelines` feature:
        - CREATE `src/features/pipelines/get-pipeline-run-logs/feature.ts`.
        - ADD `GetPipelineRunLogsSchema` to `src/features/pipelines/schemas.ts`.
        - ADD `get_pipeline_run_logs` definition to `src/features/pipelines/tool-definitions.ts`.
        - UPDATE `src/features/pipelines/index.ts` to export the new function, add to `isPipelinesRequest`, and handle in `handlePipelinesRequest`.
4.  **Error Handling**:
    - ALWAYS use custom error classes from `src/shared/errors/azure-devops-errors.ts` (e.g., `AzureDevOpsResourceNotFoundError`).
    - WRAP external API calls in try/catch blocks.
    - USE `handleResponseError` from `src/shared/errors/handle-request-error.ts` in the top-level request handler in [`src/server.ts`](src/server.ts:1) (already done for existing features). Feature-specific handlers should re-throw custom errors.
5.  **Testing**:
    - ALWAYS write unit tests for the new logic in `[tool-name]/feature.spec.unit.ts`.
    - ALWAYS write integration tests (NEVER mocking anything) in `[tool-name]/feature.spec.int.ts`. Prefer integration tests over unit tests.

### When Modifying Existing Functionality:
1.  **Identify Impact**: DETERMINE all files affected by the change (logic, schemas, tool definitions, tests, potentially documentation).
2.  **Maintain Consistency**: ENSURE changes are consistent with existing patterns within that feature module.
3.  **Update Tests**: MODIFY existing tests or ADD new ones to cover the changes. ENSURE all tests pass.
4.  **Version Bumping**: For significant changes, consider if a version bump in [`package.json`](package.json:1) is warranted (usually handled by `release-please`).

## 9. Prohibited Actions

- **DO NOT** include general development knowledge or LLM-known facts in this `shrimp-rules.md` document. This document is for project-specific operational rules for AI.
- **DO NOT** explain project functionality in terms of *what it does for an end-user*. Focus on *how to modify or add to it* for an AI developer.
- **DO NOT** use `any` type implicitly. [`tsconfig.json`](tsconfig.json:1) enforces `noImplicitAny: true`. [`.eslintrc.json`](.eslintrc.json:1) warns on explicit `any` (`@typescript-eslint/no-explicit-any: "warn"`), except in unit tests. MINIMIZE explicit `any`.
- **DO NOT** bypass linting (`npm run lint`) or formatting (`npm run format`) checks. Code MUST adhere to these standards.
- **DO NOT** commit code that fails tests (`npm test`).
- **DO NOT** implement custom Azure DevOps authentication logic. USE the provided `AzureDevOpsClient` from `src/shared/auth/`.
- **DO NOT** hardcode configuration values (like PATs, Org URLs, Project IDs). These should come from environment variables (see [`src/index.ts`](src/index.ts:1) `getConfig` and `src/utils/environment.ts`).
- **DO NOT** directly call Azure DevOps REST APIs if a corresponding function already exists in the `azure-devops-node-api` library or in shared project code (e.g., `src/shared/api/`).
- **DO NOT** modify files in `dist/` directory directly. This directory is auto-generated by `npm run build`.
- **DO NOT** ignore the `project-management/` directory for understanding architectural guidelines, but DO NOT replicate its content here.
- **DO NOT** use mocks within integration tests.