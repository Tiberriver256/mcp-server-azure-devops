# NPM Trusted Publishers Migration Guide

This document explains the migration from token-based NPM publishing to NPM Trusted Publishers (Provenance) authentication.

## What Changed

### Workflow Changes

The `.github/workflows/release-please.yml` workflow has been updated to use NPM Trusted Publishers instead of token-based authentication:

**Before:**
```yaml
- name: Publish to npm
  run: npm publish --access public
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**After:**
```yaml
- name: Publish to npm
  run: npm publish --provenance --access public
```

### Key Differences

1. **No Secret Token Required**: The `NPM_TOKEN` secret is no longer needed
2. **Provenance Flag**: Added `--provenance` flag to enable trusted publishing
3. **OIDC Authentication**: Uses OpenID Connect (OIDC) tokens from GitHub Actions
4. **Enhanced Security**: Provides cryptographic proof of package origin

## Benefits of NPM Trusted Publishers

1. **Improved Security**: No long-lived tokens that can be leaked or stolen
2. **Supply Chain Transparency**: Automated provenance statements prove package authenticity
3. **Reduced Maintenance**: No need to rotate or manage NPM tokens
4. **Verifiable Builds**: Anyone can verify that packages were built by GitHub Actions from specific commits

## NPM Configuration Required

To complete the migration, you need to configure the package on npmjs.com:

### Step 1: Log into NPM

Go to https://www.npmjs.com/ and log in to your account.

### Step 2: Configure Trusted Publishers

1. Navigate to your package: https://www.npmjs.com/package/@tiberriver256/mcp-server-azure-devops
2. Click on "Settings" tab
3. Scroll to "Publishing access" section
4. Click "Add trusted publisher"
5. Select "GitHub Actions"
6. Fill in the details:
   - **Repository owner**: `Tiberriver256`
   - **Repository name**: `mcp-server-azure-devops`
   - **Workflow**: `release-please.yml`
   - **Environment** (optional): Leave empty unless using GitHub environments
7. Click "Add"

### Step 3: Verify Configuration

After adding the trusted publisher configuration:
1. The workflow will authenticate using OIDC tokens
2. No `NPM_TOKEN` secret is needed
3. Publishes will include provenance attestations

## GitHub Actions Requirements

The workflow already has the necessary permissions configured:

```yaml
permissions:
  contents: write
  pull-requests: write
  issues: write
  id-token: write  # Required for OIDC authentication
```

The `id-token: write` permission allows GitHub Actions to generate OIDC tokens for authentication with NPM.

## Verification

After the next release, you can verify provenance is working:

### Check Provenance on NPM

1. Visit your package page on npmjs.com
2. Look for the "Provenance" badge on the package version
3. Click the badge to see the build details and GitHub Actions workflow information

### Using npm CLI

```bash
# View provenance information for a specific version
npm view @tiberriver256/mcp-server-azure-devops@VERSION --json | jq .dist.attestations

# Or check the latest version
npm view @tiberriver256/mcp-server-azure-devops --json | jq .dist.attestations
```

## Troubleshooting

### Publishing Fails with "Cannot verify OIDC token"

**Cause**: NPM Trusted Publishers is not configured for the package.

**Solution**: Follow [Step 2: Configure Trusted Publishers](#step-2-configure-trusted-publishers) above.

### Publishing Fails with "Missing id-token permission"

**Cause**: The workflow doesn't have the `id-token: write` permission.

**Solution**: This is already configured in the workflow. Ensure no environment-level permissions override it.

### NPM Still Asking for Token

**Cause**: The `--provenance` flag is not being used, or trusted publishers is not configured.

**Solution**: 
1. Verify the workflow includes `--provenance` flag
2. Ensure trusted publishers is configured on npmjs.com

## Rolling Back

If you need to roll back to token-based publishing:

1. Revert the workflow changes
2. Add the `NPM_TOKEN` secret back to GitHub repository secrets
3. Remove the `--provenance` flag from the publish command

## Additional Resources

- [NPM Provenance Documentation](https://docs.npmjs.com/generating-provenance-statements)
- [GitHub Actions OIDC Documentation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [NPM Trusted Publishers Guide](https://github.blog/2023-04-19-introducing-npm-package-provenance/)

## Next Steps

1. **Configure NPM Trusted Publishers**: Follow the steps in [NPM Configuration Required](#npm-configuration-required)
2. **Test the Workflow**: Create a test release or manually trigger the workflow to verify publishing works
3. **Remove NPM_TOKEN Secret**: After confirming everything works, you can delete the `NPM_TOKEN` secret from GitHub repository settings (Settings > Secrets and variables > Actions)
