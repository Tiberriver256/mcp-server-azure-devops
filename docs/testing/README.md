# Testing Strategy

## Overview

This project combines the **Testing Trophy** approach with **Property-Based Testing** (`fast-check`) and **Differential Testing** against independent reference oracles. Rather than writing brittle mock-mirroring unit tests or snapshots, we focus on behavioral tests, algebraic/security invariants, and wire-level verification.

## Test Layers

### 1. Static Analysis (The Base)

- **TypeScript (`npm run build`)**: Strict compile-time type checking (`tsconfig.json`)
- **Oxlint (`npm run lint`)**: Type-aware linting (`oxlint.config.mts`), including `no-console` on `src/` to protect MCP stdio JSON-RPC framing
- **Oxfmt (`npm run format:check`)**: Consistent formatting
- **Zod v4**: Runtime schema validation and Draft-07 `input` JSON Schema generation

### 2. Unit Tests (`*.spec.unit.ts`)

- Co-located with feature/shared code
- Test focused business logic, error mapping, streaming I/O, and server dispatch seams without touching external networks
- Run together with property & differential tests via `npm run test:unit`

### 3. Property-Based Tests (`*.spec.prop.ts`)

- Powered by [`fast-check`](https://fast-check.dev/)
- Assert mathematical, structural, and security invariants over hundreds of generated inputs with automatic minimal counterexample shrinking:
  - **Security invariants**: Fail-closed `--read-only` filtering (`tool-filter.spec.prop.ts`) and secret-redaction guarantees (`error-redaction.spec.prop.ts`)
  - **Parser / round-trip laws**: `ado://` resource URI round-tripping (`ado-resource-uri.spec.prop.ts`), Azure DevOps Services/Server URL idempotence (`azure-devops-url.spec.prop.ts`), prototype-safe enum bijections (`enums/index.spec.prop.ts`), ZIP round-tripping & random-byte fuzzing (`zip-reader.spec.prop.ts`)
  - **Domain & schema invariants**: Test Plans XML step encoding & strict Gregorian ISO dates (`test-plans/helpers.spec.prop.ts`), pipeline helpers (`pipelines.spec.prop.ts`), permutation-invariant tree formatting & literal search/replace (`tree-and-commit.spec.prop.ts`), and PR cross-field schema rules (`pull-requests.spec.prop.ts`)
- Run individually via `npm run test:prop`

### 4. Differential Tests (`*.spec.diff.ts`)

- Compare production implementations against genuinely independent reference oracles:
  - `zip-reader.spec.diff.ts`: Bidirectional byte-for-byte verification against Python's stdlib `zipfile`
  - `http-client.spec.diff.ts`: Real loopback Node `http.Server` wire-level verification (Unicode query encoding, binary/text/JSON payloads, `maxResponseBytes` truncation, secret-free errors, HTTP status mapping)
  - `glob.spec.diff.ts`: Independent glob-to-RegExp oracle over randomized patterns and repo names
  - `tool-filter.spec.diff.ts`: Brute-force set-algebra oracle + Node's native `util.parseArgs` oracle
  - `azure-devops-url.spec.diff.ts`: Independent RFC-3986 Azure DevOps URL grammar oracle
  - `test-plans/helpers.spec.diff.ts`: Independent XML tag/entity parser round-trip oracle + Gregorian UTC epoch offset oracle
  - `create-commit.spec.diff.ts`: `createCommit` literal search/replace fast path vs `diff` unified-patch path equivalence
  - `tool-registry.spec.diff.ts`: All 60 registered Zod schemas vs emitted MCP `ListToolsResultSchema` Draft-07 JSON Schemas
- Run individually via `npm run test:diff`

### 5. Integration Tests (`*.spec.int.ts`)

- Co-located with features and run against a real Azure DevOps instance when credentials are configured in `.env`
- Run with `npm run test:int`

### 6. End-to-End Tests (`src/server.spec.e2e.ts`)

- Spawns the compiled MCP server over stdio and drives it through the official `@modelcontextprotocol/sdk` `Client`
- Run with `npm run test:e2e`

## File Naming Conventions

| Pattern | Layer | Credentials Required | Command |
| ------- | ----- | -------------------- | ------- |
| `*.spec.unit.ts` | Unit | No | `npm run test:unit` |
| `*.spec.prop.ts` | Property-based (`fast-check`) | No | `npm run test:prop` (also included in `test:unit`) |
| `*.spec.diff.ts` | Differential (independent oracles) | No | `npm run test:diff` (also included in `test:unit`) |
| `*.spec.int.ts` | Integration | Yes (`.env`) | `npm run test:int` |
| `*.spec.e2e.ts` | End-to-End (MCP stdio) | Yes (`.env`) | `npm run test:e2e` |

## Guidelines

1. **Test behavior and invariants, not mock plumbing.** Avoid snapshot tests of formatting output or tests that merely assert mock return values pass through unchanged.
2. **Prefer property & differential tests for parsers, validators, encoders, and filters.** They cover orders of magnitude more edge cases than hand-picked examples.
3. **Keep offline tests fast and hermetic.** Always clean up temporary directories in `finally` / `afterEach` blocks.
4. **Co-locate tests with the modules they verify.**