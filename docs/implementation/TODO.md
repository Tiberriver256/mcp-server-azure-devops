# Implementation TODO: Domain Filtering + Read-Only Mode

**Approach:** E2E Behavioral Tests → Implementation  
**Timeline:** 2-3 days

## Setup

- [ ] Create feature branch: `git checkout -b feat/domain-filtering-read-only-mode`
- [ ] Verify tests run: `npm test`

---

## Feature 1: Domain Filtering

### E2E Test 1: Default behavior (all tools loaded)

**Test File:** `src/server.spec.e2e.ts`

- [ ] **RED:** Write failing test
  ```typescript
  test('should load all 43 tools by default', async () => {
    const tools = await client.listTools();
    expect(tools.tools).toHaveLength(43);
  });
  ```

- [ ] **GREEN:** Make it pass
  - Verify current behavior already loads all tools

- [ ] Run test: `npm run test:e2e`

---

### E2E Test 2: Filter to single domain

**Test File:** `src/server.spec.e2e.ts`

- [ ] **RED:** Write failing test
  ```typescript
  test('should load only 5 tools when --domains work-items', async () => {
    // Start server with --domains work-items
    const client = await createClientWithArgs(['--domains', 'work-items']);
    const tools = await client.listTools();
    
    expect(tools.tools).toHaveLength(5);
    const names = tools.tools.map(t => t.name);
    expect(names).toContain('list_work_items');
    expect(names).not.toContain('list_repositories');
  });
  ```

- [ ] **GREEN:** Implement
  1. Create `src/shared/domains/types.ts` - Domain enum
  2. Create `src/shared/domains/domains-manager.ts` - Parse domains
  3. Update `src/index.ts` - Parse `--domains` CLI arg
  4. Update `src/server.ts` - Filter tools by domain

- [ ] Run test: `npm run test:e2e`

---

### E2E Test 3: Multiple domains

**Test File:** `src/server.spec.e2e.ts`

- [ ] **RED:** Write failing test
  ```typescript
  test('should load 9 tools when --domains core work-items', async () => {
    const client = await createClientWithArgs(['--domains', 'core', 'work-items']);
    const tools = await client.listTools();
    
    expect(tools.tools).toHaveLength(9);
  });
  ```

- [ ] **GREEN:** Verify implementation supports multiple domains

- [ ] Run test: `npm run test:e2e`

---

## Feature 2: Read-Only Mode

### E2E Test 4: Read-only filters write operations

**Test File:** `src/server.spec.e2e.ts`

- [ ] **RED:** Write failing test
  ```typescript
  test('should load only read operations when --read-only', async () => {
    const client = await createClientWithArgs(['--read-only']);
    const tools = await client.listTools();
    
    const names = tools.tools.map(t => t.name);
    expect(names).toContain('list_work_items');
    expect(names).toContain('get_work_item');
    expect(names).not.toContain('create_work_item');
    expect(names).not.toContain('update_work_item');
  });
  ```

- [ ] **GREEN:** Implement
  1. Add `readOnly?: boolean` to `ToolDefinition` type
  2. Mark all tools as `readOnly: true` or `readOnly: false`
  3. Update `src/index.ts` - Parse `--read-only` flag
  4. Update `src/server.ts` - Filter tools by readOnly flag

- [ ] Run test: `npm run test:e2e`

---

## Feature 3: Combined Filtering

### E2E Test 5: Domain + Read-only (95% reduction)

**Test File:** `src/server.spec.e2e.ts`

- [ ] **RED:** Write failing test
  ```typescript
  test('should load 2 tools when --domains work-items --read-only', async () => {
    const client = await createClientWithArgs(['--domains', 'work-items', '--read-only']);
    const tools = await client.listTools();
    
    expect(tools.tools).toHaveLength(2);
    const names = tools.tools.map(t => t.name);
    expect(names).toEqual(['list_work_items', 'get_work_item']);
  });
  ```

- [ ] **GREEN:** Verify both filters work together

- [ ] Run test: `npm run test:e2e`

---

## Documentation

- [ ] Update `README.md` with usage examples
- [ ] Add tool count table to README

---

## Final Verification

- [ ] All E2E tests pass: `npm run test:e2e`
- [ ] All tests pass: `npm test`
- [ ] Manual test: `npm run start` loads 43 tools
- [ ] Manual test: `npm run start -- --domains work-items` loads 5 tools
- [ ] Manual test: `npm run start -- --read-only` loads ~22 tools
- [ ] Manual test: `npm run start -- --domains work-items --read-only` loads 2 tools

---

## Commit & PR

- [ ] Commit: `feat: add domain filtering and read-only mode`
- [ ] Push and create PR
- [ ] Link to research docs in PR description

---

## Domain Mapping Reference

```
Domain.CORE → organizations, projects, users (4 tools)
Domain.WORK_ITEMS → work-items (5 tools)
Domain.REPOSITORIES → repositories (9 tools)
Domain.PULL_REQUESTS → pull-requests (7 tools)
Domain.PIPELINES → pipelines (8 tools)
Domain.WIKIS → wikis (6 tools)
Domain.SEARCH → search (3 tools)
```

## Tool Counts

| Config | Tools | Reduction |
|--------|-------|-----------|
| Default | 43 | 0% |
| `--domains work-items` | 5 | 88% |
| `--read-only` | ~22 | 49% |
| `--domains work-items --read-only` | 2 | 95% |
