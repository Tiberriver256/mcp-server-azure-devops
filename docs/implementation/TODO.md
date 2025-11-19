# Implementation TODO: Domain Filtering + Read-Only Mode

**Timeline:** 2-3 days | **Approach:** TDD (E2E-first) | **Target:** 70-95% tool reduction

## Setup

- [ ] Create feature branch: `feat/domain-filtering-read-only-mode`
- [ ] Ensure tests run: `npm test`
- [ ] Review research: `docs/research/SUMMARY.md`

---

## Phase 1: Domain Filtering (Day 1-2)

### 1.1 Domain Types & Manager

- [ ] Create `src/shared/domains/types.ts`
  - [ ] Define `Domain` enum (core, work-items, repositories, pull-requests, pipelines, wikis, search)
  - [ ] Export `ALL_DOMAINS` constant
  - [ ] Write unit tests ✓ RED → GREEN → REFACTOR

- [ ] Create `src/shared/domains/domains-manager.ts`
  - [ ] Implement `DomainsManager` class
  - [ ] Parse single domain: `'core'` → `['core']`
  - [ ] Parse multiple: `'core work-items'` → `['core', 'work-items']`
  - [ ] Parse comma-separated: `'core,work-items'` → `['core', 'work-items']`
  - [ ] Default to all domains when undefined
  - [ ] Validate domain names (reject invalid, keep valid)
  - [ ] Write unit tests ✓ RED → GREEN → REFACTOR

- [ ] Create `src/shared/domains/index.ts`
  - [ ] Export types and manager

### 1.2 CLI Argument Parsing

- [ ] Update `src/index.ts`
  - [ ] Parse `--domains` argument from CLI
  - [ ] Handle space-separated: `--domains core work-items`
  - [ ] Handle comma-separated: `--domains core,work-items`
  - [ ] Create `DomainsManager` instance
  - [ ] Pass enabled domains to server
  - [ ] Log enabled domains to stderr
  - [ ] Write E2E tests ✓ RED → GREEN → REFACTOR

### 1.3 Server Tool Filtering

- [ ] Update `src/server.ts`
  - [ ] Add `enabledDomains?: Set<string>` parameter to `createAzureDevOpsServer()`
  - [ ] Create `shouldInclude(domain)` helper function
  - [ ] Conditionally register core domain tools (4 tools)
  - [ ] Conditionally register work-items domain tools (5 tools)
  - [ ] Conditionally register repositories domain tools (9 tools)
  - [ ] Conditionally register pull-requests domain tools (7 tools)
  - [ ] Conditionally register pipelines domain tools (8 tools)
  - [ ] Conditionally register wikis domain tools (6 tools)
  - [ ] Conditionally register search domain tools (3 tools)
  - [ ] Write E2E tests ✓ RED → GREEN → REFACTOR

### 1.4 E2E Test Suite

- [ ] Create `src/features/domains/domain-filtering.spec.e2e.ts`
  - [ ] Test: Default loads all 43 tools
  - [ ] Test: `--domains core` loads 4 tools
  - [ ] Test: `--domains work-items` loads 5 tools
  - [ ] Test: `--domains repositories` loads 9 tools
  - [ ] Test: `--domains core work-items` loads 9 tools
  - [ ] Test: Invalid domain falls back to all
  - [ ] Test: Mixed valid/invalid loads only valid
  - [ ] Test: Tool execution works with filtering
  - [ ] All tests pass ✓

### 1.5 Verification

- [ ] Run `npm run test:unit` - all pass
- [ ] Run `npm run test:e2e` - all pass
- [ ] Run `npm test` - all pass
- [ ] Verify tool counts match expected values
- [ ] Check backward compatibility (existing tests pass)
- [ ] Commit: `feat: add domain-based filtering for tools`

---

## Phase 2: Read-Only Mode (Day 2)

### 2.1 Tool Metadata

- [ ] Update `src/shared/types/tool-definition.ts`
  - [ ] Add `readOnly?: boolean` to `ToolDefinition` interface
  - [ ] Write unit tests ✓

### 2.2 Mark All Tools

- [ ] Update `src/features/organizations/tool-definitions.ts`
  - [ ] Mark `list_organizations` as `readOnly: true`

- [ ] Update `src/features/projects/tool-definitions.ts`
  - [ ] Mark `list_projects` as `readOnly: true`
  - [ ] Mark `get_project` as `readOnly: true`
  - [ ] Mark `get_project_details` as `readOnly: true`

- [ ] Update `src/features/users/tool-definitions.ts`
  - [ ] Mark `get_me` as `readOnly: true`

- [ ] Update `src/features/work-items/tool-definitions.ts`
  - [ ] Mark `list_work_items` as `readOnly: true`
  - [ ] Mark `get_work_item` as `readOnly: true`
  - [ ] Mark `create_work_item` as `readOnly: false`
  - [ ] Mark `update_work_item` as `readOnly: false`
  - [ ] Mark `manage_work_item_link` as `readOnly: false`

- [ ] Update `src/features/repositories/tool-definitions.ts`
  - [ ] Mark all `list_*` and `get_*` as `readOnly: true`
  - [ ] Mark `create_branch` as `readOnly: false`
  - [ ] Mark `create_commit` as `readOnly: false`

