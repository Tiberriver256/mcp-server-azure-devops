# TDD Implementation Plan: Domain Filtering + Read-Only Mode

## Overview

This document outlines a comprehensive Test-Driven Development (TDD) approach for implementing domain-based filtering and read-only mode functionality for the Azure DevOps MCP Server.

**Implementation Timeline:** 2-3 days  
**Approach:** E2E-first TDD with incremental feature development  
**Test Framework:** Jest E2E tests (following existing patterns in `src/server.spec.e2e.ts`)

## Phase 1: Domain-Based Filtering (1-2 days)

### 1.1 Test Specification: Domain Filtering E2E Tests

**File:** `src/features/domains/domain-filtering.spec.e2e.ts`

#### Test Suite 1: Basic Domain Filtering

```typescript
describe('Domain-Based Filtering E2E', () => {
  describe('Default Behavior (All Domains)', () => {
    test('should load all 43 tools when no domain filter specified', async () => {
      // GIVEN: Server started without domain filter
      // WHEN: Client requests tool list
      const tools = await client.listTools();
      // THEN: All 43 tools are available
      expect(tools.tools).toHaveLength(43);
    });

    test('should include tools from all domains', async () => {
      // GIVEN: Server started without domain filter
      // WHEN: Client requests tool list
      const tools = await client.listTools();
      // THEN: Tools from each domain are present
      const toolNames = tools.tools.map(t => t.name);
      
      // Core domain (4 tools)
      expect(toolNames).toContain('list_organizations');
      expect(toolNames).toContain('list_projects');
      expect(toolNames).toContain('get_project');
      expect(toolNames).toContain('get_me');
      
      // Work Items domain (5 tools)
      expect(toolNames).toContain('list_work_items');
      expect(toolNames).toContain('get_work_item');
      expect(toolNames).toContain('create_work_item');
      expect(toolNames).toContain('update_work_item');
      expect(toolNames).toContain('manage_work_item_link');
      
      // Repositories domain (9 tools)
      expect(toolNames).toContain('list_repositories');
      expect(toolNames).toContain('get_repository');
      // ... etc
    });
  });

  describe('Single Domain Filtering', () => {
    test('should load only core domain tools (4 tools)', async () => {
      // GIVEN: Server started with --domains core
      const client = await createClientWithDomains(['core']);
      // WHEN: Client requests tool list
      const tools = await client.listTools();
      // THEN: Only 4 core domain tools are available
      expect(tools.tools).toHaveLength(4);
      const toolNames = tools.tools.map(t => t.name);
      expect(toolNames).toEqual(expect.arrayContaining([
        'list_organizations',
        'list_projects', 
        'get_project',
        'get_me'
      ]));
    });

    test('should load only work-items domain tools (5 tools)', async () => {
      // GIVEN: Server started with --domains work-items
      const client = await createClientWithDomains(['work-items']);
      // WHEN: Client requests tool list
      const tools = await client.listTools();
      // THEN: Only 5 work-items tools are available
      expect(tools.tools).toHaveLength(5);
      const toolNames = tools.tools.map(t => t.name);
      expect(toolNames).toEqual(expect.arrayContaining([
        'list_work_items',
        'get_work_item',
        'create_work_item',
        'update_work_item',
        'manage_work_item_link'
      ]));
    });

    test('should load only repositories domain tools (9 tools)', async () => {
      // GIVEN: Server started with --domains repositories
      const client = await createClientWithDomains(['repositories']);
      // WHEN: Client requests tool list
      const tools = await client.listTools();
      // THEN: Only 9 repositories tools are available
      expect(tools.tools).toHaveLength(9);
    });
  });

  describe('Multiple Domain Filtering', () => {
    test('should load core + work-items domains (9 tools)', async () => {
      // GIVEN: Server started with --domains core work-items
      const client = await createClientWithDomains(['core', 'work-items']);
      // WHEN: Client requests tool list
      const tools = await client.listTools();
      // THEN: 9 tools from both domains are available
      expect(tools.tools).toHaveLength(9);
      const toolNames = tools.tools.map(t => t.name);
      
      // Core tools should be present
      expect(toolNames).toContain('list_organizations');
      expect(toolNames).toContain('get_me');
      
      // Work items tools should be present
      expect(toolNames).toContain('list_work_items');
      expect(toolNames).toContain('create_work_item');
      
      // Other domain tools should NOT be present
      expect(toolNames).not.toContain('list_repositories');
      expect(toolNames).not.toContain('list_pipelines');
    });

    test('should load core + repositories + work-items (18 tools)', async () => {
      // GIVEN: Server started with --domains core repositories work-items
      const client = await createClientWithDomains(['core', 'repositories', 'work-items']);
      // WHEN: Client requests tool list
      const tools = await client.listTools();
      // THEN: 18 tools from all three domains are available
      expect(tools.tools).toHaveLength(18);
    });
  });

  describe('Domain Validation', () => {
    test('should reject invalid domain name', async () => {
      // GIVEN: Server started with --domains invalid-domain
      // WHEN: Server initializes
      // THEN: Server logs error and falls back to all domains
      const client = await createClientWithDomains(['invalid-domain']);
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(43); // Falls back to all
    });

    test('should handle mixed valid and invalid domains', async () => {
      // GIVEN: Server started with --domains core invalid-domain work-items
      const client = await createClientWithDomains(['core', 'invalid-domain', 'work-items']);
      // WHEN: Client requests tool list
      const tools = await client.listTools();
      // THEN: Only valid domains are loaded (9 tools)
      expect(tools.tools).toHaveLength(9);
    });
  });

  describe('Tool Execution with Domain Filtering', () => {
    test('should execute tool from enabled domain', async () => {
      // GIVEN: Server started with --domains core
      const client = await createClientWithDomains(['core']);
      // WHEN: Client calls list_organizations
      const result = await client.callTool({
        name: 'list_organizations',
        arguments: {}
      });
      // THEN: Tool executes successfully
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    test('should fail to execute tool from disabled domain', async () => {
      // GIVEN: Server started with --domains core
      const client = await createClientWithDomains(['core']);
      // WHEN: Client attempts to call list_work_items (work-items domain)
      // THEN: Tool is not available
      const tools = await client.listTools();
      const toolNames = tools.tools.map(t => t.name);
      expect(toolNames).not.toContain('list_work_items');
    });
  });
});
```

