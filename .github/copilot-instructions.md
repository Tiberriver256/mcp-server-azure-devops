# Azure DevOps MCP Server - Development Instructions

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively
- Bootstrap, build, and test the repository:
  - `npm install` -- takes 25 seconds. NEVER CANCEL. Set timeout to 60+ seconds.
  - `npm run build` -- takes 5 seconds. Compiles TypeScript to `dist/` directory.
  - `npm run lint` -- takes 3 seconds. Runs ESLint for code quality.
  - `npm run format` -- takes 3 seconds. Runs Prettier for code formatting.
- Test the application:
  - `npm run test:unit` -- takes 19 seconds. NEVER CANCEL. Set timeout to 60+ seconds.
  - `npm run test:int` -- takes 18 seconds. NEVER CANCEL. Set timeout to 60+ seconds. Requires Azure DevOps credentials.
  - `npm run test:e2e` -- takes 6 seconds. NEVER CANCEL. Set timeout to 30+ seconds. Requires Azure DevOps credentials.
  - `npm test` -- runs all tests, takes 45 seconds total. NEVER CANCEL. Set timeout to 90+ seconds.
- Run the application:
  - **ALWAYS** configure environment first using `.env` file (copy from `.env.example`).
  - Development: `npm run dev` -- runs with auto-restart using ts-node-dev.
  - Production: `npm run start` -- runs compiled version from `dist/index.js`.
  - Debugging: `npm run inspector` -- runs server with MCP Inspector tool.

## Environment Setup
- Copy `.env.example` to `.env` and configure Azure DevOps credentials.
- Required environment variables:
  - `AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization`
  - `AZURE_DEVOPS_AUTH_METHOD=pat` (or `azure-identity`, `azure-cli`)
  - `AZURE_DEVOPS_PAT=your-personal-access-token` (for PAT auth)
  - `AZURE_DEVOPS_DEFAULT_PROJECT=your-project-name` (optional)
- Use the `setup_env.sh` script for interactive environment setup with Azure CLI.
- Application will fail gracefully with clear error messages if credentials are missing.

## Validation
- ALWAYS run through complete validation steps after making changes:
  - `npm run lint:fix && npm run format` -- must pass before committing.
  - `npm run build && npm run test:unit` -- must complete successfully.
  - If you have Azure DevOps credentials: `npm run test:int && npm run test:e2e`.
- ALWAYS manually test actual functionality when changing core features:
  - Configure `.env` file (copy from `.env.example` and update values).
  - Test server startup with `npm run dev` -- should start or fail gracefully with clear error messages.
  - Test MCP protocol using `npm run inspector` (requires working Azure DevOps credentials).
- ALWAYS run the full test suite at least once before completing your work.
- Unit tests must pass even without Azure DevOps credentials -- they use mocks for all external dependencies.

## Critical Timing Information
- **NEVER CANCEL** build or test commands. All operations complete within reasonable time:
  - Dependencies install: 25 seconds (use 60+ second timeout)
  - Build compilation: 5 seconds 
  - Unit tests: 19 seconds (use 60+ second timeout)
  - Integration tests: 18 seconds (use 60+ second timeout) 
  - E2E tests: 6 seconds (use 30+ second timeout)
  - All tests combined: 45 seconds (use 90+ second timeout)
- Lint and format operations are fast (3 seconds each).

## Project Architecture
- **TypeScript** project with strict configuration (`tsconfig.json`).
- **Feature-based architecture** in `src/features/` - each Azure DevOps feature area is a separate module.
- **MCP Protocol** implementation for AI assistant integration.
- **Test pyramid**: Unit tests (`.spec.unit.ts`), Integration tests (`.spec.int.ts`), E2E tests (`.spec.e2e.ts`).
- **Path aliases**: Use `@/` instead of relative imports (e.g., `import { something } from '@/shared/utils'`).

## Common Development Tasks

### Adding a New Feature
- Create feature module in `src/features/[feature-name]/`
- Include: `feature.ts`, `schema.ts`, `tool-definitions.ts`, `index.ts`
- Add corresponding test files: `.spec.unit.ts`, `.spec.int.ts`
- Register in `src/server.ts`
- Follow existing patterns in other feature modules

### Modifying Existing Features
- Update logic in `src/features/[feature-name]/feature.ts`
- Update schemas in `schemas.ts` if input/output changes
- Update tool definitions if MCP interface changes
- ALWAYS update or add tests
- Run validation steps

### Working with Tests
- Unit tests: Mock all external dependencies, focus on logic
- Integration tests: Test with real Azure DevOps APIs (requires credentials)
- E2E tests: Test complete MCP server functionality
- Tests are co-located with feature code
- Use `@/shared/test/test-helpers` for common test utilities

## Dependencies and Tools
- **Core**: `@modelcontextprotocol/sdk` for MCP protocol
- **Azure**: `azure-devops-node-api`, `@azure/identity` for Azure DevOps APIs
- **Validation**: `zod` for schema validation and type safety
- **Testing**: `jest` with different configs for unit/int/e2e tests
- **Code Quality**: ESLint, Prettier, Husky for git hooks
- **Development**: `ts-node-dev` for development server with auto-restart

## CI/CD Information
- GitHub Actions workflow in `.github/workflows/main.yml`
- Runs on Pull Requests to `main` branch
- Steps: Install → Lint → Build → Unit Tests → Integration Tests → E2E Tests
- Integration and E2E tests require Azure DevOps secrets in CI
- Use `npm run commit` for conventional commit messages
- Release automation with `release-please`

## Important Files and Locations
- Main server entry: `src/index.ts` and `src/server.ts`
- Feature modules: `src/features/[feature-name]/`
- Shared utilities: `src/shared/` (auth, errors, types, config)
- Azure DevOps client: `src/clients/azure-devops.ts`
- Test setup: `tests/setup.ts`
- Configuration: `tsconfig.json`, `.eslintrc.json`, `package.json`
- Documentation: `docs/` (authentication, testing, tools)

## Troubleshooting Common Issues
- **Build fails**: Check TypeScript errors, ensure all imports are valid
- **Tests fail**: Check if Azure DevOps credentials are properly configured for integration tests
- **Lint errors**: Run `npm run lint:fix` to auto-fix, then address remaining issues
- **Server won't start**: Verify `.env` file configuration, check error messages
- **Import errors**: Use `@/` path aliases, check `tsconfig.json` paths configuration
- **Authentication issues**: See `docs/authentication.md` for detailed setup guides

## Development Workflow Summary
1. Create or checkout feature branch from `main`
2. Install dependencies: `npm install` (first time or after dependency changes)
3. Make code changes following existing patterns in `src/features/`
4. Write or update tests (unit required, integration if you have Azure DevOps access)
5. Validate changes:
   - `npm run lint:fix && npm run format`
   - `npm run build && npm run test:unit`
   - Copy `.env.example` to `.env` and test startup: `npm run dev`
6. If you have Azure DevOps access: run `npm run test:int && npm run test:e2e`
7. Test actual functionality manually using `npm run inspector`
8. Commit using `npm run commit` for conventional commits
9. Create Pull Request

Always ensure the CI pipeline will pass by running the same checks locally before pushing.