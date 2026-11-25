# Researching Azure DevOps REST APIs (Cloud + Server)

Source of truth: clone and browse the MicrosoftDocs REST API specs repo (Swagger 2.0 JSON).
If docs and specs disagree, treat specs as primary for request shapes and versions.
Repo: https://github.com/MicrosoftDocs/vsts-rest-api-specs.git

## Quick start

- Prefer cloning to a temporary location (ex: /tmp). Ask the human partner for a preferred location.
- Default path for this repo: ~/repos/vsts-rest-api-specs

```bash
# preferred: ask partner for target path
git clone https://github.com/MicrosoftDocs/vsts-rest-api-specs.git /tmp/vsts-rest-api-specs
```

## Repo layout (core)

```
vsts-rest-api-specs/
  specification/
    <area>/
      <version>/
        <area>.json
        httpExamples/
```

Notes:
- Each `<area>` is an API area (build, git, wit, work, etc).
- Each `<version>` is an API version folder.
- Most version folders include a single `<area>.json` Swagger file and optional `httpExamples/`.
- `httpExamples/` contains request/response JSON (file names include HTTP method + operation).

## Versions: Services vs Server

- Azure DevOps Services (cloud): numeric folders like `5.0`, `6.1`, `7.2`.
- Azure DevOps Server (on‑prem): folders like `azure-devops-server-7.0`, `azure-devops-server-7.1`.
- Older TFS: folders like `tfs-4.1`.

Rule of thumb:
- Start with the exact server version folder if it exists.
- If missing, drop to the closest lower version for that area.
- Server lags Services; some areas are Services-only.

## How to find the right spec

1. Identify area: use `ls specification` to find the service name.
2. Pick version folder: cloud vs server rules above.
3. Open `<area>.json` and inspect:
   - `info.version` (often includes `-preview` and optional `.n`)
   - `paths` (endpoints)
   - `parameters` (look for `api-Version-*` entries; descriptions include exact `api-version` values)
   - `definitions` (request/response models)
4. Check `httpExamples/` for concrete request/response samples.
5. Use path placeholders: `{organization}` (Services) maps to org; on‑prem maps to collection.

## Helpful local searches

```bash
# find an area by name
rg --files -g 'git.json' specification

# scan endpoints for a keyword
rg -n "_apis" specification/git/7.2/git.json

# see path placeholders
rg -n '\\{organization\\}|\\{project\\}' specification/build/7.2/build.json

# find api-version parameters
rg -n '"api-version"' specification/build/7.2/build.json

# confirm area metadata
rg -n 'x-ms-vss-(area|resource-area-id)' specification/build/7.2/build.json
```

## Azure DevOps Server (on‑prem) specifics

- Specs still list `host: dev.azure.com` in many files; on‑prem uses your server host instead.
- Base path may include a collection segment (ex: `/tfs/{collection}`); use your server's actual base URL.
- Use the on‑prem version folder as the authority for routes and parameters.
- `api-version` is still required; use the exact value from the on‑prem spec.
- Check `httpExamples/` for base paths and collection/project shapes.

## Extra tips

- Many areas share naming: `build`, `git`, `wit`, `work`, `distributedTask`, `serviceEndpoint`, etc.
- Preview APIs show `-preview` in `info.version`; expect breaking changes.
- If you’re unsure which area owns an endpoint, search across specs with `rg -n`.

---

## Checked-in Server Profiles & Offline Compatibility Matrix

Because `MicrosoftDocs/vsts-rest-api-specs` is external and may be unavailable in offline/CI environments, authoritative declarative server profiles are checked in under `tests/fixtures/ado-server-profiles/`:

| Profile Fixture | Product | Max GA `api-version` | Max Preview | Analytics OData Versions | Deployment / Hosts |
| --- | --- | --- | --- | --- | --- |
| `server-2019-rtm.json` | Azure DevOps Server 2019 RTM | `5.0` | `5.0-preview` | `v1.0`, `v2.0`, `v3.0-preview` *(requires Analytics extension)* | Single-host on-prem (`/tfs/{collection}` or `/{collection}`) |
| `server-2020.json` | Azure DevOps Server 2020 | `6.0` | `6.0-preview` | `v1.0`, `v2.0`, `v3.0-preview` | Single-host on-prem (`/tfs/{collection}` or `/{collection}`) |
| `server-2022.json` | Azure DevOps Server 2022 | `7.0` | `7.0-preview` | `v1.0`, `v2.0`, `v3.0-preview`, `v4.0-preview` | Single-host on-prem (`/tfs/{collection}` or `/{collection}`) |
| `services-cloud.json` | Azure DevOps Services (Cloud) | `7.1` | `7.2-preview` | `v1.0`, `v2.0`, `v3.0-preview`, `v4.0-preview` | Multi-host (`dev.azure.com`, `almsearch.dev.azure.com`, `vssps.dev.azure.com`, `analytics.dev.azure.com`) |

