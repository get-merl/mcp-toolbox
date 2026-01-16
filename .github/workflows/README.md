# GitHub Actions Workflows

This repository uses 3 GitHub Actions workflows:

## 1. CI (`ci.yml`)

**Triggers**: Pull requests, pushes to main  
**Purpose**: Validate code quality on every change

**What it does**:

- Builds all packages
- Runs tests for all packages
- Runs linters
- **Does not publish anything**

**Local testing**:

```bash
pnpm run act:ci
```

**Known Issues with act**:

- Some tests may fail in act's Docker environment due to timing/environment differences
- Tests pass locally and in GitHub Actions
- Specific test: `check.test.ts > should return exit code 0 when in sync` fails in act but passes in GitHub Actions

---

## 2. MCP Toolbox Sync (`mcp-toolbox-sync.yml`)

**Triggers**: Daily at 3:17 AM UTC, manual via workflow_dispatch  
**Purpose**: Keep generated MCP wrappers in sync with upstream servers

**What it does**:

- Connects to configured MCP servers (Cloudflare, Supabase)
- Syncs tool definitions
- Regenerates TypeScript wrappers
- Creates PRs with changes
- **Requires auth tokens** (via GitHub Secrets)

**Auth tokens needed**:

- `CLOUDFLARE_API_TOKEN`
- `SUPABASE_ACCESS_TOKEN`

**Local testing** (without tokens):

```bash
# Servers will be skipped without tokens
pnpm run act:sync
```

**Local testing** (with real tokens):

```bash
CLOUDFLARE_API_TOKEN=xxx SUPABASE_ACCESS_TOKEN=yyy pnpm run act:sync
```

---

## 3. Release (`release.yml`)

**Triggers**: Pushes to main  
**Purpose**: Publish packages to npm when ready

**What it does**:

- Builds all packages
- Runs tests
- Uses changesets to manage versions
- **Conditionally** publishes to npm if:
  - Changesets are present (version changes)
  - `NPM_TOKEN` is configured in GitHub Secrets
- Creates "Version Packages" PR if changesets exist but haven't been published yet

**Behavior without `NPM_TOKEN`**:

- Workflow runs successfully (builds, tests)
- Publishing step is skipped (no failure)
- Safe to merge code before npm publishing is set up

**Setting up npm publishing**:

1. Create an npm access token at https://www.npmjs.com/settings/[username]/tokens
2. Add it as `NPM_TOKEN` in GitHub Secrets
3. Next push will enable publishing

**Local testing**:

```bash
pnpm run act:release
```

Note: Publishing step won't work locally (requires npm credentials). Tests may fail in act due to environment differences (same as CI workflow).

---

## Testing All Workflows

```bash
# Clean up containers
pnpm run act:clean

# Test individual workflows
pnpm run act:ci       # CI workflow
pnpm run act:sync     # Sync workflow
pnpm run act:release  # Release workflow
```

**Testing Notes**:

- `act:sync` works perfectly ✅
- `act:ci` and `act:release` have test failures in Docker environment
  - Tests pass locally via `pnpm test`
  - Tests pass in actual GitHub Actions
  - Known act/Docker environment issue with timing-sensitive tests

## Workflow Structure

We use a root-level `.github/` folder because:

- GitHub only reads workflows from the repository root
- Per-package workflows aren't supported by GitHub Actions
- We use Turborepo to efficiently run tasks only for changed packages

## Required Secrets

Configure these in GitHub repository settings → Secrets and variables → Actions:

| Secret                  | Used By       | Purpose                             |
| ----------------------- | ------------- | ----------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | sync          | Connect to Cloudflare MCP server    |
| `SUPABASE_ACCESS_TOKEN` | sync          | Connect to Supabase MCP server      |
| `NPM_TOKEN`             | release       | Publish packages to npm             |
| `GITHUB_TOKEN`          | release, sync | Create PRs (automatically provided) |
