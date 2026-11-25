# Contributing to Azure DevOps MCP Server

We love your input! We want to make contributing to Azure DevOps MCP Server as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## Prerequisites

- **Node.js `>=22.0.0`** (the server uses Node 22 built-ins including `fetch`, `process.loadEnvFile`, `path.posix.matchesGlob`, and `zlib`)
- **npm**

## Development Process

We use GitHub to host code, track issues and feature requests, and accept pull requests.

## Pull Requests

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (see Commit Message Guidelines below)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Development Practices

This project follows Test-Driven Development practices. Each new feature or bug fix should:

1. Begin with a failing test (unit, property-based, or differential as appropriate)
2. Implement the minimal clean code to make the test pass
3. Refactor while keeping tests, linting, and type-checking green

## Project Structure

The server is organized into declarative feature modules backed by deep shared seams:

```
src/
 ├── index.ts          # CLI entry point, env loading, stdio transport
 ├── server.ts         # MCP Server setup, tool filtering, O(1) dispatch, resources
 ├── shared/
 │   ├── auth/         # Lazy-loaded auth providers & refreshable bearer handler
 │   ├── config/       # Env loading, version, tool filtering
 │   ├── enums/        # Prototype-safe bidirectional enum mappers
 │   ├── errors/       # Typed AzureDevOpsError hierarchy & secret redaction
 │   ├── http/         # Zero-dependency native fetch HttpClient
 │   ├── registry/     # Declarative defineTool() & FeatureModule contract
 │   ├── resources/    # ado:// resource URI parser & builder
 │   ├── session/      # Single cached AzureDevOpsSession (ToolContext)
 │   └── utils/        # Streams, bounded concurrency, globs, ZIP reader, JSON Schema
 └── features/
     ├── organizations/
     ├── pipelines/
     ├── projects/
     ├── pull-requests/
     ├── repositories/
     ├── search/
     ├── test-plans/
     ├── users/
     ├── wikis/
     └── work-items/
```

Each feature module exports a `FeatureModule` (`{ toolset, tools }`) whose tools are declared with `defineTool({ name, description, schema, readOnly, handler })`. Every handler receives the shared `ToolContext` session (`ctx.getWebApi()`, `ctx.requestAzureDevOps()`, `ctx.resolveProjectId()`, `ctx.config`, etc.).

### Adding a New Tool or Feature

When adding a tool to an existing feature module:

1. Add the Zod input schema to the feature's `schemas.ts`
2. Implement the core logic in `src/features/<toolset>/<tool-name>/feature.ts`
3. Register the tool in the feature's `index.ts` using `defineTool(...)` with an explicit `readOnly: true | false`
4. Add focused tests (`*.spec.unit.ts`, and `*.spec.prop.ts` / `*.spec.diff.ts` for pure parsers, validators, or algorithms)
5. Update `README.md` and `docs/tools/` to document the tool

When adding a brand-new toolset, also add its name to `TOOLSET_NAMES` in `src/shared/config/tool-filter.ts` and register the module in `src/server.ts`.

## Local Setup (run the server from source)

```bash
npm ci
cp .env.example .env   # then edit values

# option A: run compiled output (matches what gets published)
npm run build
npm start

# option B: dev mode (auto-reload)
npm run dev
```

## Testing & Quality Checks

### Offline Verification (no Azure DevOps credentials required)

```bash
npm run test:unit      # Runs unit, property-based, and differential tests + coverage
npm run test:prop      # Runs fast-check property-based suites only (*.spec.prop.ts)
npm run test:diff      # Runs differential oracle suites only (*.spec.diff.ts)
npm run lint           # Runs Oxlint (type-aware)
npm run format:check   # Checks formatting with oxfmt
npm run build          # Compiles TypeScript to dist/
```

### Integration & E2E Tests

Integration and E2E tests require a connection to a real Azure DevOps instance:

1. Configure `.env` with valid Azure DevOps credentials:

   ```
   AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
   AZURE_DEVOPS_AUTH_METHOD=pat
   AZURE_DEVOPS_PAT=your-personal-access-token
   AZURE_DEVOPS_DEFAULT_PROJECT=your-project-name
   ```

2. Run the integration or E2E suites:

   ```bash
   npm run test:int
   npm run test:e2e
   ```

For details on our testing strategy (including property-based and differential testing), see [docs/testing/README.md](docs/testing/README.md). For CI secrets setup, see [docs/ci-setup.md](docs/ci-setup.md).

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for our commit messages. This leads to more readable messages that are easy to follow when looking through the project history and enables automatic versioning and changelog generation.

### Commit Message Format

Each commit message consists of a **header**, a **body**, and a **footer**. The header has a special format that includes a **type**, a **scope**, and a **subject**:

```
<type>(<scope>): <subject>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

The **header** is mandatory, while the **scope** of the header is optional.

### Type

Must be one of the following:

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code (white-space, formatting, etc)
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **perf**: A code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **build**: Changes that affect the build system or external dependencies
- **ci**: Changes to our CI configuration files and scripts
- **chore**: Other changes that don't modify src or test files

### Subject

The subject contains a succinct description of the change:

- Use the imperative, present tense: "change" not "changed" nor "changes"
- Don't capitalize the first letter
- No period (.) at the end

### Body

The body should include the motivation for the change and contrast this with previous behavior.

### Footer

The footer should contain any information about **Breaking Changes** and is also the place to reference GitHub issues that this commit closes.

Breaking Changes should start with the word `BREAKING CHANGE:` with a space or two newlines. The rest of the commit message is then used for this.

### Using the Interactive Tool

To simplify the process of creating correctly formatted commit messages, run:

```bash
npm run commit
```

This starts the interactive [`@commitlint/prompt-cli`](https://commitlint.js.org/reference/prompt.html) prompt, driven by the repo's `commitlint.config.js`, and then runs `git commit` with the generated message (stage your changes first). The `commit-msg` hook also validates every commit with commitlint.

## Release Process

This project uses [Conventional Commits](https://www.conventionalcommits.org/) and [Release Please](https://github.com/googleapis/release-please) to automate semantic versioning, changelog generation, GitHub Releases, and npm publishing via Trusted Publishers (OIDC).

1. Release Please analyzes commit messages pushed to `main`
2. If releasable changes are detected, it creates or updates a Release PR:
   - `feat:` commits trigger a minor version bump
   - `fix:` commits trigger a patch version bump
   - `feat!:` or `fix!:` commits with breaking changes trigger a major version bump
3. Merging the Release PR updates `package.json` and `CHANGELOG.md`, tags the release, and publishes to npm.

If you encounter issues with the release process (e.g., failed npm publish, need to re-release), see the [Release Troubleshooting Guide](docs/release-troubleshooting.md).

## License

By contributing, you agree that your contributions will be licensed under the project's license.