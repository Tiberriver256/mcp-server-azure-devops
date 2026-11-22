# Test Plans & Test Suites Tools

Tools for managing Azure DevOps **Test Plans**, **Test Suites**, and **Test Case** authoring/attachment on both Azure DevOps Services (cloud) and Azure DevOps Server (on-premises, 2020+).

> **Permissions & Licensing:** Reading test plans and suites requires Test Management (Read) (`vso.test`). Creating/modifying plans, suites, or suite memberships requires Test Management (Read & Write) (`vso.test_write`) and a **Basic + Test Plans** (or Visual Studio Enterprise) license. Creating Test Case work items requires Work Items (Read & Write) (`vso.work_write`).

## Available Tools

- `list_test_plans` — List test plans in a project with optional `owner`, `filterActivePlans`, `includePlanDetails`, and `continuationToken` pagination.
- `get_test_plan` — Get a test plan by `planId` (includes `rootSuite.id`).
- `create_test_plan` — Create a new test plan (`name`, optional `iteration`, `areaPath`, `description`, `startDate`, `endDate`, `state`, `ownerId`, `buildId`).
- `list_test_suites` — List suites under a plan (`planId`, optional `expand`, `asTreeView`, `continuationToken`).
- `get_test_suite` — Get a specific suite (`planId`, `suiteId`, optional `expand`).
- `create_test_suite` — Create a `staticTestSuite`, `requirementTestSuite` (requires `requirementId`), or `dynamicTestSuite` (requires `queryString`). Automatically resolves the plan's `rootSuite.id` when `parentSuiteId` is omitted.
- `list_suite_test_cases` — List test cases linked to a suite (`planId`, `suiteId`, optional `testIds`, `configurationIds`, `witFields`, `expand`, `isRecursive`, `continuationToken`).
- `add_test_cases_to_suite` — Attach existing Test Case work item IDs to a static or requirement-based suite (with optional `configurationIds`).
- `remove_test_cases_from_suite` — Detach Test Case work item IDs from a static suite (does **not** delete the underlying Test Case work items).
- `create_test_case` — Create a `Test Case` work item with structured `steps` (encoded as `Microsoft.VSTS.TCM.Steps` XML), optional `requirementId` (`Microsoft.VSTS.Common.TestedBy-Reverse` link), and optional `planId` + `suiteId` to attach immediately.
