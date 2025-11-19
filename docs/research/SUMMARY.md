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

### Strategy 2: Multi-tier Mode System
Used by Azure.Mcp.Server
- **Concept:** Three abstraction levels
  - Single mode: 1 unified tool
  - Namespace mode: 25 service-level tools (default)
  - All mode: 128 individual tools
- **Reduction:** 81% in default mode (128 → 25)
- **Complexity:** High (1-2 weeks implementation)
- **Additional:** Supports consolidated intent-based grouping

## Recommendation

**Implement Domain-based Filtering** as Phase 1

### Why?
- ✅ Quick to implement (1-2 days)
- ✅ Proven successful
- ✅ Perfect fit with our architecture
- ✅ Backward compatible
- ✅ Low risk
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

# Load everything (default, backward compatible)
npm run start
```

## Next Steps
1. Create `src/shared/domains.ts` with Domain enum and manager
2. Update `src/index.ts` to parse domain arguments
3. Modify `src/server.ts` for conditional tool registration
4. Update documentation with domain usage examples
5. Test with various domain combinations

## Impact
- **Tool reduction:** 50-90% depending on user selection
- **Better LLM performance:** Fewer tools = better selection accuracy
- **User control:** Users choose what they need
- **Migration path:** Can upgrade to more sophisticated approaches later

## Full Details
See [tool-loading-strategies.md](./tool-loading-strategies.md) for complete analysis, code examples, and implementation guidance.
