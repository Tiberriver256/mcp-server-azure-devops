# Release Troubleshooting Guide

This guide helps you resolve common issues with the release-please automation and npm publishing.

## Table of Contents

- [Understanding the Release Process](#understanding-the-release-process)
- [Common Issues](#common-issues)
  - [Failed npm Publish](#failed-npm-publish)
  - [Release Already Exists](#release-already-exists)
  - [Manual Release Needed](#manual-release-needed)
- [Solutions](#solutions)
  - [Re-publishing an Existing Release](#re-publishing-an-existing-release)
  - [Force a New Release](#force-a-new-release)

## Understanding the Release Process

The release process uses [release-please](https://github.com/googleapis/release-please) to automate releases:

1. **Automated PR Creation**: When commits are pushed to `main`, release-please analyzes conventional commits and creates/updates a release PR
2. **Release Creation**: When the release PR is merged, release-please:
   - Creates a GitHub release with the new version tag
   - Updates `CHANGELOG.md`, `package.json`, and `.github/release-please-manifest.json`
3. **npm Publishing**: After a release is created, the workflow automatically:
   - Checks out the tagged version
   - Installs dependencies
   - Builds the package
   - Publishes to npm using [NPM Trusted Publishers](https://docs.npmjs.com/generating-provenance-statements) with provenance (no NPM_TOKEN needed)

## Common Issues

### Failed npm Publish

**Symptom**: GitHub release exists, but the package is not on npm.

**Cause**: The npm publish step failed (e.g., OIDC authentication error, network issue, npm downtime, or GitHub Actions permissions issue).

**How to verify**:
```bash
# Check if version exists on npm
npm view @tiberriver256/mcp-server-azure-devops@0.1.44

# Check latest version
npm view @tiberriver256/mcp-server-azure-devops version
```

**Solution**: [Re-publish the existing release](#re-publishing-an-existing-release)

### Release Already Exists

**Symptom**: Trying to re-run the workflow, but all publish steps are skipped.

**Cause**: Release-please tracks state via the manifest file (`.github/release-please-manifest.json`). If the version in the manifest matches `package.json`, it considers the release complete and doesn't set `release_created=true`.

**Solution**: [Re-publish the existing release](#re-publishing-an-existing-release) or [Force a new release](#force-a-new-release)

### Manual Release Needed

**Symptom**: Need to publish a hotfix or re-release immediately.

**Solution**: [Re-publish the existing release](#re-publishing-an-existing-release)

## Solutions

### Re-publishing an Existing Release

Use this when a GitHub release exists but npm publish failed. This will publish the existing tagged version to npm without creating a new release.

**Steps**:

1. Go to the [Actions tab](../../actions/workflows/release-please.yml) in GitHub
2. Click "Run workflow" dropdown (you'll see this on the right side)
3. Enter the **full git tag** in the "tag" field (e.g., `mcp-server-azure-devops-v0.1.44`)
   - Find tags in the [releases page](../../releases) or [tags page](../../tags)
4. Click "Run workflow"

**What this does**:
- Checks out the exact code from that tag
- Builds the package
- Publishes to npm
- Does NOT create a new GitHub release
- Does NOT modify version files or CHANGELOG

**Example**:
```
Tag: mcp-server-azure-devops-v0.1.44
```

### Force a New Release

Use this when you need to create a completely new release (incrementing the version number).

**Option 1: Let release-please handle it (Recommended)**

1. Make a new commit with conventional commit format:
   ```bash
   git commit --allow-empty -m "chore: trigger new release"
   git push origin main
   ```

2. Release-please will create a new release PR
3. Merge the PR to trigger the release

**Option 2: Manual version bump**

1. Update version in `package.json`:
   ```bash
   npm version patch  # for 0.1.44 -> 0.1.45
   # or
   npm version minor  # for 0.1.44 -> 0.2.0
   # or
   npm version major  # for 0.1.44 -> 1.0.0
   ```

2. Update `.github/release-please-manifest.json` to match the new version

3. Update `CHANGELOG.md` with the new version section

4. Commit and push:
   ```bash
   git add package.json package-lock.json .github/release-please-manifest.json CHANGELOG.md
   git commit -m "chore: release v0.1.45"
   git push origin main
   ```

5. Create a tag and release manually:
   ```bash
   git tag mcp-server-azure-devops-v0.1.45
   git push origin mcp-server-azure-devops-v0.1.45
   ```

6. Then use [Re-publish the existing release](#re-publishing-an-existing-release) to publish to npm

## Verification

After publishing, verify the package is available:

```bash
# Check specific version
npm view @tiberriver256/mcp-server-azure-devops@0.1.44

# Check latest version
npm view @tiberriver256/mcp-server-azure-devops version

# Try installing
npm install @tiberriver256/mcp-server-azure-devops@0.1.44
```

## Additional Resources

- [Release Please Documentation](https://github.com/googleapis/release-please)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [npm Publishing Guide](https://docs.npmjs.com/cli/v9/commands/npm-publish)
