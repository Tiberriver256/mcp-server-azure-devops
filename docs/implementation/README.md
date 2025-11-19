# Implementation Documentation

This directory contains implementation plans and guides for Azure DevOps MCP Server features.

## Available Documentation

### Domain Filtering + Read-Only Mode

Implementation of tool reduction strategies based on research findings.

- **[TDD Implementation Plan](./domain-filtering-tdd-plan.md)** - Comprehensive Test-Driven Development plan
  - 28,000+ word detailed implementation guide
  - Phase-by-phase breakdown (3 phases over 2-3 days)
  - Complete E2E test specifications
  - Step-by-step implementation instructions
  - Success criteria and risk mitigation

- **[TDD Quick Reference](./TDD-QUICK-REFERENCE.md)** - Quick reference guide for developers
  - Essential commands and workflows
  - Implementation checklist
  - Test templates
  - Expected tool counts
  - Common issues and solutions

## Quick Start

1. **Read the research**: Start with `docs/research/SUMMARY.md`
2. **Review the plan**: Read `domain-filtering-tdd-plan.md` 
3. **Use quick reference**: Keep `TDD-QUICK-REFERENCE.md` open while coding
4. **Follow TDD cycle**: RED → GREEN → REFACTOR
5. **Test frequently**: Run tests after each change

## Implementation Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: Domain Filtering | 1-2 days | Users can filter tools by domain |
| Phase 2: Read-Only Mode | 0.5-1 day | Users can enable read-only mode |
| Phase 3: Integration & Docs | 0.5 day | Documentation and polish |
| **Total** | **2-3 days** | **Complete feature** |

## Key Features

### Domain-Based Filtering
- Load only specific feature domains
- Reduce tool count by 50-90%
- CLI: `--domains core work-items repositories`

### Read-Only Mode
- Filter out write operations (create/update/delete)
- Reduce tool count by 30-50%
- CLI: `--read-only`

### Combined
- Stack both features for 70-95% reduction
- CLI: `--domains work-items --read-only`
- Example: 43 tools → 2 tools (95% reduction)

## Test Strategy

### Test-Driven Development (TDD)
- Write failing E2E test first (RED)
- Implement minimal code to pass (GREEN)
- Refactor and improve (REFACTOR)

### Test Types
- **E2E Tests:** Real server/client interaction
- **Unit Tests:** Individual component testing
- **Integration Tests:** Component interaction testing

### Commands
```bash
# Watch unit tests
npm run test:unit -- --watch

# Run E2E tests
npm run test:e2e

# Run all tests
npm test
```

## Expected Results

### Tool Counts

| Configuration | Tools | Reduction |
|---------------|-------|-----------|
| Default | 43 | 0% |
| `--domains work-items` | 5 | 88% |
| `--read-only` | ~22 | 49% |
| `--domains work-items --read-only` | 2 | 95% |

### Backward Compatibility
- ✅ Default behavior unchanged
- ✅ All existing tests pass
- ✅ No breaking changes
- ✅ Opt-in feature

## Success Criteria

- ✅ All tests pass (unit + E2E + integration)
- ✅ Tool counts match expectations
- ✅ Backward compatibility maintained
- ✅ Code coverage maintained or improved
- ✅ Documentation complete and clear
- ✅ Performance not degraded

## Related Documentation

- Research findings: `docs/research/tool-loading-strategies.md`
- Research summary: `docs/research/SUMMARY.md`
- Tool documentation: `docs/tools/README.md`

## Contributing

When implementing features in this directory:

1. Follow the TDD approach outlined in the plans
2. Write comprehensive E2E tests first
3. Implement incrementally
4. Test frequently
5. Document as you go
6. Maintain backward compatibility

## Questions?

For detailed information, see:
- [Full TDD Implementation Plan](./domain-filtering-tdd-plan.md)
- [Quick Reference Guide](./TDD-QUICK-REFERENCE.md)