Verify profile invariants, URL routing, `VsoClient`/direct-HTTP negotiation, and OData guardrails offline via `tests/matrix/onprem-compat.spec.ts`.

## Server 2019 / 2020 / 2022 & Services Endpoint Compatibility Matrix

| Feature / Endpoint | Transport | Server 2019 RTM (`5.0`) | Server 2020 (`6.0`) | Server 2022 (`7.0`) | Services (`7.1` / `7.2-preview`) | Key Constraints & Failure Modes |
| --- | --- | --- | --- | --- | --- | --- |
| `pipelines/*` (`_apis/pipelines/...`) | Direct HTTP / SDK | **MISSING** (`404`) | `6.0-preview.1` | `7.0` GA | `7.1` GA | Bare `6.0` fails on Server 2020 (`VssInvalidPreviewVersionException`); `7.1` fails on all on-prem servers (`VssVersionOutOfRangeException`). |
| `build/timeline` & `build/logs` (`_apis/build/builds/...`) | Direct HTTP | `5.0` GA | `6.0` GA | `7.0` GA | `7.1` GA | Fails on Server 2019/2020/2022 if `AZURE_DEVOPS_API_VERSION` is left at default `7.1`. |
| `build/stages` (`_apis/build/builds/{id}/stages/{ref}`) | SDK (`buildApi`) | **MISSING** (`404`) | `6.0-preview.1` | `7.0` GA | `7.1` GA | Added in Server 2020; `PATCH` returns `204 No Content`. |
| `search/*` (`_apis/search/*searchresults`) | Direct HTTP | `5.0-preview.1` | `6.0-preview.1` | `7.0` GA | `7.1` GA | Must include `-preview.1` on 5.0/6.0; on-prem MUST stay on collection host (never `almsearch.dev.azure.com`). |
| `wiki/wikis` & `wiki/pages` | Direct HTTP | `5.0` GA | `6.0` GA | `7.0` GA | `7.1` GA | Respects server max GA version; avoid defaulting to `7.1` on on-prem. |
| `wiki/pagesbatch` (`_apis/wiki/wikis/{id}/pagesbatch`) | Direct HTTP | **MISSING** (`404`) | `6.0-preview.1` | `7.0` GA | `7.1` GA | Added in Server 2020; bare `6.0` rejected without `-preview.1`. |
| `testplan/*` (`_apis/testplan/...`) | `VsoClient` (`7.2-preview.1`) | **MISSING** (`404`) | `6.0-preview.1` / `.2` | `7.0` GA | `7.1` GA / `7.2-preview` | `VsoClient` auto-downgrades on 2020+; throws `Failed to find api location` on Server 2019. |
| `testresults/*` (`_apis/testresults/resultdetailsbybuild`) | SDK (`testResultsApi`) | **MISSING** | **MISSING** | **MISSING** | `7.2-preview.1` | Cloud Services preview area; use classic `Test` area (`_apis/test/runs`, `results`) for Server 2019–2022 compatibility. |
| `wit/comments` (`_apis/wit/workItems/{id}/comments`) | SDK (`witApi`) | `5.0-preview.2` *(legacy read-only loc `19335ae7-...`; CRUD **MISSING**)* | `6.0-preview.3` | `7.0-preview.3` | `7.1-preview.4` (`maxVersion: 7.2`, `rv: 4`) | Always `-preview` across all products. Server 2019 requires `System.History` fallback for adding comments; `format=markdown` requires `>=7.1-preview.4` (Services only). |
| `core/teams` (`_apis/teams`) | SDK (`coreApi`) | `5.0-preview.2` *(no `$expandIdentity`)* | `6.0-preview.3` | `7.0-preview.3` | `7.1-preview.3` | Always `-preview`; `$expandIdentity` query parameter is invalid on Server 2019. |
| `work/iterations/workitems` | SDK (`workApi`) | `5.0-preview.1` | `6.0-preview.1` | `7.0` GA | `7.1` GA | Preview on 5.0/6.0; GA on 7.0+. `iterationId` must be a UUID. `$timeframe` on `iterations` only accepts `current` (filter `past`/`future` client-side). |
| `git/refs` (`_apis/git/repositories/{id}/refs`) | SDK / `VsoClient` | `5.0` GA *(no `$top`/`continuationToken`)* | `6.0` GA | `7.0` GA | `7.1` GA | `$top` and `continuationToken` pagination parameters were added in 6.0 (Server 2020+). |
| `users/get-me` & `organizations/*` | Direct HTTP | Cloud-only | Cloud-only | Cloud-only | `7.1` / `6.0` (`vssps`) | Explicitly Cloud-only (`vssps.dev.azure.com` / `app.vssps.visualstudio.com`). |