#### Test Suite 2: Domain Configuration Parsing

```typescript
describe('Domain Configuration Parsing', () => {
  test('should parse single domain from CLI', () => {
    // GIVEN: CLI args --domains core
    const args = ['--domains', 'core'];
    // WHEN: Parse domains
    const domains = parseDomainsFromArgs(args);
    // THEN: Returns ['core']
    expect(domains).toEqual(['core']);
  });

  test('should parse multiple domains from CLI', () => {
    // GIVEN: CLI args --domains core work-items repositories
    const args = ['--domains', 'core', 'work-items', 'repositories'];
    // WHEN: Parse domains
    const domains = parseDomainsFromArgs(args);
    // THEN: Returns all three domains
    expect(domains).toEqual(['core', 'work-items', 'repositories']);
  });

  test('should parse comma-separated domains', () => {
    // GIVEN: CLI args --domains core,work-items,repositories
    const args = ['--domains', 'core,work-items,repositories'];
    // WHEN: Parse domains
    const domains = parseDomainsFromArgs(args);
    // THEN: Returns all three domains
    expect(domains).toEqual(['core', 'work-items', 'repositories']);
  });

  test('should default to all domains when not specified', () => {
    // GIVEN: No domain args
    const args = [];
    // WHEN: Parse domains
    const domains = parseDomainsFromArgs(args);
    // THEN: Returns all domains
    expect(domains).toEqual([
      'core', 'work-items', 'repositories', 'pull-requests',
      'pipelines', 'wikis', 'search'
    ]);
  });
});
```

