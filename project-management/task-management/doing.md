## Current Tasks In Progress

- [ ] **Task 1.0**: Reorganize repository structure around "Screaming Architecture" and "Vertical Slices"

  - **Role**: Software Architect, Full-Stack Developer
  - **Phase**: Implementation
  - **Description**: Refactor directory structure to emphasize business domains rather than technical layers, group related functionality into feature-based modules, ensure each vertical slice contains all necessary components, and update imports and references across the codebase.
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

    - **Next Steps**:
      - Fix import paths in remaining test files:
        - Update paths in server and misc test files
        - Fix errors in tests referencing old directories (operations, common, etc.)
        - Fix test files that have resetTime/resetAt property mismatch in errors
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
    - [ ] Fix remaining test issues:
      - [ ] Update import paths in the remaining test files:
        - [ ] Update auth related test files
        - [ ] Update server-client.test.ts and api-errors.test.ts
        - [ ] Update feature tests/operations.test.ts files
        - [ ] Update server.test.ts
      - [ ] Fix resetTime/resetAt property issues in error tests
      - [ ] Fix integration tests with valid credentials
    - [ ] Ensure all tests pass after refactoring

## Clean-up Tests and Test Structure

We have been refactoring the test structure to follow colocation patterns.

### Sub-tasks

- [x] Move unit tests to be co-located with implementation files
- [x] Fix coverage tests
- [x] Fixed list-work-items operations test imports
- [x] Update import paths in moved test files
- [x] Delete empty directories and test files (tests/unit)
- [x] Fix remaining test file import paths that are still using the old structure
- [ ] Fix src/shared/errors/api-errors.test.ts by co-locating it it breaking it apart
- [ ] Fix src/shared/server-coverage.test.ts by co-locating it or moving individual tests to the appropriate files
- [ ] Fix integration tests
- [ ] Ensure all tests pass after the refactoring

### Notes

We have made significant progress in cleaning up the test structure:

1. All the feature-based tests are now co-located with their implementation files
2. We've fixed the import paths for the list-work-items tests
3. Most of the tests are now passing successfully
4. We've removed the old tests/unit directory

The remaining tasks involve:

1. Fixing the integration tests that still fail with credential issues
2. Fixing a few remaining auth/api test files that have import issues
