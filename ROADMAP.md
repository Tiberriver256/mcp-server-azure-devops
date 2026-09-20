# Roadmap

This community server continues alongside Microsoft's product-supported Azure DevOps MCP
([microsoft/azure-devops-mcp](https://github.com/microsoft/azure-devops-mcp)).
If you use Azure DevOps Services (cloud), start with the official server.
See [Discussion #237](https://github.com/Tiberriver256/mcp-server-azure-devops/discussions/237).

## Where this server differentiates

1. **Azure DevOps Server (on-premises) support** — including older versions the
   official server may not work with. PAT auth against a collection URL
   (e.g. `https://server:8080/tfs/DefaultCollection`) is the primary path.
2. **Features not yet available upstream** — small, broadly useful tools that
   work on both cloud and on-prem where the REST API allows it.
3. **Stability for automation** — conservative dependency upgrades, integration
   tests against real Azure DevOps, reproducible CI.

## Near term

- [ ] Keep dependencies secure: weekly Dependabot, `npm audit --audit-level=high`
  in CI (done), conservative minor bumps first.
- [ ] Evaluate `azure-devops-node-api` v13 → v17 major upgrade on a dedicated
  branch with full unit + integration runs (breaking-change risk, not in normal
  dependency bumps).
- [ ] Evaluate `zod` v3 → v4 and `dotenv` 16 → 17 majors separately.
- [ ] Triage long-standing feature asks (pipeline builds, tool filtering /
  read-only mode, test plans, Docker/HTTP transport) against the
  "on-prem first, don't duplicate upstream" rule.
- [ ] Prune stale bot/dependabot branches and keep the release-please flow
  current.

## Non-goals

- Duplicating everything the official Microsoft server already does well for
  Azure DevOps Services cloud users.
- Breaking on-prem compatibility to chase cloud-only APIs.

## How to contribute

Open an issue noting whether your scenario is **Azure DevOps Services** or
**Azure DevOps Server (version)** — on-prem reports get priority here.