### 1.2 Implementation Steps (Domain Filtering)

#### Step 1: Create Domain Types and Enums (RED → GREEN)

**File:** `src/shared/domains/types.ts`

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

export const ALL_DOMAINS = Object.values(Domain);
```

**Tests:** Unit tests for domain enum

#### Step 2: Create DomainsManager Class (RED → GREEN)

**File:** `src/shared/domains/domains-manager.ts`

```typescript
export class DomainsManager {
  private enabledDomains: Set<string>;

  constructor(domainsInput?: string | string[]) {
    this.enabledDomains = new Set();
    this.parseDomains(domainsInput);
  }

  private parseDomains(domainsInput?: string | string[]): void {
    // Implementation
  }

  public isDomainEnabled(domain: string): boolean {
    return this.enabledDomains.has(domain);
  }

  public getEnabledDomains(): Set<string> {
    return new Set(this.enabledDomains);
  }
}
```

**Tests:** Unit tests for DomainsManager class

#### Step 3: Update CLI Argument Parsing (RED → GREEN)

**File:** `src/index.ts`

Add domain argument parsing to CLI interface:

```typescript
// Parse --domains argument
const domainsArg = process.argv.indexOf('--domains');
let domains: string[] | undefined;

if (domainsArg > -1) {
  // Collect all domains after --domains flag
  const domainValues = [];
  for (let i = domainsArg + 1; i < process.argv.length; i++) {
    if (process.argv[i].startsWith('--')) break;
    domainValues.push(process.argv[i]);
  }
  domains = domainValues.flatMap(d => d.split(','));
}

const domainsManager = new DomainsManager(domains);
```

**Tests:** E2E tests for CLI parsing

#### Step 4: Update Server Tool Registration (RED → GREEN)

**File:** `src/server.ts`

Modify `createAzureDevOpsServer` to accept enabled domains:

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

    // Core domain
    if (shouldInclude(Domain.CORE)) {
      tools.push(...usersTools, ...organizationsTools, ...projectsTools);
    }
    
    // Work Items domain
    if (shouldInclude(Domain.WORK_ITEMS)) {
      tools.push(...workItemsTools);
    }
    
    // Repositories domain
    if (shouldInclude(Domain.REPOSITORIES)) {
      tools.push(...repositoriesTools);
    }
    
    // Pull Requests domain
    if (shouldInclude(Domain.PULL_REQUESTS)) {
      tools.push(...pullRequestsTools);
    }
    
    // Pipelines domain
    if (shouldInclude(Domain.PIPELINES)) {
      tools.push(...pipelinesTools);
    }
    
    // Wikis domain
    if (shouldInclude(Domain.WIKIS)) {
      tools.push(...wikisTools);
    }
    
    // Search domain
    if (shouldInclude(Domain.SEARCH)) {
      tools.push(...searchTools);
    }

    return { tools };
  });

  // ... rest of implementation ...
}
```

**Tests:** E2E tests for tool filtering

#### Step 5: Run All Tests (RED → GREEN → REFACTOR)

```bash
# Run unit tests
npm run test:unit

# Run E2E tests
npm run test:e2e

# Run all tests
npm test
```

**Expected Results:**
- All existing tests pass (backward compatibility)
- New domain filtering E2E tests pass
- Tool count matches expected values for each configuration

---

## Phase 2: Read-Only Mode (0.5-1 day)

### 2.1 Test Specification: Read-Only Mode E2E Tests

**File:** `src/features/domains/read-only-mode.spec.e2e.ts`

#### Test Suite 1: Read-Only Mode Filtering

