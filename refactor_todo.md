# List Tools Refactoring Task List

This document tracks the progress of refactoring the list tools command from `server.ts` to individual feature modules.

## Setup Tasks

- [x] Create the shared interface file `src/shared/types/tool-definition.ts`

## Feature Module Updates

Add tool definition exports to each feature module:

- [x] Work Items (`src/features/work-items/tool-definitions.ts`)
- [x] Projects (`src/features/projects/tool-definitions.ts`)
- [x] Repositories (`src/features/repositories/tool-definitions.ts`)
- [x] Organizations (`src/features/organizations/tool-definitions.ts`)
- [x] Search (`src/features/search/tool-definitions.ts`)
- [x] Users (`src/features/users/tool-definitions.ts`)
- [x] Pull Requests (`src/features/pull-requests/tool-definitions.ts`)
- [x] Pipelines (`src/features/pipelines/tool-definitions.ts`)
- [x] Wikis (`src/features/wikis/tool-definitions.ts`)

## Server Updates

- [x] Update `server.ts` to import tool definition constants
- [x] Modify the ListTools request handler to use the imported constants
- [x] Remove redundant schema imports from `server.ts`

## Testing

- [x] Run existing tests to verify functionality
  ```bash
  npm test
  ```

## Verification

- [x] Manually verify that all tools are correctly listed in the response
- [x] Check that the order of tools in the list is maintained (if order matters)
- [x] Ensure no functionality is broken

## Completion Checklist

- [x] All feature modules export their tools
- [x] Server.ts uses the exported tool definitions
- [x] All tests pass
- [x] No redundant imports remain in server.ts
- [x] Code is clean and well-documented
