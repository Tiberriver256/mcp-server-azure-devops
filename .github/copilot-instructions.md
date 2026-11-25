# Azure DevOps MCP Server - Development Instructions

Always reference these instructions first and fall back to search or shell commands only when you encounter unexpected information that does not match what is documented here.

## Prerequisites

- **Node.js `>=24.0.0`** and **npm** (Node 24/26 LTS; uses native TypeScript execution, `node:test` + V8 coverage, `node --watch`, `fetch`, `process.loadEnvFile`, `path.posix.matchesGlob`, and `zlib`).

## Building and Running

### 1. Install Dependencies
```bash
npm install  # NEVER CANCEL. Set timeout to 60+ seconds.
```

### 2. Build the Server
```bash
npm run build  # Cleans `dist/` and compiles TypeScript to `dist/` directory.
```

### 3. Run Tests
```bash
# Offline tests: unit + property-based + differential via node:test (no ADO credentials required; alias: npm test)
npm run test:unit

# Offline tests with native V8 coverage thresholds (lines >=70%, branches >=50%, functions >=60%)
npm run test:coverage

# Property-based tests only (fast-check)
npm run test:prop

# Differential oracle tests only
npm run test:diff

# Watch mode for offline tests (node --test --watch)
npm run test:watch

# Integration tests (requires Azure DevOps credentials)
npm run test:int

# E2E tests (requires Azure DevOps credentials)
npm run test:e2e
```

### 4. Code Quality
```bash
npm run typecheck       # Type-checks src/ and all test suites (tsconfig.test.json) with TypeScript 7
npm run typecheck:tests # Type-checks all test suites (tsconfig.test.json)
npm run lint            # Runs Oxlint (type-aware; configured in oxlint.config.mts)
npm run lint:fix        # Auto-fix linting issues
npm run format          # Runs oxfmt for code formatting
npm run format:check    # Checks formatting with oxfmt
```

### 5. Run the Server
```bash
# Always configure environment first using `.env` (copy from `.env.example`)
npm run dev        # Development mode with auto-restart using native node --watch
npm run start      # Production mode - runs compiled version from `dist/index.js`
npm run inspector  # Debug mode with MCP Inspector (@modelcontextprotocol/inspector@2.16.0)
```

## Environment Setup

Copy `.env.example` to `.env` and configure Azure DevOps credentials:

```bash
cp .env.example .env
# Edit .env with your Azure DevOps credentials
```

**Required environment variables:**
```
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
AZURE_DEVOPS_AUTH_METHOD=pat  # Options: pat, azure-identity, azure-cli
AZURE_DEVOPS_PAT=your-personal-access-token  # For PAT auth
AZURE_DEVOPS_DEFAULT_PROJECT=your-project-name  # Optional
```

**Alternative setup methods:**
- Use `./setup_env.sh` script for interactive environment setup with Azure CLI
- See `docs/authentication.md` for comprehensive authentication guides
- Copy from `docs/examples/` directory for ready-to-use configurations (PAT, Azure Identity, Azure CLI)
- For CI/CD environments: Reference `docs/ci-setup.md` for secrets configuration

## Submitting Changes

Before submitting a PR, ensure:

1. **Linting and formatting pass:**
   ```bash
   npm run lint:fix && npm run format && npm run format:check
   ```

2. **Build and typecheck succeed:**
   ```bash
   npm run build && npm run typecheck
   ```

3. **Offline test suites & coverage pass:**
   ```bash
   npm run test:coverage
   ```

4. **Integration/E2E tests pass** (when Azure DevOps credentials are available):
   ```bash
   npm run test:int && npm run test:e2e
   ```

5. **Conventional commits:**
   ```bash
   npm run commit  # Guided commit message creation (@commitlint/prompt-cli)
   ```

## Project Architecture