## Direct-HTTP vs `VsoClient` Auto-Negotiation Rules

1. **SDK `VsoClient` (`azure-devops-node-api/VsoClient.js`) Auto-Negotiation**:
   - Before calling an area, `VsoClient.beginGetAreaLocations(area)` sends `OPTIONS {baseUrl}/_apis/{area}` and caches `ApiResourceLocation[]` by lowercase location GUID.
   - `VsoClient.autoNegotiateApiVersion(location, requestedVersion)` evaluates:
     - If `requestedVersion <= location.releasedVersion`, or preview-compatible with `location.maxVersion` and `location.resourceVersion`, it keeps `requestedVersion`.
     - Otherwise it downgrades automatically: if `location.maxVersion === location.releasedVersion` (exact string equality), it returns GA `location.maxVersion`; if `location.releasedVersion === '0.0'` (preview-only), it returns `${location.maxVersion}-preview.${location.resourceVersion}`.
   - If a location GUID is absent from the server's `OPTIONS` catalog (e.g., `pipelines`, `testplan`, `build/stages`, `wiki/pagesbatch`, or CRUD `wit/comments` on Server 2019 RTM), `VsoClient.getVersioningData` throws `Failed to find api location for area: ... id: ...`.
   - On-prem servers return `{ count: 0, value: null }` for `GET /_apis/ResourceAreas`, causing `WebApi` to keep every area on the single configured server collection URL.
2. **Direct-HTTP Endpoints (`search`, `pipelines`, `wikis`, `build/timeline`, `build/logs`)**:
   - Direct-HTTP calls do **not** run `VsoClient` automatically. Blindly sending Cloud default `api-version=7.1` triggers HTTP `400 VssVersionOutOfRangeException` on Server 2019/2020/2022.
   - Sending a bare GA version (e.g. `5.0` or `6.0`) to a preview-only endpoint (`search/*` on 5.0/6.0; `pipelines/*`, `wiki/pagesbatch`, `build/stages` on 6.0) triggers HTTP `400 VssInvalidPreviewVersionException`.
   - Direct-HTTP callers should negotiate per-area versions against `OPTIONS /_apis/{area}` (falling back cleanly to configured `AZURE_DEVOPS_API_VERSION` + area preview rules) and never leak Cloud hosts (`almsearch.dev.azure.com`, `vssps.dev.azure.com`, `analytics.dev.azure.com`) when targeting on-prem Server URLs.
3. **Host & Collection Path Routing (`src/shared/azure-devops-url.ts`)**:
   - **Services (Cloud)**: `https://dev.azure.com/{org}` and legacy `https://{org}.visualstudio.com` both normalize to:
     - `coreBaseUrl`: `https://dev.azure.com/{org}`
     - `searchBaseUrl`: `https://almsearch.dev.azure.com/{org}`
     - `identityBaseUrl`: `https://vssps.dev.azure.com/{org}`
     - `analyticsBaseUrl`: `https://analytics.dev.azure.com/{org}`
   - **Server (On-Prem)**: Both `/tfs` virtual-directory URLs (`https://ado.corp:8080/tfs/DefaultCollection`) and non-`/tfs` collection URLs (`https://ado.corp/DefaultCollection`) keep `coreBaseUrl === searchBaseUrl === identityBaseUrl === analyticsBaseUrl` on the exact configured origin and collection path (zero `/tfs/` fabrication and zero Cloud host leakage).

## Azure DevOps Analytics OData (`v1.0` – `v4.0-preview`)

### Cloud vs On-Prem URL Routing

| Deployment | Project-Scoped (Recommended Default) | Organization / Collection-Scoped |
| --- | --- | --- |
| **Azure DevOps Services (Cloud)** | `https://analytics.dev.azure.com/{org}/{project}/_odata/{version}/{EntitySet}` | `https://analytics.dev.azure.com/{org}/_odata/{version}/{EntitySet}` |
| **Azure DevOps Server (with `/tfs` vdir)** | `https://{host}:{port}/tfs/{collection}/{project}/_odata/{version}/{EntitySet}` | `https://{host}:{port}/tfs/{collection}/_odata/{version}/{EntitySet}` |
| **Azure DevOps Server (no `/tfs` vdir)** | `https://{host}:{port}/{collection}/{project}/_odata/{version}/{EntitySet}` | `https://{host}:{port}/{collection}/_odata/{version}/{EntitySet}` |
| **Metadata (`$metadata`)** | `{analyticsBaseUrl}/{project}/_odata/{version}/$metadata` | `{analyticsBaseUrl}/_odata/{version}/$metadata` |
| **Batch (`$batch`, POST, max 1 op)** | `{analyticsBaseUrl}/{project}/_odata/{version}/$batch` | `{analyticsBaseUrl}/_odata/{version}/$batch` |

