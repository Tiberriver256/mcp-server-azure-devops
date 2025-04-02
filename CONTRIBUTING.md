# Contributing to Azure DevOps MCP Server

We love your input! We want to make contributing to Azure DevOps MCP Server as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## Development Process

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

## Pull Requests

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (see Commit Message Guidelines below)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Development Practices

This project follows Test-Driven Development practices. Each new feature should:

1. Begin with a failing test
2. Implement the minimal code to make the test pass
3. Refactor while keeping tests green

## Testing

### Unit Tests

Run unit tests with:

```bash
npm run test:unit
```

### Integration Tests

Integration tests require a connection to a real Azure DevOps instance. To run them:

1. Ensure your `.env` file is configured with valid Azure DevOps credentials:

   ```
   AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
   AZURE_DEVOPS_PAT=your-personal-access-token
   AZURE_DEVOPS_DEFAULT_PROJECT=your-project-name
   ```

2. Run the integration tests:
   ```bash
   npm run test:integration
   ```

### CI Environment

For running tests in CI environments (like GitHub Actions), see [CI Environment Setup](docs/ci-setup.md) for instructions on configuring secrets.

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

To simplify the process of creating correctly formatted commit messages, we've set up a tool that will guide you through the process. Simply use:

```bash
npm run commit
```

This will start an interactive prompt that will help you generate a properly formatted commit message.

## Release Process

This project uses [Conventional Commits](https://www.conventionalcommits.org/) to automate versioning and changelog generation. When contributing, please follow the commit message convention.

To create a commit with the correct format, use:
```bash
npm run commit
```

## Automated Release Workflow

Our project uses [Release Please](https://github.com/googleapis/release-please) to automate releases based on Conventional Commits. This approach manages semantic versioning, changelog generation, and GitHub Releases creation.

The workflow is automatically triggered on pushes to the `main` branch and follows this process:

1. Release Please analyzes commit messages since the last release
2. If releasable changes are detected, it creates or updates a Release PR
3. When the Release PR is merged, it:
   - Updates the version in package.json
   - Updates CHANGELOG.md with details of all changes
   - Creates a Git tag and GitHub Release
   - Publishes the package to npm

### Release PR Process

1. When commits with conventional commit messages are pushed to `main`, Release Please automatically creates a Release PR
2. The Release PR contains all the changes since the last release with proper version bump based on commit types:
   - `feat:` commits trigger a minor version bump
   - `fix:` commits trigger a patch version bump
   - `feat!:` or `fix!:` commits with breaking changes trigger a major version bump
3. Review the Release PR to ensure the changelog and version bump are correct
4. Merge the Release PR to trigger the actual release

This automation ensures consistent and well-documented releases that accurately reflect the changes made since the previous release.

## License

By contributing, you agree that your contributions will be licensed under the project's license. 