```typescript
describe('Read-Only Mode E2E', () => {
  describe('Default Behavior (Read-Only Disabled)', () => {
    test('should load all 43 tools when read-only mode disabled', async () => {
      // GIVEN: Server started without --read-only flag
      const client = await createClient({ readOnly: false });
      // WHEN: Client requests tool list
      const tools = await client.listTools();
      // THEN: All 43 tools are available
      expect(tools.tools).toHaveLength(43);
    });

    test('should include both read and write tools', async () => {
      // GIVEN: Server started without --read-only flag
      const client = await createClient({ readOnly: false });
      // WHEN: Client requests tool list
      const tools = await client.listTools();
      const toolNames = tools.tools.map(t => t.name);
      
      // Read-only tools should be present
      expect(toolNames).toContain('list_work_items');
      expect(toolNames).toContain('get_work_item');
      
      // Write tools should also be present
      expect(toolNames).toContain('create_work_item');
      expect(toolNames).toContain('update_work_item');
    });
  });

  describe('Read-Only Mode Enabled', () => {
    test('should load only read-only tools (~20-25 tools)', async () => {
      // GIVEN: Server started with --read-only flag
      const client = await createClient({ readOnly: true });
      // WHEN: Client requests tool list
      const tools = await client.listTools();
      // THEN: Only read-only tools are available
      expect(tools.tools.length).toBeGreaterThanOrEqual(20);
      expect(tools.tools.length).toBeLessThanOrEqual(25);
      
      // All returned tools should be read-only
      tools.tools.forEach(tool => {
        expect(tool.readOnly).toBe(true);
      });
    });

    test('should include list and get tools', async () => {
      // GIVEN: Server started with --read-only flag
      const client = await createClient({ readOnly: true });
      // WHEN: Client requests tool list
      const tools = await client.listTools();
      const toolNames = tools.tools.map(t => t.name);
      
      // Read-only tools should be present
      expect(toolNames).toContain('list_work_items');
      expect(toolNames).toContain('get_work_item');
      expect(toolNames).toContain('list_repositories');
      expect(toolNames).toContain('get_repository');
      expect(toolNames).toContain('list_projects');
      expect(toolNames).toContain('get_project');
    });

    test('should exclude create, update, delete tools', async () => {
      // GIVEN: Server started with --read-only flag
      const client = await createClient({ readOnly: true });
      // WHEN: Client requests tool list
      const tools = await client.listTools();
      const toolNames = tools.tools.map(t => t.name);
      
      // Write tools should NOT be present
      expect(toolNames).not.toContain('create_work_item');
      expect(toolNames).not.toContain('update_work_item');
      expect(toolNames).not.toContain('create_pull_request');
      expect(toolNames).not.toContain('update_pull_request');
      expect(toolNames).not.toContain('create_branch');
      expect(toolNames).not.toContain('create_commit');
    });
  });

  describe('Tool Execution in Read-Only Mode', () => {
    test('should execute read-only tool successfully', async () => {
      // GIVEN: Server started with --read-only flag
      const client = await createClient({ readOnly: true });
      // WHEN: Client calls list_work_items
      const result = await client.callTool({
        name: 'list_work_items',
        arguments: {}
      });
      // THEN: Tool executes successfully
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    test('should not have write tools available', async () => {
      // GIVEN: Server started with --read-only flag
      const client = await createClient({ readOnly: true });
      // WHEN: Client requests tool list
      const tools = await client.listTools();
      // THEN: Write tools are not in the list
      const toolNames = tools.tools.map(t => t.name);
      expect(toolNames).not.toContain('create_work_item');
    });
  });
});
```

#### Test Suite 2: Combined Domain + Read-Only Filtering

