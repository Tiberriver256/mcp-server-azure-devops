# Roadmap

This community server continues alongside Microsoft's product-supported Azure DevOps MCP
([microsoft/azure-devops-mcp](https://github.com/microsoft/azure-devops-mcp)).
If you use Azure DevOps Services (cloud), start with the official server.
See [Discussion #237](https://github.com/Tiberriver256/mcp-server-azure-devops/discussions/237).

> **Living Shared Ledger:** Detailed milestone tracking, architectural
> decisions (ADRs), verified baseline metrics, on-premises Azure DevOps Server
> quirks, and ongoing learnings live in [`LEDGER.md`](./LEDGER.md).

## Where this server differentiates

1. **Azure DevOps Server (on-premises) support** — including older versions the
   official server may not work with. PAT auth against a collection URL
   (e.g. `https://server:8080/tfs/DefaultCollection`) is the primary path.
2. **Features not yet available upstream** — small, broadly useful tools that
   work on both cloud and on-prem where the REST API allows it.
3. **Stability for automation** — minimal runtime dependency footprint, property
   and differential testing, integration tests against real Azure DevOps, and reproducible CI.

## Completed milestones

- [x] Keep dependencies secure: weekly Dependabot and `npm audit --audit-level=moderate` in CI (0 audit vulnerabilities).
- [x] Upgrade `azure-devops-node-api` to v17 and `zod` to v4 (with native `z.toJSONSchema` input schemas).
- [x] Eliminate unnecessary runtime dependencies (`axios`, `dotenv`, `minimatch`, `jszip`) in favor of Node.js 22+ built-ins (`fetch`, `process.loadEnvFile`, `path.posix.matchesGlob`, `zlib`).
- [x] Deliver pipeline inspection/triggers, toolset filtering + fail-closed read-only mode, pull request merge/auto-complete, and Test Plans / Test Suites / Test Cases tools with on-prem compatibility.
- [x] Unify server session, auth caching, declarative tool registry, and introduce property-based (`fast-check`) + differential test suites.
- [x] Modernize platform toolchain to Node.js `>=24.0.0` (CI Node 24/26 LTS matrix), pure TypeScript 7 (`ES2024`, `erasableSyntaxOnly`), native `node:test` + V8 coverage, native `node --watch`, and MCP Inspector `2.16.0` — removing Jest, `ts-jest`, the legacy TypeScript 6 alias, and `tsx`.

## Near term

- [ ] Evaluate Docker / Streamable HTTP transport requests against the "on-prem first, don't duplicate upstream" rule.
- [ ] Prune stale bot/dependabot branches and keep the release-please flow current.
- [ ] Expand on-premises Azure DevOps Server version-matrix testing for REST `api-version` edge cases.

## Non-goals

- Duplicating everything the official Microsoft server already does well for
  Azure DevOps Services cloud users.
- Breaking on-prem compatibility to chase cloud-only APIs.

## How to contribute

Open an issue noting whether your scenario is **Azure DevOps Services** or
**Azure DevOps Server (version)** — on-prem reports get priority here.
