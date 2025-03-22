# Testing Setup Guide

## Environment Variables

Tests that interact with Azure DevOps APIs (integration and e2e tests) require environment variables to run properly. These variables are automatically loaded from your `.env` file during test execution.

Required variables:
```
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
AZURE_DEVOPS_PAT=your-personal-access-token
AZURE_DEVOPS_DEFAULT_PROJECT=your-project-name
```

## Test Structure

Tests in this project are co-located with the code they're testing:

```
src/
  features/
    feature-name/
      feature.ts
      feature.spec.unit.ts   # Unit tests
      feature.spec.int.ts    # Integration tests
```

E2E tests are only located at the server level:

```
src/
  server.ts
  server.spec.e2e.ts   # E2E tests
```

## Import Pattern

We use path aliases to make imports cleaner and easier to maintain. Instead of relative imports like:

```typescript
import { someFunction } from '../../../../shared/utils';
```

You can use the `@/` path alias:

```typescript
import { someFunction } from '@/shared/utils';
```

### Test Helpers

Test helpers are located in a centralized location for all tests:

```typescript
import { getTestConnection, shouldSkipIntegrationTest } from '@/shared/test/test-helpers';
```

## Running Tests

- Unit tests: `npm run test:unit`
- Integration tests: `npm run test:int`
- E2E tests: `npm run test:e2e`
- All tests: `npm test`

## VSCode Integration

The project includes VSCode settings that:

1. Show proper test icons for `*.spec.*.ts` files
2. Enable file nesting to group test files with their implementation
3. Configure TypeScript to prefer path aliases over relative imports

These settings are stored in `.vscode/settings.json`. 