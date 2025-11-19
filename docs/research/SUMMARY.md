# Research Summary: Tool Loading Strategies

## Problem Statement
Our MCP server loads 43 tools at once, which can overwhelm LLMs and make tool selection less efficient.

## Research Conducted
Analyzed two Microsoft MCP server implementations:
1. **microsoft/azure-devops-mcp** (TypeScript) - 79 tools total
2. **microsoft/mcp Azure.Mcp.Server** (C#) - 128 tools total

## Key Findings

### Strategy 1: Domain-based Filtering ⭐ RECOMMENDED
Used by microsoft/azure-devops-mcp
- **Concept:** Users select which feature domains to load
- **Example:** `--domains core work-items repositories` loads only those domains
- **Reduction:** Variable based on user selection (typically 50-70% reduction)
- **Complexity:** Low (1-2 days implementation)
- **Default:** All domains (backward compatible)

### Strategy 2: Read-Only Mode ⭐ RECOMMENDED (Complementary)
Used by both Microsoft MCP servers
- **Concept:** Filter out tools that modify data (create/update/delete operations)
- **Example:** `--read-only` exposes only list/get/query tools
- **Reduction:** 30-50% reduction
- **Complexity:** Low (0.5-1 day implementation)
- **Stackable:** Combines with domain filtering for 70-90% total reduction
- **Safety:** Prevents accidental or unauthorized modifications

### Strategy 3: Multi-tier Mode System
Used by Azure.Mcp.Server
- **Concept:** Three abstraction levels
  - Single mode: 1 unified tool
  - Namespace mode: 25 service-level tools (default)
  - All mode: 128 individual tools
- **Reduction:** 81% in default mode (128 → 25)
- **Complexity:** High (1-2 weeks implementation)
- **Additional:** Supports consolidated intent-based grouping

## Recommendation

**Implement Domain-based Filtering + Read-Only Mode** as Phase 1

### Why?
- ✅ Quick to implement (2-3 days total)
- ✅ Proven successful in both Microsoft implementations
- ✅ Perfect fit with our architecture
- ✅ Backward compatible
- ✅ Low risk
- ✅ Stackable: Domain filtering + read-only mode work together
- ✅ Safety benefits: Read-only prevents accidental changes
- ✅ Can evolve later

### Proposed Domains
Map existing features to domains:
- `core` → organizations, projects, users (4 tools)
- `work-items` → work items feature (5 tools)
- `repositories` → repositories feature (9 tools)
- `pull-requests` → pull requests feature (7 tools)
- `pipelines` → pipelines feature (8 tools)
- `wikis` → wikis feature (6 tools)
- `search` → search feature (3 tools)

### User Experience
```bash
# Load only work item tools
npm run start -- --domains work-items

# Load core + repositories
npm run start -- --domains core repositories

# Enable read-only mode (safe exploration)
npm run start -- --read-only

# Combine domain filtering + read-only mode (maximum reduction)
npm run start -- --domains work-items --read-only

# Load everything (default, backward compatible)
npm run start
```

## Tool Count Examples

| Configuration | Tools Loaded | Reduction |
|---------------|-------------|-----------|
| Default (all) | 43 | 0% |
| `--domains work-items` | ~5 | 88% |
| `--read-only` | ~20-25 | 42-53% |
| `--domains work-items --read-only` | ~2 | 95% |
| `--domains core repositories --read-only` | ~7 | 84% |

## Next Steps
1. **Phase 1:** Create `src/shared/domains.ts` with Domain enum and manager
2. **Phase 1:** Update `src/index.ts` to parse domain arguments
3. **Phase 1:** Modify `src/server.ts` for conditional tool registration
4. **Phase 2:** Add `readOnly` boolean to tool definitions
5. **Phase 2:** Add `--read-only` CLI flag and filtering logic
6. Update documentation with usage examples
7. Test with various domain combinations

## Impact
- **Tool reduction:** 50-90% depending on configuration
- **Maximum reduction:** 95% with `--domains work-items --read-only`
- **Better LLM performance:** Fewer tools = better selection accuracy
- **Safety:** Read-only mode prevents accidental modifications
- **User control:** Users choose what they need
- **Migration path:** Can upgrade to namespace/consolidated modes later

## Use Cases

### Read-Only Mode Benefits
- **Learning/Training:** Explore Azure DevOps without modification risk
- **Production monitoring:** Safe status checks and reporting
- **Limited permissions:** Match read-only Azure DevOps access
- **Audit mode:** Inspect without changes
- **CI/CD:** Build status, artifact retrieval

### Domain Filtering Benefits
- **Focused workflows:** Load only relevant feature areas
- **Performance:** Fewer tools = faster LLM processing
- **Simplicity:** Reduce overwhelming tool choices
- **Project-specific:** Different domains for different projects

## Full Details
See [tool-loading-strategies.md](./tool-loading-strategies.md) for complete analysis, code examples, and implementation guidance.
