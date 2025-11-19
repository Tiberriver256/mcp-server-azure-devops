# Research Report: Tool Loading Strategies for MCP Servers

**Date:** November 19, 2024  
**Objective:** Research how other Azure DevOps MCP servers handle tool loading to address the issue of loading too many tools at once.

## Executive Summary

This report examines two Microsoft MCP server implementations to understand their strategies for managing tool loading:

1. **microsoft/azure-devops-mcp** (TypeScript/Node.js) - Uses a **Domain-based filtering** approach
2. **microsoft/mcp Azure.Mcp.Server** (C#/.NET) - Uses a **Three-tier mode system** with consolidated tools

Both approaches successfully reduce the cognitive load on LLMs by limiting the number of tools presented at once while maintaining full functionality.

## Current State: Tiberriver256/mcp-server-azure-devops

### Tool Count
- **Total Tools:** ~43 tools across 9 feature domains
- **Distribution:**
  - Organizations: 1 tool
  - Pipelines: 8 tools
  - Projects: 3 tools
  - Pull Requests: 7 tools
  - Repositories: 9 tools
  - Search: 3 tools
  - Users: 1 tool
  - Wikis: 6 tools
  - Work Items: 5 tools

### Current Loading Strategy
- **Method:** All tools loaded at once
- **No filtering or grouping mechanism**
- **Tools defined:** Each feature module exports an array of tool definitions
- **Registration:** All tools registered in `server.ts` via a combined array

```typescript
const tools = [
  ...usersTools,
  ...organizationsTools,
  ...projectsTools,
  ...repositoriesTools,
  ...workItemsTools,
  ...searchTools,
  ...pullRequestsTools,
  ...pipelinesTools,
  ...wikisTools,
];
```

## Strategy 1: Domain-based Filtering (microsoft/azure-devops-mcp)

### Overview
The TypeScript Azure DevOps MCP server uses a **domain-based filtering system** that allows users to selectively enable specific feature areas.

### Implementation Details

#### Domain Structure
```typescript
export enum Domain {
  ADVANCED_SECURITY = "advanced-security",
  PIPELINES = "pipelines",
  CORE = "core",
  REPOSITORIES = "repositories",
  SEARCH = "search",
  TEST_PLANS = "test-plans",
  WIKI = "wiki",
  WORK = "work",
  WORK_ITEMS = "work-items",
}
```

#### Domain Manager
- **Class:** `DomainsManager`
- **Responsibilities:**
  - Parse domain input from CLI arguments or configuration
  - Validate domain names
  - Maintain a set of enabled domains
  - Default behavior: All domains enabled if none specified

#### Tool Registration
```typescript
function configureAllTools(
  server: McpServer, 
  tokenProvider: () => Promise<string>, 
  connectionProvider: () => Promise<WebApi>, 
  userAgentProvider: () => string, 
  enabledDomains: Set<string>
) {
  const configureIfDomainEnabled = (domain: string, configureFn: () => void) => {
    if (enabledDomains.has(domain)) {
      configureFn();
    }
  };

  configureIfDomainEnabled(Domain.CORE, () => configureCoreTools(server, ...));
  configureIfDomainEnabled(Domain.WORK, () => configureWorkTools(server, ...));
  // ... etc
}
```

#### User Configuration
Users specify domains via CLI arguments:
```json
{
  "servers": {
    "ado_with_filtered_domains": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y", 
        "@azure-devops/mcp", 
        "${input:ado_org}", 
        "-d", 
        "core", 
        "work", 
        "work-items"
      ]
    }
  }
}
```

### Advantages
- **Simple to understand:** Clear mapping between domains and feature areas
- **User control:** Users explicitly choose what they need
- **Granular:** Each domain can be independently enabled/disabled
- **Low complexity:** Minimal code changes required
- **Backward compatible:** Default behavior loads all tools

### Disadvantages
- **User burden:** Users must understand domain structure
- **No intelligent grouping:** Tools within enabled domains are still all loaded
- **Documentation overhead:** Requires clear domain documentation

## Strategy 2: Three-Tier Mode System (Azure.Mcp.Server)

### Overview
The C# Azure MCP Server implements a sophisticated **three-tier mode system** that provides different levels of tool abstraction:

1. **Single Mode** (`--mode single`) - One unified tool for all operations
2. **Namespace Mode** (`--mode namespace`) - Tools grouped by service (DEFAULT)
3. **All Mode** (`--mode all`) - All individual tools exposed
4. **Consolidated Mode** (`--consolidated`) - Intent-based tool grouping

### Tool Count Evolution
- **Original (All Mode):** ~128 individual tools
- **Namespace Mode (Default):** ~25 service-level tools
- **Consolidated Mode:** ~15-20 intent-based tools
- **Single Mode:** 1 unified tool

### Namespace Mode (Default)

#### Concept
Groups all tools for a specific Azure service under a single namespace tool. When called, it spawns or routes to the appropriate individual tool.

**Example:** Instead of exposing:
- `storage_account_create`
- `storage_account_delete`
- `storage_account_get`
- `storage_blob_upload`
- `storage_container_create`

Expose one tool:
- `storage` (which internally routes to specific operations)

#### Benefits
- **81% reduction** in tool count (128 → 25)
- Service-oriented mental model
- LLM sees high-level capabilities

### Consolidated Mode

#### Concept
Groups tools by **user intent and task** rather than by service. Multiple services may be involved in a single consolidated tool.

**Example from consolidated-tools.json:**
```json
{
  "name": "get_azure_databases_details",
  "description": "Comprehensive Azure database management tool for MySQL, PostgreSQL, SQL Database, SQL Server, and Cosmos DB. List and query databases...",
  "toolMetadata": {
    "readOnly": { "value": true },
    "destructive": { "value": false },
    "idempotent": { "value": true }
  },
  "mappedToolList": [
    "mysql_database_list",
    "mysql_database_query",
    "mysql_server_config_get",
    "postgres_database_list",
    "postgres_database_query",
    "sql_db_list",
    "cosmos_database_list"
  ]
}
```

#### Tool Metadata
Each consolidated tool includes:
- **destructive:** Can delete/modify resources
- **idempotent:** Same result on repeated calls
- **openWorld:** Interacts with unpredictable entities
- **readOnly:** Only read operations
- **secret:** Handles sensitive data
- **localRequired:** Needs local server mode

#### Benefits
- **Task-oriented:** Matches user mental model
- **Cross-service:** Combines related operations
- **Semantic grouping:** Groups by what users want to accomplish
- **Metadata for safety:** LLM can understand operation implications

### Single Mode

#### Concept
All operations go through one unified tool that accepts natural language commands.

#### Benefits
- **Simplest interface:** One tool to learn
- **Maximum flexibility:** Natural language routing
- **Ultimate reduction:** 128 → 1 tool

#### Trade-offs
- **Less explicit:** Harder for LLM to discover capabilities
- **Requires sophisticated routing:** Complex internal dispatching

### Implementation Pattern

#### Area-based Registration
```csharp
private static IAreaSetup[] RegisterAreas()
{
    return [
        new Azure.Mcp.Tools.Storage.StorageSetup(),
        new Azure.Mcp.Tools.KeyVault.KeyVaultSetup(),
        // ... 40+ service areas
    ];
}
```

Each area independently:
- Defines its tools
- Registers its commands
- Provides metadata

#### Mode Selection
```bash
# Namespace mode (default)
azmcp server start

# All individual tools
azmcp server start --mode all

# Single unified tool
azmcp server start --mode single

# Consolidated intent-based tools
azmcp server start --consolidated

# Filter by namespace
azmcp server start --namespace storage keyvault
```

### Advantages
- **Multiple abstraction levels:** Users choose complexity
- **Intelligent defaults:** Namespace mode balances usability and capability
- **Metadata-rich:** Tools include safety and behavior information
- **Proven scalability:** Handles 128+ tools effectively
- **User choice:** Different modes for different use cases

### Disadvantages
- **High complexity:** Significant implementation effort
- **Mode confusion:** Users must understand different modes
- **Maintenance overhead:** Multiple tool definitions to maintain
- **Documentation complexity:** Need to explain all modes

## Comparison Matrix

| Aspect | Current | Domain Filtering | Three-Tier Mode |
|--------|---------|------------------|-----------------|
| **Tool Count Reduction** | None (43 tools) | Moderate (per domain) | High (25 default, up to 1) |
| **Implementation Complexity** | Low | Low | High |
| **User Configuration** | None | CLI args | CLI args + modes |
| **Backward Compatibility** | N/A | High (default all) | High (default namespace) |
| **Discoverability** | All visible | Domain-specific | Mode-dependent |
| **Maintenance Effort** | Low | Low | High |
| **Flexibility** | None | Domain-level | Tool + Namespace + Intent |
| **LLM Cognitive Load** | High (43 tools) | Medium (varies) | Low (25 or fewer) |

## Recommendations for Tiberriver256/mcp-server-azure-devops

### Option 1: Domain-based Filtering (RECOMMENDED)

**Why:**
- **Quick implementation:** ~1-2 days of work
- **Proven pattern:** Already successful in microsoft/azure-devops-mcp
- **Natural fit:** Your existing feature structure maps perfectly to domains
- **Immediate benefit:** Users can reduce tool count based on needs
- **Low risk:** Minimal code changes, backward compatible

**Implementation Steps:**
1. Create `src/shared/domains.ts` with Domain enum and DomainsManager class
2. Update `src/index.ts` to parse domain arguments
3. Modify `src/server.ts` to conditionally register tools based on enabled domains
4. Update documentation with domain list and usage examples
5. Set default to "all" for backward compatibility

**Estimated Tool Count After Implementation:**
- Core only: ~4 tools
- Work Items only: ~5 tools
- Repositories only: ~9 tools
- Custom combinations: User-defined

### Option 2: Two-Tier Mode System (ADVANCED)

**Why:**
- **Greater reduction:** Can achieve 10-15 tools in namespace mode
- **Better UX:** Service-oriented grouping matches user mental model
- **Future-proof:** Allows adding consolidated mode later

**Implementation Steps:**
1. Implement domain filtering first (Option 1)
2. Add mode system with "all" and "namespace" modes
3. Create namespace-level tools that route to individual tools
4. Update documentation extensively

**Estimated Tool Count:**
- Namespace mode (default): ~9-12 tools (one per feature)
- All mode: ~43 tools (current)
- With domains: Further reduced per selection

**Estimated Effort:** 1-2 weeks

### Option 3: Hybrid Approach (BALANCED)

**Why:**
- **Best of both:** Domains + simplified namespace tools
- **Incremental:** Can implement in phases
- **Flexible:** Users choose granularity

**Implementation:**
1. **Phase 1:** Domain filtering (immediate)
2. **Phase 2:** Add high-level "manage_work_items" style tools (optional)
3. **Phase 3:** Document recommended domain combinations

**Benefits:**
- Quick wins with Phase 1
- Enhanced experience with Phase 2 (optional)
- User choice preserved

## Tactical Recommendations

### Immediate Actions (This Week)

1. **Implement Domain Filtering**
   - Use microsoft/azure-devops-mcp as reference
   - Map existing features to domains:
     - `core` → organizations, projects, users
     - `work-items` → work-items feature
     - `repositories` → repositories feature
     - `pull-requests` → pull-requests feature
     - `pipelines` → pipelines feature
     - `wikis` → wikis feature
     - `search` → search feature

2. **Update CLI Interface**
   ```bash
   # Current
   npm run start
   
   # New
   npm run start -- --domains core work-items repositories
   # or
   npm run start -- -d core work-items
   ```

3. **Document Domain Usage**
   - Add section to README.md explaining domains
   - List available domains
   - Show example configurations
   - Recommend common combinations

### Short-term Enhancements (Next Month)

1. **Add Namespace Tools** (Optional)
   - Create high-level routing tools
   - `manage_work_items` → routes to create/update/list/get/link
   - `manage_repositories` → routes to repo operations
   - Reduces tool count by ~60-70%

2. **Tool Metadata** (Optional)
   - Add readOnly, destructive flags to tool definitions
   - Help LLMs understand operation safety
   - Useful for autonomous agents

### Long-term Vision (3-6 Months)

1. **Consider Consolidated Mode**
   - Group by user intent
   - "Review pull request" consolidated tool
   - "Plan sprint" consolidated tool
   - Requires user research to identify patterns

2. **Smart Defaults**
   - Analyze usage patterns
   - Suggest domain combinations
   - Auto-enable related domains

## Code Examples

### Domain Enum (src/shared/domains.ts)
```typescript
export enum Domain {
  CORE = 'core',
  WORK_ITEMS = 'work-items',
  REPOSITORIES = 'repositories',
  PULL_REQUESTS = 'pull-requests',
  PIPELINES = 'pipelines',
  WIKIS = 'wikis',
  SEARCH = 'search',
}

export class DomainsManager {
  private enabledDomains: Set<string>;

  constructor(domainsInput?: string | string[]) {
    this.enabledDomains = new Set();
    this.parseDomains(domainsInput);
  }

  private parseDomains(domainsInput?: string | string[]): void {
    if (!domainsInput) {
      this.enableAllDomains();
      return;
    }
    
    const domains = Array.isArray(domainsInput) 
      ? domainsInput 
      : domainsInput.split(',').map(d => d.trim());
    
    domains.forEach(domain => {
      if (Object.values(Domain).includes(domain as Domain)) {
        this.enabledDomains.add(domain);
      }
    });

    if (this.enabledDomains.size === 0) {
      this.enableAllDomains();
    }
  }

  private enableAllDomains(): void {
    Object.values(Domain).forEach(domain => {
      this.enabledDomains.add(domain);
    });
  }

  public isDomainEnabled(domain: string): boolean {
    return this.enabledDomains.has(domain);
  }

  public getEnabledDomains(): Set<string> {
    return new Set(this.enabledDomains);
  }
}
```

### Updated Server Registration (src/server.ts)
```typescript
export function createAzureDevOpsServer(
  config: AzureDevOpsConfig,
  enabledDomains?: Set<string>
): Server {
  // ... existing setup ...

  server.setRequestHandler(ListToolsRequestSchema, () => {
    const tools = [];
    
    const shouldInclude = (domain: string) => {
      return !enabledDomains || enabledDomains.has(domain);
    };

    if (shouldInclude(Domain.CORE)) {
      tools.push(...usersTools, ...organizationsTools, ...projectsTools);
    }
    if (shouldInclude(Domain.WORK_ITEMS)) {
      tools.push(...workItemsTools);
    }
    if (shouldInclude(Domain.REPOSITORIES)) {
      tools.push(...repositoriesTools);
    }
    if (shouldInclude(Domain.PULL_REQUESTS)) {
      tools.push(...pullRequestsTools);
    }
    if (shouldInclude(Domain.PIPELINES)) {
      tools.push(...pipelinesTools);
    }
    if (shouldInclude(Domain.WIKIS)) {
      tools.push(...wikisTools);
    }
    if (shouldInclude(Domain.SEARCH)) {
      tools.push(...searchTools);
    }

    return { tools };
  });
  
  // ... rest of implementation ...
}
```

## Conclusion

Both examined implementations successfully address the "too many tools" problem through different strategies:

1. **Domain Filtering** (TypeScript) - Simple, effective, user-driven
2. **Multi-tier Modes** (C#) - Sophisticated, flexible, multiple abstraction levels

**For Tiberriver256/mcp-server-azure-devops, we recommend starting with Domain Filtering:**
- ✅ Quick to implement (1-2 days)
- ✅ Proven effective
- ✅ Low risk
- ✅ Backward compatible
- ✅ Natural fit with existing architecture
- ✅ Can evolve to more sophisticated approaches later

The domain-based approach will immediately reduce cognitive load on LLMs while maintaining full functionality and giving users control over their experience.

## References

1. microsoft/azure-devops-mcp repository
   - Path: `/tmp/mcp-research/azure-devops-mcp`
   - Key files: `src/shared/domains.ts`, `src/tools.ts`, `src/index.ts`

2. microsoft/mcp Azure.Mcp.Server repository
   - Path: `/tmp/mcp-research/mcp/servers/Azure.Mcp.Server`
   - Key files: `src/Program.cs`, `core/Azure.Mcp.Core/src/Areas/Server/Resources/consolidated-tools.json`

3. Current implementation
   - Path: `/home/runner/work/mcp-server-azure-devops/mcp-server-azure-devops`
   - Key files: `src/server.ts`, `src/features/*/tool-definitions.ts`
