# Test Plans & Test Suites Tools

Tools for managing Azure DevOps **Test Plans**, **Test Suites**, and **Test Case** authoring/attachment on both Azure DevOps Services (cloud) and Azure DevOps Server (on-premises, 2020+).

> **Permissions & Licensing:** Reading test plans and suites requires Test Management (Read) (`vso.test`). Creating/modifying plans, suites, or suite memberships requires Test Management (Read & Write) (`vso.test_write`) and a **Basic + Test Plans** (or Visual Studio Enterprise) license. Creating Test Case work items requires Work Items (Read & Write) (`vso.work_write`).

## list_test_plans

Lists test plans in a project with optional filtering and continuation-token pagination.

### Parameters

| Parameter            | Type    | Required | Description                                                                 |
| -------------------- | ------- | -------- | --------------------------------------------------------------------------- |
| `projectId`          | string  | No       | Project ID or name (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`)             |
| `owner`              | string  | No       | Filter by plan owner display name, email, or identity ID                    |
| `filterActivePlans`  | boolean | No       | Return only active test plans                                               |
| `includePlanDetails` | boolean | No       | Include full plan details (area path, iteration, dates, root suite)         |
| `continuationToken`  | string  | No       | Continuation token returned from a previous page                            |

### Response

Returns `{ testPlans: TestPlan[], continuationToken?: string }`.

## get_test_plan

Retrieves a single test plan by ID, including `rootSuite.id`.

### Parameters

| Parameter   | Type    | Required | Description                                                     |
| ----------- | ------- | -------- | --------------------------------------------------------------- |
| `planId`    | integer | Yes      | Positive integer ID of the test plan                            |
| `projectId` | string  | No       | Project ID or name (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`) |

### Response

Returns the `TestPlan` object.

## create_test_plan

Creates a new test plan in a project.

### Parameters

| Parameter     | Type    | Required | Description                                                                               |
| ------------- | ------- | -------- | ----------------------------------------------------------------------------------------- |
| `name`        | string  | Yes      | Name of the new test plan                                                                 |
| `projectId`   | string  | No       | Project ID or name (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`)                           |
| `iteration`   | string  | No       | Iteration path for the test plan                                                          |
| `areaPath`    | string  | No       | Area path for the test plan                                                               |
| `description` | string  | No       | Description of the test plan                                                              |
| `startDate`   | string  | No       | Strict ISO 8601 start date (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ssZ`)                       |
| `endDate`     | string  | No       | Strict ISO 8601 end date (must be on or after `startDate`)                                |
| `state`       | string  | No       | Initial plan state (e.g., `"Active"`, `"Inactive"`)                                       |
| `ownerId`     | string  | No       | Identity ID (GUID) of the plan owner                                                      |
| `buildId`     | integer | No       | Associated build ID                                                                       |

### Response

Returns the created `TestPlan` object (including its auto-created `rootSuite`).

## list_test_suites

Lists test suites under a test plan (flat list or hierarchical tree).

### Parameters

| Parameter           | Type    | Required | Description                                                                 |
| ------------------- | ------- | -------- | --------------------------------------------------------------------------- |
| `planId`            | integer | Yes      | Test plan ID                                                                |
| `projectId`         | string  | No       | Project ID or name (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`)             |
| `expand`            | string  | No       | Expansion mode: `"none"`, `"children"`, or `"defaultTesters"`               |
| `asTreeView`        | boolean | No       | Return suites as a nested hierarchy rather than a flat list                 |
| `continuationToken` | string  | No       | Continuation token for pagination                                           |

### Response

Returns `{ testSuites: TestSuite[], continuationToken?: string }`.

## get_test_suite

Retrieves a specific test suite by plan ID and suite ID.

### Parameters

| Parameter   | Type    | Required | Description                                                     |
| ----------- | ------- | -------- | --------------------------------------------------------------- |
| `planId`    | integer | Yes      | Test plan ID                                                    |
| `suiteId`   | integer | Yes      | Test suite ID                                                   |
| `projectId` | string  | No       | Project ID or name (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`) |
| `expand`    | string  | No       | Expansion mode: `"none"`, `"children"`, or `"defaultTesters"`   |

### Response

Returns the `TestSuite` object.

## create_test_suite

Creates a static, requirement-based, or query-based test suite under a test plan. Automatically resolves the plan's `rootSuite.id` when `parentSuiteId` is omitted.

### Parameters