- **TypeScript 7** with strict, erasable configuration (`tsconfig.json` targeting `ES2024`, `erasableSyntaxOnly: true`, CJS `dist/` output; use explicit `.ts` / `/index.ts` relative imports, `.js` for `azure-devops-node-api` / `typed-rest-client` subpaths, and `as const` objects instead of `enum` — no `@/` path aliases)
- **Declarative Feature Modules (`src/features/*`)**: Each of the 10 toolsets (`users`, `organizations`, `projects`, `repositories`, `work-items`, `search`, `pull-requests`, `pipelines`, `wikis`, `test-plans`) exports a `FeatureModule` built with `defineTool(...)`.
- **Deep Shared Seams (`src/shared/*`)**:
  - `src/shared/session/azure-devops-session.ts` — Single cached `AzureDevOpsSession` (`ToolContext`) per server instance (caches `WebApi` connections, manages config/project resolution, provides `requestAzureDevOps`).
  - `src/shared/auth/auth-factory.ts` — Lazy-loads `@azure/identity` (only for non-PAT) and `azure-devops-node-api`, caches/refreshes Entra tokens, deduplicates in-flight token refreshes.
  - `src/shared/http/http-client.ts` — Zero-dependency native `fetch` HTTP client with response-size caps, timeouts, secret-free `HttpError`, and typed status mapping.
  - `src/shared/registry/tool-registry.ts` — `defineTool` + lazy Draft-07 `input` JSON Schema generation.
  - `src/shared/logging.ts` — Stdio-safe stderr logger (`no-console` enforced on `src/`).
  - `src/shared/resources/ado-resource-uri.ts` — `ado://` resource URI parser/builder.
  - `src/shared/utils/` — Stream helpers, bounded concurrency, zero-dep glob matcher, zero-dep ZIP reader, Zod-to-JSON-Schema helper.
- **Test Strategy:** Native `node:test` + `node:assert/strict` with V8 coverage, following the Testing Trophy + Property-Based & Differential Testing (see `docs/testing/README.md`):
  - Unit tests: `*.spec.unit.ts`
  - Property-based tests: `*.spec.prop.ts` (`fast-check`)
  - Differential tests: `*.spec.diff.ts`
  - Integration tests: `*.spec.int.ts`
  - E2E tests: `*.spec.e2e.ts`

### Key Directories
- `src/index.ts` and `src/server.ts` — CLI entry point and MCP Server wiring
- `src/features/<toolset>/` — Declarative feature modules (`schemas.ts`, `types.ts`, `index.ts`, `<tool>/feature.ts`)
- `src/shared/` — Deep shared infrastructure modules
- `tests/setup.ts` — Native Node test runner preload setup (`--import ./tests/setup.ts`) for integration and E2E tests
- `docs/` — Documentation (authentication, testing, tools, important knowledge)

## Adding or Modifying a Tool

1. Add or update the Zod input schema in `src/features/<toolset>/schemas.ts`
2. Implement or update core logic in `src/features/<toolset>/<tool-name>/feature.ts`
3. Register the tool in `src/features/<toolset>/index.ts` via `defineTool({ name, description, schema, readOnly, handler })`
4. Add/update co-located tests (`*.spec.unit.ts`, plus `*.spec.prop.ts` / `*.spec.diff.ts` for pure logic)
5. Update `README.md` and `docs/tools/`
6. Run `npm run format && npm run lint && npm run build && npm run typecheck && npm run test:coverage`

## Runtime Dependencies

Minimal runtime dependency surface (5 packages):
- `@modelcontextprotocol/sdk` — MCP protocol implementation
- `azure-devops-node-api` — Azure DevOps typed SDK clients
- `@azure/identity` — Lazy-loaded Entra ID / Azure CLI credentials
- `zod` — Runtime input validation and Draft-07 JSON Schema generation
- `diff` — Unified patch parsing and generation for commits/PR diffs

## Troubleshooting

- **Build fails:** Run `npm run build` and `npm run typecheck` to verify strict TypeScript errors and explicit `.ts` relative imports.
- **Lint errors:** Run `npm run lint:fix` and inspect `oxlint.config.mts`. Never use `console.log` in `src/` (corrupts MCP stdio JSON-RPC; use `src/shared/logging.ts`).
- **Tests fail:** Offline tests (`npm run test:unit`) must pass without Azure DevOps credentials. Integration/E2E tests require `.env`.
- **Authentication issues:** See `docs/authentication.md`.

## Available Skills

| Skill Name | Use When... | Path |
|------------|-------------|------|
| skill-creator | Create new skills, modify and improve existing skills, and measure skill performance. | [skills/skill-creator/SKILL.md](skills/skill-creator/SKILL.md) |
| azure-devops-rest-api | Implementing new Azure DevOps API integrations, exploring API capabilities, or referencing the official OpenAPI specs from vsts-rest-api-specs. | [skills/azure-devops-rest-api/SKILL.md](skills/azure-devops-rest-api/SKILL.md) |