### OData Versions & Product Support Matrix

| OData Version | Status | Entity Sets Added | Product Support |
| --- | --- | --- | --- |
| `v1.0` | GA | Core Work Tracking: `WorkItems`, `WorkItemRevisions`, `WorkItemSnapshot`, `WorkItemBoardSnapshot`, `WorkItemLinks`, `Areas`, `Iterations`, `BoardLocations`, `Dates`, `Tags`, `Teams`, `Users` | Services; Server 2019 (with Analytics extension), Server 2020, Server 2022 |
| `v2.0` | Latest GA | Adds `Processes` + enhanced filtering | Services; Server 2019 (with Analytics extension), Server 2020, Server 2022 |
| `v3.0-preview` | Preview *(recommended default)* | Adds Pipelines (`Pipelines`, `PipelineRuns`, `PipelineJobs`, `PipelineRunActivityResults`, `PipelineTasks`, `Branches`) and Test (`TestRuns`, `TestResults`, `TestResultsDaily`, `Tests`, `TestPoints`, `TestPointHistorySnapshots`, `TestSuites`, `TestConfigurations`) | Services; Server 2019 (with Analytics extension), Server 2020, Server 2022 |
| `v4.0-preview` | Latest Preview | Adds pool/capacity snapshots: `ParallelPipelineJobsSnapshot`, `TaskAgentPoolSizeSnapshots`, `TaskAgentRequestSnapshots` | Services; Server 2022+ *(fall back to `v3.0-preview` on Server 2019/2020)* |

### Hard Limits, Auth & The 7 Server-Enforced `[BLOCKED]` Rules

- **Auth & Permissions**: PAT requires `Analytics (Read)` (`vso.analytics`); Entra ID uses the Azure DevOps resource scope; caller must have project permission `View analytics = Allow` (Stakeholders are denied). Analytics does **not** enforce area-path-level security and is eventually consistent.
- **Transport & Paging Limits**:
  - **GET URL length**: Hard server cap of **3,000 characters** (exceeding returns HTTP `404 Not Found`); client guards at 2,800 chars or switches to single-operation `POST .../$batch`. Always percent-encode `+` as `%2B` in timezone offsets.
  - **Server-side paging**: 10,000 rows per page via `@odata.nextLink`. Always validate `isSameOrigin(nextLink, analyticsBaseUrl)` before following any `@odata.nextLink` (SSRF protection) and never auto-drain unbounded pages.
  - **Timeouts / Throttling**: `TF400733` query timeout (narrow date filters or aggregate via `$apply`); `429` throttling.
- **7 `[BLOCKED]` Rules Matrix**:

| # | `[BLOCKED]` Rule | Server Error / Behavior | Client-Side Poka-Yoke Guardrail (`src/features/analytics/odata-guardrails.ts`) |
| --- | --- | --- | --- |
| 1 | **No non-aggregated queries on `*Snapshot` entities** (`WorkItemSnapshot`, `WorkItemBoardSnapshot`, `TestPointHistorySnapshots`, `ParallelPipelineJobsSnapshot`, `TaskAgentPoolSizeSnapshots`, `TaskAgentRequestSnapshots`) | Rejected (`400`) | Reject snapshot queries unless `$apply` includes `aggregate(...)` (with `DateSK`/`DateValue` in `groupby`). |
| 2 | **No entity key or property path addressing** (e.g., `WorkItems(123)` or `WorkItems(123)/AssignedTo`) | `400 VS403483` | Strict `ALLOWED_ENTITY_SETS` allowlist; reject `(`, `)`, `/`, `\`, `..`, `?`, `#`, whitespace in `entitySet`. |
| 3 | **No `$expand=Revisions` on `WorkItems`** | Rejected (`400`) | Block `$expand=Revisions`; direct callers to query `WorkItemRevisions` directly. |
| 4 | **No `groupby` on high-cardinality unique key / free-text columns** (`WorkItemId`, `WorkItemSK`, `Title`, `PipelineRunId`, `TestResultId`, etc.) | `400 VS403522` | Parse `groupby((...))` columns and reject known high-cardinality key/text columns client-side. |
| 5 | **No `countdistinct` aggregation** (or unsupported operators: `$search`, `$crossjoin`, `$rollup`, `topcount`/`bottomcount`, `isdefined`) | Rejected (`400`) | Strip quoted string literals and reject unsupported OData operators before sending. |
| 6 | **No multi-query `$batch` requests** | Rejected (`400`) | `buildSingleOpBatchPayload` strictly emits **1** GET operation per `multipart/mixed` `$batch` POST. |
| 7 | **Max 800 columns per query** | `400 VS403670` | Require explicit `$select`/`$apply` or inject a bounded `DEFAULT_SELECT_BY_ENTITY_SET` projection; enforce `<= 800` total selected columns. |

