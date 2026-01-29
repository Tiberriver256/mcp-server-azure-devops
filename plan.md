# Plan: Azure DevOps Server + Services parity (audit-driven)

## Goal
- Support Azure DevOps Server 2022.2 + Azure DevOps Services across tools (where parity exists).
- Remove hardcoded service hosts where server parity is supported.
- Deterministic URL parsing for org/collection.
- Tests + docs.

## Scope
- Focus: URL/base construction + org/collection parsing for existing tools.
- Non-goals: adding new API areas.
- Services-only endpoints remain Services-only unless specs show Server support.

---

## Status (implemented)
- [x] Shared URL parsing + base URL builders
  - `src/shared/azure-devops-url.ts` (`resolveAzureDevOpsBaseUrls`, `isAzureDevOpsServicesUrl`)
  - Unit tests: `src/shared/azure-devops-url.spec.unit.ts`
- [x] Search tools support Services + Server base URL construction
  - `src/features/search/*/feature.ts` uses `resolveAzureDevOpsBaseUrls`
  - Unit tests cover services + server URL building
- [x] Wiki client uses resolved base URLs (no hardcoded `dev.azure.com`)
  - `src/clients/azure-devops.ts`
  - Unit test: `src/clients/azure-devops.spec.unit.ts`
- [x] Services-only endpoints fail fast on Server URLs
  - `get_me` + `list_organizations` use `isAzureDevOpsServicesUrl`
- [x] Auth guard: Azure DevOps Server requires PAT
  - `src/shared/auth/auth-factory.ts`
  - Unit test: `src/shared/auth/auth-factory.spec.unit.ts`

## TDD slice completed (Jan 2026)
- [x] Fix schema/runtime mismatch for `search_code`
  - Problem: `SearchCodeSchema` injected placeholder defaults (`"no default project"`, `"unknown-organization"`) which bypassed runtime validation.
  - RED: added unit tests that fail when schema injects placeholders
    - `src/features/search/schemas.spec.unit.ts`
  - GREEN: removed `SearchCodeSchema.transform(...)` default injection
    - `src/features/search/schemas.ts`

---

## Spec baseline (Search Server 7.1)
- Source: `/tmp/vsts-rest-api-specs/specification/search/azure-devops-server-7.1/search-onprem.json`
- Required query param: `api-version=7.1`
- Base shape: `https://{instance}/{collection}/...` (instance may include `/tfs`)
- Paths:
  - `POST /{collection}/{project}/_apis/search/codesearchresults`
  - `POST /{collection}/{project}/_apis/search/wikisearchresults`
  - `POST /{collection}/{project}/_apis/search/workitemsearchresults`

---

## Decisions (still open)
1) Org-wide search for Services
   - Current behavior:
     - `search_code`: project-scoped (required unless env default project is set)
     - `search_wiki`, `search_work_items`: org-wide allowed on Services, project required on Server
   - Decide whether to keep as-is (recommended) or enforce project everywhere.

2) `organizationId` input
   - Current behavior: treated as an optional override for Services organization (and as a collection override for Server when needed).
   - Decide whether to keep, rename (docs), or deprecate.

3) Server URL includes trailing `{project}`
   - Current behavior: parsing is unambiguous when `projectId` is provided; otherwise `{project}` can be misinterpreted as `{collection}`.
   - Decide whether to add a tolerance mode for project-level Server URLs (heuristic-based) or require collection-level URLs.

---

## Next work (TDD slices)

### Slice A: Documentation parity
- [x] GREEN:
  - Updated docs to include Azure DevOps Server URL examples (collection-level) and clarify search base URL differences.
  - Targets:
    - `docs/tools/search.md`
- Notes:
  - No docs-test harness in this repo; validated manually.

### Slice B: Cross-tool audit for hardcoded hosts
- RED:
  - Add unit tests for any tool that still constructs URLs manually.
- GREEN:
  - Run audit: `rg -n "dev\.azure\.com|visualstudio\.com|almsearch\.dev\.azure\.com|vssps\.dev\.azure\.com" src`
  - Replace hardcoded bases with `resolveAzureDevOpsBaseUrls` where Server parity is expected.

### Slice C: Optional tolerance for project-level Server URLs (if we choose to support)
- RED:
  - Add parser tests for `https://ado.local/tfs/DefaultCollection/ProjectX` *without* providing `projectId`.
- GREEN:
  - Update `resolveAzureDevOpsBaseUrls` heuristics (careful: multi-segment virtual dirs can make this ambiguous).
- REFACTOR:
  - Consolidate error messages + docs.

---

## Testing strategy
- Default: unit tests with fakes/mocks (no live Server instance required).
- Integration tests: env-gated; optional if a real Services org is available.
- For flaky search pagination behavior, prefer deterministic `orderBy` in tests.