```typescript
describe('Combined Domain and Read-Only Filtering E2E', () => {
  test('should load only read-only tools from work-items domain (~2 tools)', async () => {
    // GIVEN: Server started with --domains work-items --read-only
    const client = await createClient({ 
      domains: ['work-items'], 
      readOnly: true 
    });
    // WHEN: Client requests tool list
    const tools = await client.listTools();
    // THEN: Only 2 read-only work-items tools are available
    expect(tools.tools).toHaveLength(2);
    const toolNames = tools.tools.map(t => t.name);
    expect(toolNames).toEqual(expect.arrayContaining([
      'list_work_items',
      'get_work_item'
    ]));
    expect(toolNames).not.toContain('create_work_item');
    expect(toolNames).not.toContain('update_work_item');
  });

  test('should achieve 95% reduction with work-items + read-only', async () => {
    // GIVEN: Server started with --domains work-items --read-only
    const client = await createClient({ 
      domains: ['work-items'], 
      readOnly: true 
    });
    // WHEN: Client requests tool list
    const tools = await client.listTools();
    // THEN: Reduced from 43 to ~2 tools (95% reduction)
    expect(tools.tools.length).toBeLessThanOrEqual(2);
    const reduction = ((43 - tools.tools.length) / 43) * 100;
    expect(reduction).toBeGreaterThanOrEqual(95);
  });

  test('should load read-only tools from core + repositories (~7 tools)', async () => {
    // GIVEN: Server started with --domains core repositories --read-only
    const client = await createClient({ 
      domains: ['core', 'repositories'], 
      readOnly: true 
    });
    // WHEN: Client requests tool list
    const tools = await client.listTools();
    // THEN: Approximately 7 read-only tools from both domains
    expect(tools.tools.length).toBeGreaterThanOrEqual(6);
    expect(tools.tools.length).toBeLessThanOrEqual(8);
  });

  test('should achieve 84% reduction with core + repositories + read-only', async () => {
    // GIVEN: Server started with --domains core repositories --read-only
    const client = await createClient({ 
      domains: ['core', 'repositories'], 
      readOnly: true 
    });
    // WHEN: Client requests tool list
    const tools = await client.listTools();
    // THEN: Reduced from 43 to ~7 tools (84% reduction)
    const reduction = ((43 - tools.tools.length) / 43) * 100;
    expect(reduction).toBeGreaterThanOrEqual(80);
    expect(reduction).toBeLessThanOrEqual(90);
  });
});
```

### 2.2 Implementation Steps (Read-Only Mode)

#### Step 1: Add readOnly Property to ToolDefinition (RED → GREEN)

**File:** `src/shared/types/tool-definition.ts`

```typescript
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
  readOnly?: boolean; // NEW: Add read-only flag
}
```

**Tests:** Unit tests for type definition

#### Step 2: Mark All Existing Tools as Read-Only or Write (RED → GREEN)

Update each feature's `tool-definitions.ts` file:

**Example:** `src/features/work-items/tool-definitions.ts`

```typescript
export const workItemsTools: ToolDefinition[] = [
  {
    name: 'list_work_items',
    description: 'List work items in a project',
    inputSchema: zodToJsonSchema(ListWorkItemsSchema),
    readOnly: true, // NEW: Mark as read-only
  },
  {
    name: 'get_work_item',
    description: 'Get details of a specific work item',
    inputSchema: zodToJsonSchema(GetWorkItemSchema),
    readOnly: true, // NEW: Mark as read-only
  },
  {
    name: 'create_work_item',
    description: 'Create a new work item',
    inputSchema: zodToJsonSchema(CreateWorkItemSchema),
    readOnly: false, // NEW: Mark as write operation
  },
  {
    name: 'update_work_item',
    description: 'Update an existing work item',
    inputSchema: zodToJsonSchema(UpdateWorkItemSchema),
    readOnly: false, // NEW: Mark as write operation
  },
  {
    name: 'manage_work_item_link',
    description: 'Add or remove links between work items',
    inputSchema: zodToJsonSchema(ManageWorkItemLinkSchema),
    readOnly: false, // NEW: Mark as write operation
  },
];
```

**Tests:** Unit tests for each tool definition file

#### Step 3: Add Read-Only CLI Argument (RED → GREEN)

**File:** `src/index.ts`

