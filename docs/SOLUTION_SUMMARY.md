# Solution Summary: Re-triggering Failed Release 0.1.44

## Problem Statement
Release 0.1.44 was created on GitHub but the npm publish step failed. Attempting to re-run the workflow results in all publish steps being skipped because release-please thinks the release is already complete.

## Root Cause Analysis
1. ✅ Release `mcp-server-azure-devops-v0.1.44` was created on GitHub (2026-02-05T15:38:57Z)
2. ❌ npm package was NOT published (latest on npm is still 0.1.43)
3. 🔄 Subsequent workflow runs skip publish steps because:
   - `release-please-manifest.json` shows version 0.1.44
   - `package.json` shows version 0.1.44
   - When these match, release-please sets `release_created=false`
   - All publish steps have condition `if: steps.release.outputs.release_created`

## Solution Implemented

### 1. Enhanced Workflow with Manual Dispatch
Added `workflow_dispatch` trigger to `.github/workflows/release-please.yml` that allows:
- **Normal operation**: Push to main → automatic release-please flow (unchanged)
- **Manual re-publish**: Specify a tag → checkout and publish that specific tag to npm

### 2. New Manual Publish Job
Created a separate `manual-publish` job that:
- Only runs when a tag is manually specified via workflow_dispatch
- Checks out the exact code from the specified tag
- Installs dependencies, builds, and publishes to npm
- Does NOT create a new release or modify any version files

### 3. Comprehensive Documentation
Created `docs/release-troubleshooting.md` with:
- Explanation of the release process
- Common issues and their causes
- Step-by-step solutions for each scenario
- Verification commands

### 4. Updated CONTRIBUTING.md
Added reference to the troubleshooting guide in the Release Process section.

## How to Use (Immediate Action for 0.1.44)

To re-publish release 0.1.44 to npm:

1. Go to: https://github.com/Tiberriver256/mcp-server-azure-devops/actions/workflows/release-please.yml
2. Click "Run workflow" button (dropdown on the right side)
3. Enter tag: `mcp-server-azure-devops-v0.1.44`
4. Click "Run workflow"

The workflow will:
- ✅ Checkout tag `mcp-server-azure-devops-v0.1.44`
- ✅ Install dependencies with `npm ci`
- ✅ Build the package with `npm run build`
- ✅ Publish to npm with `npm publish --access public`

## Verification After Publishing

```bash
# Check if version 0.1.44 is now on npm
npm view @tiberriver256/mcp-server-azure-devops@0.1.44

# Check if latest version is now 0.1.44
npm view @tiberriver256/mcp-server-azure-devops version

# Try installing
npm install @tiberriver256/mcp-server-azure-devops@0.1.44
```

## Files Changed

1. `.github/workflows/release-please.yml`
   - Added `workflow_dispatch` trigger with `tag` input
   - Added conditional logic to `release-please` job
   - Added new `manual-publish` job

2. `docs/release-troubleshooting.md` (NEW)
   - Complete troubleshooting guide
   - Step-by-step instructions
   - Verification commands

3. `CONTRIBUTING.md`
   - Added link to troubleshooting guide

## Benefits

1. **Immediate**: Can re-publish 0.1.44 right now without code changes
2. **No Side Effects**: Does not modify versions, CHANGELOG, or create new releases
3. **Reusable**: Can be used for any future failed publish scenarios
4. **Safe**: Only publishes the exact code from the specified tag
5. **Documented**: Clear instructions for maintainers

## Future Prevention

The enhanced workflow prevents this issue from recurring by providing a clear path to:
- Re-publish any failed release
- Manually publish hotfixes
- Recover from npm downtime or authentication issues

## Next Steps

1. ✅ Merge this PR to enable the manual workflow dispatch feature
2. ⏳ Run manual workflow with tag `mcp-server-azure-devops-v0.1.44`
3. ⏳ Verify package appears on npm
4. ⏳ Document success in this issue/PR

## Technical Details

### Workflow Logic

```yaml
on:
  push:
    branches: [main]          # Normal automatic flow
  workflow_dispatch:           # Manual trigger
    inputs:
      tag:
        description: 'Git tag to publish...'
        required: false

jobs:
  release-please:
    # Only runs if NO tag specified (automatic flow)
    if: ${{ github.event.inputs.tag == '' || github.event.inputs.tag == null }}
    
  manual-publish:
    # Only runs if tag IS specified (manual flow)
    if: ${{ github.event.inputs.tag != '' && github.event.inputs.tag != null }}
    steps:
      - checkout tag
      - npm ci
      - npm run build
      - npm publish
```

### Why This Works

1. **Separate Job**: Manual publish is independent of release-please's state tracking
2. **Direct Checkout**: Uses git tag directly, bypassing manifest comparison
3. **No State Modification**: Doesn't touch version files or manifest
4. **Same Build Steps**: Uses identical build/publish steps as automatic flow

## Risk Assessment

- **Low Risk**: Changes only affect workflow triggering mechanism
- **No Code Changes**: TypeScript/JavaScript code remains unchanged
- **Backward Compatible**: Normal push-to-main flow unchanged
- **Well-Tested Pattern**: workflow_dispatch is a standard GitHub Actions feature
