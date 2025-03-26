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

## Automated Release Workflow

Our project uses an automated release workflow that leverages Conventional Commits to manage semantic versioning, generate changelogs, and create GitHub Releases.

The workflow is currently triggered manually via GitHub Actions' `workflow_dispatch` feature. In the future, it may be configured to run automatically on merges to the `main` branch.

When the workflow runs, it:

1. Analyzes the commit messages since the last release
2. Determines the appropriate semantic version bump
3. Updates the version in package.json
4. Generates or updates the CHANGELOG.md file
5. Creates a new Git tag
6. Creates a GitHub Release with release notes

This automation ensures consistent and well-documented releases that accurately reflect the changes made since the previous release.

## License

By contributing, you agree that your contributions will be licensed under the project's license. 