```typescript
// Parse --read-only flag
const readOnlyMode = process.argv.includes('--read-only');

console.error(`Read-only mode: ${readOnlyMode ? 'ENABLED' : 'DISABLED'}`);
```

**Tests:** E2E tests for CLI parsing

#### Step 4: Update Server to Filter by Read-Only (RED → GREEN)

**File:** `src/server.ts`

```typescript
export function createAzureDevOpsServer(
  config: AzureDevOpsConfig,
  enabledDomains?: Set<string>,
  readOnlyMode = false // NEW: Add read-only parameter
): Server {
  // ... existing setup ...

  server.setRequestHandler(ListToolsRequestSchema, () => {
    let tools = [];
    
    const shouldInclude = (domain: string) => {
      return !enabledDomains || enabledDomains.has(domain);
    };

    // Collect tools from enabled domains
    if (shouldInclude(Domain.CORE)) {
      tools.push(...usersTools, ...organizationsTools, ...projectsTools);
    }
    if (shouldInclude(Domain.WORK_ITEMS)) {
      tools.push(...workItemsTools);
    }
    // ... other domains ...

    // NEW: Filter by read-only mode
    if (readOnlyMode) {
      tools = tools.filter(tool => tool.readOnly === true);
    }

    return { tools };
  });

  // ... rest of implementation ...
}
```

**Tests:** E2E tests for read-only filtering

#### Step 5: Run All Tests (RED → GREEN → REFACTOR)

```bash
npm test
```

---

## Phase 3: Integration and Documentation (0.5 day)

### 3.1 Integration Tests

Create comprehensive integration test suite:

**File:** `src/features/domains/integration.spec.e2e.ts`

```typescript
describe('Domain Filtering + Read-Only Mode Integration', () => {
  test('should work with all possible combinations', async () => {
    const testCases = [
      // No filters
      { domains: undefined, readOnly: false, expectedMin: 43, expectedMax: 43 },
      
      // Domain filtering only
      { domains: ['core'], readOnly: false, expectedMin: 4, expectedMax: 4 },
      { domains: ['work-items'], readOnly: false, expectedMin: 5, expectedMax: 5 },
      { domains: ['core', 'work-items'], readOnly: false, expectedMin: 9, expectedMax: 9 },
      
      // Read-only only
      { domains: undefined, readOnly: true, expectedMin: 20, expectedMax: 25 },
      
      // Combined
      { domains: ['work-items'], readOnly: true, expectedMin: 2, expectedMax: 2 },
      { domains: ['core', 'repositories'], readOnly: true, expectedMin: 6, expectedMax: 8 },
    ];

    for (const testCase of testCases) {
      const client = await createClient({
        domains: testCase.domains,
        readOnly: testCase.readOnly
      });
      const tools = await client.listTools();
      
      expect(tools.tools.length).toBeGreaterThanOrEqual(testCase.expectedMin);
      expect(tools.tools.length).toBeLessThanOrEqual(testCase.expectedMax);
    }
  });
});
```

### 3.2 Documentation Updates

#### Update README.md

Add usage examples:

```markdown
## Domain Filtering

Load only specific feature domains:

\`\`\`bash
# Load only work items tools
mcp-server-azure-devops --domains work-items

# Load multiple domains
mcp-server-azure-devops --domains core work-items repositories

# Comma-separated also works
mcp-server-azure-devops --domains core,work-items,repositories
\`\`\`

## Read-Only Mode

Run server in read-only mode for safe exploration:

\`\`\`bash
# Enable read-only mode
mcp-server-azure-devops --read-only

# Combine with domain filtering
mcp-server-azure-devops --domains work-items --read-only
\`\`\`

## Tool Reduction Examples

| Configuration | Tools | Reduction |
|---------------|-------|-----------|
| Default | 43 | 0% |
| `--domains work-items` | 5 | 88% |
| `--read-only` | ~22 | 49% |
| `--domains work-items --read-only` | 2 | 95% |
```

