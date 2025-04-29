# Refactoring Plan: Moving List Tools Command to Feature Modules

## Overview

Currently, the `server.ts` file is getting too large, and we've already completed a refactoring where tool handlers were moved to the index file of given features. This plan outlines how to do the same for the list tools command, where each feature will export a list of tools that gets expanded into the list tools response.

## Current Implementation

Currently, the list tools command is implemented in `server.ts` as follows:

1. The `server.ts` file imports all schemas from feature modules
2. The `ListToolsRequestSchema` handler is registered with a function that returns a hardcoded list of tools
3. Each tool in the list includes:
   - `name`: The name of the tool
   - `description`: A description of what the tool does
   - `inputSchema`: The JSON schema for the tool's input, generated using `zodToJsonSchema`

## Proposed Implementation

We'll refactor this to follow the same pattern used for the tool handlers:

1. Each feature module will export a constant array of its tools
2. The `server.ts` file will import these constants and combine them
3. This will make the codebase more modular and easier to maintain

## Detailed Steps

### 1. Create a Shared Interface for Tool Definitions

Create a new file `src/shared/types/tool-definition.ts` with an interface for tool definitions:

```typescript
/**
 * Represents a tool that can be listed in the ListTools response
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}
```

### 2. Update Each Feature Module to Export Its Tools

For each feature module (e.g., `src/features/work-items/index.ts`), add a new export constant:

```typescript
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import {
  ListWorkItemsSchema,
  CreateWorkItemSchema,
  UpdateWorkItemSchema,
  ManageWorkItemLinkSchema,
  GetWorkItemSchema,
} from './schemas';

/**
 * List of work items tools
 */
export const workItemsTools: ToolDefinition[] = [
  {
    name: 'list_work_items',
    description: 'List work items in a project',
    inputSchema: zodToJsonSchema(ListWorkItemsSchema),
  },
  {
    name: 'get_work_item',
    description: 'Get details of a specific work item',
    inputSchema: zodToJsonSchema(GetWorkItemSchema),
  },
  {
    name: 'create_work_item',
    description: 'Create a new work item',
    inputSchema: zodToJsonSchema(CreateWorkItemSchema),
  },
  {
    name: 'update_work_item',
    description: 'Update an existing work item',
    inputSchema: zodToJsonSchema(UpdateWorkItemSchema),
  },
  {
    name: 'manage_work_item_link',
    description: 'Add or remove links between work items',
    inputSchema: zodToJsonSchema(ManageWorkItemLinkSchema),
  },
];
```

Repeat this pattern for each feature module:
- `src/features/projects/index.ts`
- `src/features/repositories/index.ts`
- `src/features/organizations/index.ts`
- `src/features/search/index.ts`
- `src/features/users/index.ts`
- `src/features/pull-requests/index.ts`
- `src/features/pipelines/index.ts`
- `src/features/wikis/index.ts`

### 3. Update Server.ts to Use the New Exports

Modify `server.ts` to import and use the new tool definition constants:

```typescript
import { workItemsTools } from './features/work-items';
import { projectsTools } from './features/projects';
import { repositoriesTools } from './features/repositories';
import { organizationsTools } from './features/organizations';
import { searchTools } from './features/search';
import { usersTools } from './features/users';
import { pullRequestsTools } from './features/pull-requests';
import { pipelinesTools } from './features/pipelines';
import { wikisTools } from './features/wikis';

// ...

// Register the ListTools request handler
server.setRequestHandler(ListToolsRequestSchema, () => {
  // Combine tools from all features
  const tools = [
    ...usersTools,
    ...organizationsTools,
    ...projectsTools,
    ...repositoriesTools,
    ...workItemsTools,
    ...searchTools,
    ...pullRequestsTools,
    ...pipelinesTools,
    ...wikisTools,
  ];

  return { tools };
});
```

### 4. Remove Redundant Imports from Server.ts

After implementing the above changes, we can remove the redundant schema imports from `server.ts`:

- Remove imports of individual schemas (e.g., `ListWorkItemsSchema`, `GetProjectSchema`, etc.)
- Keep only the imports for the tool definition constants and request handler functions

### 5. Verify with Existing Tests

After implementing the changes, run the existing tests to verify that nothing was broken:

```bash
npm test
```

No new tests should be needed for this refactoring as we're just reorganizing the code structure without changing functionality.

## Benefits

This refactoring will:

1. Make `server.ts` smaller and more maintainable
2. Keep tool definitions closer to their implementation
3. Make it easier to add new tools to existing features
4. Follow the same pattern used for tool handlers
5. Improve code organization and modularity

## Implementation Order

1. Create the shared interface
2. Update one feature module at a time, starting with simpler ones
3. Update `server.ts` to use the new exports
4. Remove redundant imports from `server.ts`
5. Run existing tests to verify functionality

## Potential Challenges

- Ensuring all tools are correctly included in the list
- Maintaining the correct order of tools in the list (if order matters)
- Ensuring the refactoring doesn't break existing functionality

## Conclusion

This refactoring follows the same pattern used for tool handlers, moving the list tools command functionality from `server.ts` to individual feature modules. Each feature will export a constant array of tools that gets expanded into the list tools response, making the codebase more modular and easier to maintain.