- [ ] Update `src/features/pull-requests/tool-definitions.ts`
  - [ ] Mark `list_*` and `get_*` as `readOnly: true`
  - [ ] Mark `create_*`, `update_*`, `add_*` as `readOnly: false`

- [ ] Update `src/features/pipelines/tool-definitions.ts`
  - [ ] Mark all `list_*` and `get_*` as `readOnly: true`
  - [ ] Mark `trigger_pipeline` as `readOnly: false`

- [ ] Update `src/features/wikis/tool-definitions.ts`
  - [ ] Mark `list_*` and `get_*` as `readOnly: true`
  - [ ] Mark `create_*`, `update_*` as `readOnly: false`

- [ ] Update `src/features/search/tool-definitions.ts`
  - [ ] Mark all search tools as `readOnly: true`

### 2.3 CLI Argument Parsing

- [ ] Update `src/index.ts`
  - [ ] Parse `--read-only` flag from CLI
  - [ ] Pass `readOnlyMode` to server
  - [ ] Log read-only mode status to stderr
  - [ ] Write E2E tests ✓

### 2.4 Server Read-Only Filtering

- [ ] Update `src/server.ts`
  - [ ] Add `readOnlyMode = false` parameter to `createAzureDevOpsServer()`
  - [ ] After domain filtering, filter tools by `readOnly === true` if mode enabled
  - [ ] Write E2E tests ✓

### 2.5 E2E Test Suite

- [ ] Create `src/features/domains/read-only-mode.spec.e2e.ts`
  - [ ] Test: Default loads all 43 tools (read-only disabled)
  - [ ] Test: `--read-only` loads 20-25 tools
  - [ ] Test: Read-only includes list/get tools
  - [ ] Test: Read-only excludes create/update/delete tools
  - [ ] Test: Tool execution works in read-only mode
  - [ ] All tests pass ✓

### 2.6 Combined Filtering Tests

- [ ] Create `src/features/domains/integration.spec.e2e.ts`
  - [ ] Test: `--domains work-items --read-only` loads 2 tools (95% reduction)
  - [ ] Test: `--domains core repositories --read-only` loads 6-8 tools (84% reduction)
  - [ ] Test: All combinations work correctly
  - [ ] All tests pass ✓

### 2.7 Verification

- [ ] Run `npm run test:unit` - all pass
- [ ] Run `npm run test:e2e` - all pass
- [ ] Run `npm test` - all pass
- [ ] Verify tool counts: Default=43, --read-only=20-25, combined=2
- [ ] Check backward compatibility
- [ ] Commit: `feat: add read-only mode for safe tool filtering`

---

## Phase 3: Documentation & Polish (Day 3)

### 3.1 Update README.md

- [ ] Add "Domain Filtering" section with examples
- [ ] Add "Read-Only Mode" section with examples
- [ ] Add "Tool Reduction Examples" table
- [ ] Add combined usage example
- [ ] Commit: `docs: add domain filtering and read-only mode usage`

### 3.2 Update Tool Documentation

- [ ] Update `docs/tools/README.md`
  - [ ] Add "Tools by Domain" section
  - [ ] List tools for each domain
  - [ ] Mark read-only vs write operations
  - [ ] Commit: `docs: categorize tools by domain and operation type`

### 3.3 Final Testing

- [ ] Run full test suite: `npm test`
- [ ] Test manually:
  - [ ] `npm run start` - loads all 43 tools
  - [ ] `npm run start -- --domains work-items` - loads 5 tools
  - [ ] `npm run start -- --read-only` - loads ~22 tools
  - [ ] `npm run start -- --domains work-items --read-only` - loads 2 tools
- [ ] Verify no regressions
- [ ] Check code coverage maintained

### 3.4 Code Review

- [ ] Run `npm run lint` - no errors
- [ ] Run `npm run format` - code formatted
- [ ] Review all changes
- [ ] Ensure consistent code style
- [ ] Verify error handling
- [ ] Check edge cases

---

## Final Steps

- [ ] Create pull request
- [ ] Reference research: `docs/research/tool-loading-strategies.md`
- [ ] Reference implementation plan: `docs/implementation/domain-filtering-tdd-plan.md`
- [ ] Request code review
- [ ] Address feedback
- [ ] Merge to main

---

## Success Criteria

✅ All 43 tools load by default (backward compatible)  
✅ Domain filtering reduces tools by 50-90%  
✅ Read-only mode reduces tools by 30-50%  
✅ Combined filtering achieves 70-95% reduction  
✅ All tests pass (unit + E2E + integration)  
✅ Zero breaking changes  
✅ Documentation complete  

---

## Quick Commands

```bash
# Run tests
npm run test:unit -- --watch
npm run test:e2e
npm test

# Build
npm run build

# Lint & format
npm run lint
npm run format

# Manual testing
npm run start -- --domains work-items
npm run start -- --read-only
npm run start -- --domains work-items --read-only
```

---

## Expected Tool Counts

| Configuration | Tools |
|---------------|-------|
| Default | 43 |
| `--domains core` | 4 |
| `--domains work-items` | 5 |
| `--domains work-items --read-only` | 2 |
| `--read-only` | 20-25 |

---

**Reference:** See `docs/implementation/domain-filtering-tdd-plan.md` for detailed specifications