| Parameter                      | Type    | Required | Description                                                                                          |
| ------------------------------ | ------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `planId`                       | integer | Yes      | Test plan ID                                                                                         |
| `name`                         | string  | Yes      | Name of the new test suite                                                                           |
| `projectId`                    | string  | No       | Project ID or name (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`)                                      |
| `suiteType`                    | string  | No       | `"staticTestSuite"` (default), `"requirementTestSuite"`, or `"dynamicTestSuite"`                     |
| `parentSuiteId`                | integer | No       | Parent suite ID (defaults to the plan's root suite)                                                  |
| `requirementId`                | integer | No       | Requirement work item ID (required when `suiteType` is `"requirementTestSuite"`)                     |
| `queryString`                  | string  | No       | WIQL query (required when `suiteType` is `"dynamicTestSuite"`)                                       |
| `inheritDefaultConfigurations` | boolean | No       | Whether to inherit default test configurations from the parent suite                                 |

### Response

Returns the created `TestSuite` object.

## list_suite_test_cases

Lists test cases linked to a specific test suite.

### Parameters

| Parameter           | Type      | Required | Description                                                     |
| ------------------- | --------- | -------- | --------------------------------------------------------------- |
| `planId`            | integer   | Yes      | Test plan ID                                                    |
| `suiteId`           | integer   | Yes      | Test suite ID                                                   |
| `projectId`         | string    | No       | Project ID or name (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`) |
| `testIds`           | integer[] | No       | Filter by specific test case work item IDs                      |
| `configurationIds`  | integer[] | No       | Filter by configuration IDs                                     |
| `witFields`         | string[]  | No       | Additional work item fields to include                          |
| `expand`            | boolean   | No       | Expand test case details                                        |
| `isRecursive`       | boolean   | No       | Include test cases from child suites                            |
| `continuationToken` | string    | No       | Continuation token for pagination                               |

### Response

Returns `{ testCases: TestCase[], continuationToken?: string }`.

## add_test_cases_to_suite

Attaches existing Test Case work item IDs to a static or requirement-based test suite.

### Parameters

| Parameter          | Type      | Required | Description                                                     |
| ------------------ | --------- | -------- | --------------------------------------------------------------- |
| `planId`           | integer   | Yes      | Test plan ID                                                    |
| `suiteId`          | integer   | Yes      | Target test suite ID                                            |
| `testCaseIds`      | integer[] | Yes      | Non-empty array of Test Case work item IDs to attach            |
| `projectId`        | string    | No       | Project ID or name (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`) |
| `configurationIds` | integer[] | No       | Optional configuration IDs to associate with each point         |

### Response

Returns the updated suite test case assignments.

## remove_test_cases_from_suite

Detaches Test Case work item IDs from a static test suite (does **not** delete the underlying Test Case work items).

### Parameters

| Parameter     | Type      | Required | Description                                                     |
| ------------- | --------- | -------- | --------------------------------------------------------------- |
| `planId`      | integer   | Yes      | Test plan ID                                                    |
| `suiteId`     | integer   | Yes      | Static test suite ID                                            |
| `testCaseIds` | integer[] | Yes      | Non-empty array of Test Case work item IDs to detach            |
| `projectId`   | string    | No       | Project ID or name (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`) |

### Response

Returns `{ removedTestCaseIds, planId, suiteId }`.

## create_test_case

Creates a `Test Case` work item with structured `steps` (encoded as `Microsoft.VSTS.TCM.Steps` XML with sequential step IDs starting at 2), optional requirement linking (`Microsoft.VSTS.Common.TestedBy-Reverse`), and optional immediate attachment to a test suite.

### Parameters

| Parameter          | Type      | Required | Description                                                                                                  |
| ------------------ | --------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `title`            | string    | Yes      | Title of the new Test Case work item                                                                         |
| `projectId`        | string    | No       | Project ID or name (defaults to `AZURE_DEVOPS_DEFAULT_PROJECT`)                                              |
| `description`      | string    | No       | HTML description of the test case                                                                            |
| `steps`            | object[]  | No       | Ordered steps (`{ action: string, expectedResult?: string }[]`) encoded into `Microsoft.VSTS.TCM.Steps` XML  |
| `priority`         | integer   | No       | Priority (`1`–`4`)                                                                                           |
| `areaPath`         | string    | No       | Area path                                                                                                    |
| `iterationPath`    | string    | No       | Iteration path                                                                                               |
| `assignedTo`       | string    | No       | Assignee name or email                                                                                       |
| `tags`             | string[]  | No       | Tags to apply to the test case                                                                               |
| `requirementId`    | integer   | No       | Requirement work item ID to link via `TestedBy-Reverse`                                                      |
| `planId`           | integer   | No       | Test plan ID (must be provided together with `suiteId` to attach the created test case immediately)          |
| `suiteId`          | integer   | No       | Test suite ID (must be provided together with `planId`)                                                      |
| `configurationIds` | integer[] | No       | Optional configuration IDs when attaching to `planId`/`suiteId`                                              |

### Example Usage

```typescript
const result = await mcpClient.callTool('create_test_case', {
  projectId: 'MyProject',
  title: 'Verify login succeeds with valid PAT',
  priority: 1,
  steps: [
    { action: 'Configure valid PAT in environment' },
    { action: 'Call list_projects', expectedResult: 'Returns non-empty project list' },
  ],
  requirementId: 42,
  planId: 10,
  suiteId: 11,
});
```