#### Update docs/tools/README.md

Add domain categorization:

```markdown
## Tools by Domain

### Core Domain (4 tools)
- list_organizations
- list_projects
- get_project
- get_me

### Work Items Domain (5 tools)
- list_work_items (read-only)
- get_work_item (read-only)
- create_work_item (write)
- update_work_item (write)
- manage_work_item_link (write)

... etc
```

---

## Test Execution Strategy

### Development Workflow

1. **Write failing E2E test** (RED)
   ```bash
   npm run test:e2e -- --testNamePattern="should load only core domain tools"
   ```

2. **Implement minimal code to pass** (GREEN)
   - Write just enough code to make the test pass
   - Don't over-engineer or add extra features

3. **Refactor and improve** (REFACTOR)
   - Clean up code
   - Remove duplication
   - Improve readability

4. **Run full test suite**
   ```bash
   npm test
   ```

5. **Commit when all tests pass**
   ```bash
   git add .
   git commit -m "feat: add domain filtering for work-items domain"
   ```

### Continuous Testing

```bash
# Watch mode for rapid feedback
npm run test:unit -- --watch

# Run E2E tests after each implementation
npm run test:e2e

# Full test suite before committing
npm test
```

### Test Coverage Goals

- **Unit Tests:** 90%+ coverage
- **E2E Tests:** All critical user paths
- **Integration Tests:** All domain combinations

---

## Success Criteria

### Phase 1: Domain Filtering
- ✅ All E2E tests pass
- ✅ All existing tests still pass (backward compatibility)
- ✅ Tool counts match expectations for each domain
- ✅ Invalid domains handled gracefully
- ✅ CLI argument parsing works correctly

### Phase 2: Read-Only Mode
- ✅ All E2E tests pass
- ✅ Read-only tools correctly identified
- ✅ Write tools filtered out in read-only mode
- ✅ CLI flag parsing works correctly

### Phase 3: Integration
- ✅ Combined filtering works as expected
- ✅ All test combinations pass
- ✅ Documentation updated
- ✅ README includes usage examples

### Overall Success
- ✅ Zero breaking changes to existing functionality
- ✅ All tests pass (unit + integration + E2E)
- ✅ Code coverage maintained or improved
- ✅ Performance not degraded
- ✅ User experience improved (fewer tools to choose from)

---

## Risk Mitigation

### Backward Compatibility
- Default behavior unchanged (all tools loaded)
- Existing users not affected unless they opt-in
- Graceful fallback for invalid configurations

### Testing Strategy
- E2E tests ensure real-world usage works
- Unit tests ensure individual components work
- Integration tests ensure components work together

### Rollback Plan
- Feature flags can be added if needed
- Each phase can be rolled back independently
- Git history allows easy reversion

---

## Timeline

### Day 1: Domain Filtering
- Morning: Write E2E tests (RED)
- Afternoon: Implement domain filtering (GREEN)
- Evening: Refactor and optimize (REFACTOR)

### Day 2: Read-Only Mode
- Morning: Write E2E tests (RED)
- Afternoon: Implement read-only filtering (GREEN)
- Evening: Integration tests (GREEN)

### Day 3: Polish and Documentation
- Morning: Combined filtering tests
- Afternoon: Documentation updates
- Evening: Final testing and PR preparation

---

## Next Steps

1. Review this plan with team
2. Set up development environment
3. Create feature branch: `feat/domain-filtering-read-only-mode`
4. Start with Phase 1, Step 1: Write first E2E test
5. Follow TDD cycle: RED → GREEN → REFACTOR
6. Commit frequently with descriptive messages
7. Run full test suite before each push
8. Create PR when all phases complete

---

## References

- Research Report: `docs/research/tool-loading-strategies.md`
- Existing E2E Tests: `src/server.spec.e2e.ts`
- Jest E2E Config: `jest.e2e.config.js`
- MCP SDK Docs: https://modelcontextprotocol.io/
