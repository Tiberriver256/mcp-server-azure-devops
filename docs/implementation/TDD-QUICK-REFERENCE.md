# TDD Quick Reference Guide

## Getting Started

This quick reference guide helps you implement domain filtering and read-only mode using Test-Driven Development.

For full details, see [domain-filtering-tdd-plan.md](./domain-filtering-tdd-plan.md)

## TDD Cycle

```
RED → GREEN → REFACTOR
```

1. **RED:** Write a failing test
2. **GREEN:** Write minimal code to pass the test
3. **REFACTOR:** Improve code quality without changing behavior

## Quick Commands

### Run Tests

```bash
# Watch unit tests (rapid feedback)
npm run test:unit -- --watch

# Run specific E2E test
npm run test:e2e -- --testNamePattern="should load only core domain tools"

# Run all E2E tests
npm run test:e2e

# Run all tests
npm test

# Build project
npm run build
```

### Git Workflow

```bash
# Create feature branch
git checkout -b feat/domain-filtering-read-only-mode

# Commit after GREEN phase
git add .
git commit -m "feat: add domain filtering for core domain"

# Push changes
git push origin feat/domain-filtering-read-only-mode
```

## Implementation Checklist

### Phase 1: Domain Filtering (1-2 days)

- [ ] **Step 1:** Create domain types (`src/shared/domains/types.ts`)
  - [ ] Write unit tests (RED)
  - [ ] Implement Domain enum (GREEN)
  - [ ] Refactor (REFACTOR)

- [ ] **Step 2:** Create DomainsManager class (`src/shared/domains/domains-manager.ts`)
  - [ ] Write unit tests (RED)
  - [ ] Implement class (GREEN)
  - [ ] Refactor (REFACTOR)

- [ ] **Step 3:** Update CLI parsing (`src/index.ts`)
  - [ ] Write E2E tests (RED)
  - [ ] Implement argument parsing (GREEN)
  - [ ] Refactor (REFACTOR)

- [ ] **Step 4:** Update server tool registration (`src/server.ts`)
  - [ ] Write E2E tests (RED)
  - [ ] Implement conditional registration (GREEN)
  - [ ] Refactor (REFACTOR)

- [ ] **Step 5:** Verify all tests pass
  - [ ] Run `npm test`
  - [ ] Check backward compatibility
  - [ ] Verify tool counts

### Phase 2: Read-Only Mode (0.5-1 day)

- [ ] **Step 1:** Add readOnly property to ToolDefinition
  - [ ] Update type definition
  - [ ] Write unit tests

- [ ] **Step 2:** Mark all tools as read-only or write
  - [ ] Update work-items tools
  - [ ] Update repositories tools
  - [ ] Update all other tool definitions

- [ ] **Step 3:** Add --read-only CLI flag
  - [ ] Write E2E tests (RED)
  - [ ] Implement parsing (GREEN)

- [ ] **Step 4:** Filter tools by read-only mode
  - [ ] Write E2E tests (RED)
  - [ ] Implement filtering (GREEN)
  - [ ] Refactor (REFACTOR)

- [ ] **Step 5:** Verify all tests pass
  - [ ] Run `npm test`
  - [ ] Verify tool counts

### Phase 3: Integration (0.5 day)

- [ ] Write combined filtering tests
- [ ] Update README.md with usage examples
- [ ] Update docs/tools/README.md with domain categorization
- [ ] Run final test suite
- [ ] Create PR

## Test Templates

### E2E Test Template

```typescript
describe('Feature Name E2E', () => {
  test('should do something specific', async () => {
    // GIVEN: Setup preconditions
    const client = await createClientWithConfig({
      domains: ['work-items'],
      readOnly: true
    });

    // WHEN: Execute action
    const result = await client.listTools();

    // THEN: Verify outcome
    expect(result.tools).toHaveLength(2);
    expect(result.tools[0].name).toBe('list_work_items');
  });
});
```

### Unit Test Template

```typescript
describe('DomainsManager', () => {
  test('should parse single domain', () => {
    // GIVEN
    const input = 'core';

    // WHEN
    const manager = new DomainsManager(input);

    // THEN
    expect(manager.isDomainEnabled('core')).toBe(true);
    expect(manager.isDomainEnabled('work-items')).toBe(false);
  });
});
```

## Expected Tool Counts

| Configuration | Tools |
|---------------|-------|
| Default (all domains) | 43 |
| `--domains core` | 4 |
| `--domains work-items` | 5 |
| `--domains repositories` | 9 |
| `--domains pull-requests` | 7 |
| `--domains pipelines` | 8 |
| `--domains wikis` | 6 |
| `--domains search` | 3 |
| `--domains core work-items` | 9 |
| `--read-only` | 20-25 |
| `--domains work-items --read-only` | 2 |
| `--domains core repositories --read-only` | 6-8 |

## Domain Mapping

```typescript
Domain.CORE = 'core'                    // 5 tools
  - list_organizations
  - list_projects
  - get_project
  - get_project_details
  - get_me

Domain.WORK_ITEMS = 'work-items'        // 5 tools
  - list_work_items (readOnly: true)
  - get_work_item (readOnly: true)
  - create_work_item (readOnly: false)
  - update_work_item (readOnly: false)
  - manage_work_item_link (readOnly: false)

Domain.REPOSITORIES = 'repositories'    // 9 tools
Domain.PULL_REQUESTS = 'pull-requests'  // 7 tools
Domain.PIPELINES = 'pipelines'          // 8 tools
Domain.WIKIS = 'wikis'                  // 6 tools
Domain.SEARCH = 'search'                // 3 tools
```

## Common Issues & Solutions

### Issue: Test fails with "Cannot find module"
**Solution:** Run `npm install` and `npm run build`

### Issue: E2E test timeout
**Solution:** Increase timeout in test or check Azure DevOps credentials

### Issue: Tool count doesn't match expected
**Solution:** 
1. Count tools in feature modules
2. Check readOnly flags are set correctly
3. Verify domain conditionals in server.ts

### Issue: Backward compatibility broken
**Solution:**
1. Ensure default behavior loads all tools
2. Check that domains parameter is optional
3. Verify existing E2E tests still pass

## Debugging Tips

```typescript
// Log enabled domains
console.error('Enabled domains:', Array.from(enabledDomains));

// Log tool count
console.error('Total tools loaded:', tools.length);

// Log tool names
console.error('Tools:', tools.map(t => t.name));

// Check readOnly flags
console.error('Read-only tools:', tools.filter(t => t.readOnly).length);
console.error('Write tools:', tools.filter(t => !t.readOnly).length);
```

## Success Indicators

✅ All tests pass (green)  
✅ Tool counts match expectations  
✅ Existing functionality unaffected  
✅ Code coverage maintained  
✅ No linting errors  
✅ Documentation updated  

## Next Steps After Implementation

1. Create pull request
2. Request code review
3. Address feedback
4. Merge to main
5. Update CHANGELOG.md
6. Release new version

## Questions?

See the full TDD plan: [domain-filtering-tdd-plan.md](./domain-filtering-tdd-plan.md)
