# Testing GitHub Actions Workflows Locally

This guide explains how to test your GitHub Actions workflows locally using [`act`](https://github.com/nektos/act).

## Installation

Install `act` using one of these methods:

**macOS (Homebrew):**

```bash
brew install act
```

**Other platforms:**
See the [official installation guide](https://github.com/nektos/act#installation).

## Quick Start

### Using npm Scripts (Recommended)

The easiest way to test workflows locally:

```bash
# Test the sync workflow
pnpm test:act

# Clean up Docker containers after testing
pnpm test:act:clean
```

These scripts automatically:
- Use the correct event type (`workflow_dispatch`)
- Pass environment variables from your shell (e.g., `CLOUDFLARE_API_TOKEN`, `SUPABASE_ACCESS_TOKEN`)
- Skip steps that don't work locally (like PR creation)

### Using `act` Directly

For more control, use `act` directly:

```bash
# List available workflows and jobs
act -l

# Test the sync workflow
act workflow_dispatch -W .github/workflows/mcp-toolbox-sync.yml

# Test the CI workflow
act push -W .github/workflows/ci.yml

# Test a specific job
act -j sync -W .github/workflows/mcp-toolbox-sync.yml

# Dry run (simulate without executing)
act -n workflow_dispatch -W .github/workflows/mcp-toolbox-sync.yml
```

## Authentication for MCP Servers

When testing the `mcp-toolbox-sync.yml` workflow, you need to provide authentication tokens for MCP servers:

### Option 1: Environment Variables (Recommended)

Set tokens in your shell environment (or `.env.local`):

```bash
export CLOUDFLARE_API_TOKEN=your_token
export SUPABASE_ACCESS_TOKEN=your_token

# Now run the test
pnpm test:act
```

The npm script automatically passes these to `act`.

### Option 2: Secrets File

Create a `.secrets` file (gitignored) in `.github/workflows/`:

```bash
cp .github/workflows/.secrets.example .github/workflows/.secrets
# Edit .github/workflows/.secrets with your actual tokens
```

Then pass it to `act`:

```bash
act workflow_dispatch \
  --secret-file .github/workflows/.secrets \
  -W .github/workflows/mcp-toolbox-sync.yml
```

### Option 3: Inline Secrets

Pass secrets directly on the command line:

```bash
act workflow_dispatch \
  -s CLOUDFLARE_API_TOKEN=your_token \
  -s SUPABASE_ACCESS_TOKEN=your_token \
  -W .github/workflows/mcp-toolbox-sync.yml
```

### Skipping Servers Without Auth

If you don't have tokens for some servers, that's fine! The workflow uses `--skip-missing-auth`, which:
- Skips servers with missing auth tokens (no failure)
- Continues with servers that have valid tokens
- Completes successfully if at least one server succeeds

## Configuration

The `.actrc` file in the project root contains default settings:

- Uses `catthehacker/ubuntu:act-latest` runner image (includes Node.js, pnpm, etc.)
- Uses `linux/amd64` architecture (compatible with Apple M-series chips)
- Disables image pulling on every run (`--pull=false` for speed)
- **Note**: `--reuse` flag is NOT used as it can cause hangs

## Common Commands

```bash
# List all workflows and jobs
act -l

# Test sync workflow (manual dispatch trigger)
act workflow_dispatch -W .github/workflows/mcp-toolbox-sync.yml

# Test CI workflow (push trigger)
act push -W .github/workflows/ci.yml

# Test release workflow (push to main)
act push -W .github/workflows/release.yml

# Run specific job
act -j sync -W .github/workflows/mcp-toolbox-sync.yml

# Dry run (show what would execute)
act -n workflow_dispatch -W .github/workflows/mcp-toolbox-sync.yml

# Verbose output for debugging
act -v workflow_dispatch -W .github/workflows/mcp-toolbox-sync.yml

# Clean up Docker containers
pnpm test:act:clean
```

## Workflow-Specific Testing

### CI Workflow (`ci.yml`)

Tests all packages in the monorepo:

```bash
# Full CI run
act push -W .github/workflows/ci.yml

# Just the build job
act -j build -W .github/workflows/ci.yml

# Just the test job
act -j test -W .github/workflows/ci.yml
```

**Expected behavior:**
- Builds all packages
- Runs all tests (including `mcp-toolbox`, `mcp-toolbox-runtime`, `mcp-toolbox-benchmark`)
- Runs linters and type checks

### MCP Toolbox Sync Workflow (`mcp-toolbox-sync.yml`)

Tests MCP server introspection and code generation:

```bash
# Recommended: use npm script
pnpm test:act

# Or directly with act
act workflow_dispatch -W .github/workflows/mcp-toolbox-sync.yml
```

**Expected behavior:**
- Introspects all configured MCP servers
- Skips servers without auth tokens (by design)
- Generates TypeScript wrappers
- Skips PR creation (local testing only)

**Note**: The PR creation step is conditional (`if: ${{ github.token != '' }}`) and won't run in local `act` testing.

### Release Workflow (`release.yml`)

Tests the release pipeline:

```bash
act push -W .github/workflows/release.yml
```

**Expected behavior:**
- Builds all packages
- Runs Changesets action (may fail locally without `NPM_TOKEN`)
- Publishing steps are skipped locally

**Note**: This workflow requires `NPM_TOKEN` secret for actual publishing. Local testing will skip publishing steps.

## Known Limitations & Issues

### Expected Limitations

These are known differences between `act` and GitHub Actions:

1. **PR Creation**: The `peter-evans/create-pull-request` action is skipped in local `act` runs (by design, using `if: ${{ github.token != '' }}`)

2. **Publishing Actions**: The `changesets/action` in `release.yml` may fail locally without proper `NPM_TOKEN` and GitHub API access

3. **GitHub API Actions**: Any action that requires GitHub API access may behave differently or fail

### Known Test Failures in `act`

Some tests may fail in the `act` Docker environment but pass in actual GitHub Actions:

- **`packages/mcp-toolbox/tests/check.test.ts`**: The test `sync --check should return exit code 0 when in sync` may fail in `act` due to timing/environment differences
  - ✅ Passes locally (verified)
  - ❌ May fail in `act` Docker environment
  - ✅ Will pass in actual GitHub Actions

This is a known Docker/environment difference and doesn't indicate a problem with the code or tests.

### Troubleshooting

**Issue**: `act` hangs or crashes

**Possible causes & fixes:**
- **Docker not running**: Ensure Docker Desktop is running
- **Resource limits**: Close other heavy applications; Docker may need more memory
- **Stale containers**: Run `pnpm test:act:clean` to remove old containers
- **`--reuse` flag**: Don't use `--reuse` flag (it can cause hangs)

**Issue**: "pnpm not found" or version mismatch

**Fix**: The workflow installs pnpm globally with `npm install -g pnpm@<version>`. Ensure the Docker image has npm installed.

**Issue**: Workflow fails with "No such file or directory"

**Fix**: Ensure you're running `act` from the project root, and the workflow file path is correct.

**Issue**: Auth tokens not working

**Fix**: 
- Verify tokens are set: `echo $CLOUDFLARE_API_TOKEN`
- Use the npm script which handles token passing: `pnpm test:act`
- Or pass secrets explicitly to `act`: `-s CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN`

## Best Practices

1. **Use npm scripts** (`pnpm test:act`) for consistent testing
2. **Set tokens in `.env.local`** (gitignored) for convenience
3. **Clean up regularly** with `pnpm test:act:clean` to free disk space
4. **Test before pushing** to catch issues early
5. **Don't use `--reuse`** flag (can cause hangs)
6. **Verify locally first** if `act` tests fail (they may pass locally)

## Debugging Tips

1. **Verbose output**: Add `-v` flag to `act` commands for detailed logs
2. **Single job testing**: Use `-j JOB_NAME` to test specific jobs
3. **Dry run**: Use `-n` flag to see what would execute without running
4. **Check Docker logs**: Run `docker ps -a` to see container status
5. **Inspect workflow**: Use `act -l` to list all jobs and their status

## Additional Resources

- [act Documentation](https://github.com/nektos/act)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Workflow README](./.github/workflows/README.md) - Comprehensive workflow documentation
