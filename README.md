# MCP Toolbox

A CLI for turning MCP (Model Context Protocol) servers into TypeScript functions.

Instead of loading thousands of tool definitions into an LLM context window, `mcp-toolbox` generates a small SDK tree that IDE agents can discover by reading code on demand.

## Prerequisites

- Node.js >= 20.0.0
- npm or pnpm

## Quick Start

Get up and running in 3 steps:

```bash
# 1. Initialize the project configuration
npx @merl-ai/mcp-toolbox init

# 2. Add an MCP server (interactive prompt)
npx @merl-ai/mcp-toolbox add

# 3. Generate TypeScript wrappers
npx @merl-ai/mcp-toolbox sync
```

That's it! Your generated tools are now available in the `toolbox/` directory.

## Installation

Choose one of the following installation methods:

### Option 1: Using npx (Recommended - No Installation)

No installation needed. Use `npx` to run commands directly:

```bash
npx @merl-ai/mcp-toolbox init
npx @merl-ai/mcp-toolbox add
npx @merl-ai/mcp-toolbox sync
```

### Option 2: Global CLI Installation

Install globally for system-wide access:

```bash
npm install -g @merl-ai/mcp-toolbox
```

Then use the `mcp-toolbox` command directly:

```bash
mcp-toolbox init
mcp-toolbox add
mcp-toolbox sync
```

### Option 3: Project Installation

Install as a project dependency:

```bash
npm install @merl-ai/mcp-toolbox @merl-ai/mcp-toolbox-runtime
```

Then use via npm scripts or npx:

```bash
npx mcp-toolbox sync
```

## Getting Started Guide

The Quick Start above covers the essentials. This section provides detailed explanations for each step and additional options:

### Step 1: Initialize Configuration

Create a new `mcp-toolbox.config.json` file in your project root:

```bash
npx @merl-ai/mcp-toolbox init
```

This creates a basic configuration file. Verify it was created:

```bash
cat mcp-toolbox.config.json
```

### Step 2: Add MCP Servers

#### Interactive Mode (Recommended)

Add a server with an interactive prompt:

```bash
npx @merl-ai/mcp-toolbox add
```

The prompt will ask for:

- Server name (e.g., `supabase`, `cloudflare-observability`)
- Transport type (`stdio` or `http`)
- Connection details (command, args, or URL)

#### Non-Interactive Mode

Add a server directly via command line:

```bash
npx @merl-ai/mcp-toolbox add \
  --yes \
  --name supabase \
  --transport stdio \
  --command npx \
  --args "-y,mcp-remote,https://mcp.supabase.com/mcp?project_ref=YOUR_PROJECT_REF"
```

#### Manual Configuration

Edit `mcp-toolbox.config.json` directly:

```bash
# Open the config file in your editor
code mcp-toolbox.config.json
# or
vim mcp-toolbox.config.json
```

Add a server entry:

```json
{
  "servers": [
    {
      "name": "supabase",
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "mcp-remote", "https://mcp.supabase.com/mcp?project_ref=YOUR_PROJECT_REF"]
      }
    }
  ]
}
```

### Step 3: Generate TypeScript Wrappers

Generate wrappers for all configured servers:

```bash
npx @merl-ai/mcp-toolbox sync
```

Generate wrappers for a specific server:

```bash
npx @merl-ai/mcp-toolbox sync --server supabase
```

Check if sync is needed (without generating):

```bash
npx @merl-ai/mcp-toolbox sync --check
```

### Step 4: Use Generated Tools

#### Programmatic Usage (TypeScript/JavaScript)

Import and use the generated wrappers:

```typescript
// Import all tools from a server
import * as supabase from "./toolbox/servers/supabase/index.js";

// Call a tool
const url = await supabase.getProjectUrl({});
const tables = await supabase.listTables({ schemas: ["public"] });
```

Or import specific tools:

```typescript
import { getProjectUrl, listTables } from "./toolbox/servers/supabase/index.js";

const url = await getProjectUrl({});
const tables = await listTables({ schemas: ["public"] });
```

#### CLI Usage (Direct Execution)

Each tool file can be executed directly with JSON input:

```bash
# Tool with no input (empty object)
echo '{}' | npx tsx ./toolbox/servers/supabase/tools/getProjectUrl.ts

# Tool with input parameters
echo '{"schemas": ["public"]}' | npx tsx ./toolbox/servers/supabase/tools/listTables.ts
```

**Note**: Ensure `tsx` is available. Install globally if needed:

```bash
npm install -g tsx
```

Or use `npx tsx` (no installation required).

### Step 5: Create Custom Scripts (Optional)

The `toolbox/scripts/` folder is for creating custom workflows that combine MCP tools with your own logic. This is especially useful for:

- **Orchestrating multiple tools** — Chain tool calls together
- **Adding business logic** — Conditional execution, error handling, retries
- **Creating reusable workflows** — Multi-step operations that accomplish higher-level goals
- **Collaborating with AI** — LLMs and humans can iterate on scripts together

Example script:

```typescript
// toolbox/scripts/my-workflow.ts
import { listTables, executeSql } from "../servers/supabase/index.js";

async function main() {
  const tables = await listTables({ schemas: ["public"] });

  for (const table of tables.tables) {
    const result = await executeSql({
      sql: `SELECT COUNT(*) FROM ${table.name}`,
    });
    console.log(`${table.name}: ${result.rows[0].count} rows`);
  }
}

main().catch(console.error);
```

Run scripts with:

```bash
npx tsx toolbox/scripts/my-workflow.ts
```

Scripts are testable, versionable, and can be committed to source control. See `toolbox/scripts/README.md` for more examples.

## Project Structure

```
your-project/
├── mcp-toolbox.config.json    # Configuration file
├── toolbox/                    # Generated output (commit this!)
│   ├── README.md              # LLM-friendly usage guide
│   ├── catalog.json           # Tool index for discovery
│   ├── servers/               # Generated server wrappers
│   │   └── <server-name>/
│   │       ├── index.ts       # Barrel exports
│   │       └── tools/         # Individual tool wrappers
│   │           └── *.ts
│   ├── scripts/               # Custom scripts folder
│   │   ├── README.md          # Scripts documentation
│   │   └── example.ts         # Starter template
│   ├── .snapshots/            # Schema snapshots
│   │   └── <server-name>/
│   │       ├── latest.json    # Latest tool schemas
│   │       └── latest.meta.json
│   └── .reports/              # Change reports
│       └── <server-name>/
│           └── *.md
└── .github/workflows/         # Optional automation
    ├── mcp-toolbox-sync.yml   # Auto-sync workflow
    ├── ci.yml                 # CI workflow
    └── release.yml            # Release workflow
```

### Key Directories

- **`toolbox/`** — Generated TypeScript wrappers (commit to version control)
- **`toolbox/servers/<serverSlug>/`** — Server-specific wrappers
- **`toolbox/scripts/`** — Custom scripts that combine tools with your logic
- **`toolbox/catalog.json`** — Searchable index of all tools
- **`toolbox/.snapshots/`** — Schema snapshots for deterministic builds
- **`toolbox/.reports/`** — Human-readable diff reports when schemas change

## Configuration

### Configuration File

MCP Toolbox uses [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig) and supports multiple file formats:

- `mcp-toolbox.config.json` (recommended)
- `mcp-toolbox.config.js` / `.cjs` / `.mjs`
- `mcp-toolbox.config.ts`
- `.mcp-toolboxrc` / `.mcp-toolboxrc.json` / `.mcp-toolboxrc.yaml`
- `package.json` (`"mcp-toolbox"` field)

The config file is automatically discovered by searching up the directory tree.

### Configuration Schema

View your current configuration:

```bash
cat mcp-toolbox.config.json
```

Example configuration:

```json
{
  "servers": [
    {
      "name": "supabase",
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "mcp-remote", "https://mcp.supabase.com/mcp?project_ref=YOUR_REF"],
        "env": {
          "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
        }
      }
    },
    {
      "name": "cloudflare-observability",
      "transport": {
        "type": "http",
        "url": "https://observability.mcp.cloudflare.com/mcp"
      }
    }
  ],
  "generation": {
    "outDir": "toolbox",
    "language": "ts"
  },
  "security": {
    "allowStdioExec": true,
    "envAllowlist": ["PATH", "HOME"]
  }
}
```

### Configuration Fields

#### `servers[]`

Array of MCP server configurations:

- **`name`** (string, required): Unique identifier for the server
- **`transport`** (object, required): Connection configuration
  - **`type: "stdio"`**: Run a command/process
    - `command` (string): Command to execute (e.g., `"npx"`)
    - `args` (string[]): Command arguments
    - `env` (object): Environment variables (optional)
    - `auth` (object, optional): Authentication configuration
      - `type: "bearer"`: Bearer token authentication
        - `tokenEnv` (string): Name of environment variable containing the token
      - `type: "none"`: No authentication (default if omitted)
  - **`type: "http"`**: Connect via HTTP
    - `url` (string): Server URL
    - `auth` (object, optional): Authentication configuration
      - `type: "bearer"`: Bearer token authentication
        - `tokenEnv` (string): Name of environment variable containing the token
      - `type: "none"`: No authentication (default if omitted)

#### `generation`

Code generation settings (required):

- **`outDir`** (string, required): Output directory for generated files (e.g., `"./toolbox"`)
- **`language`** (string, required): Target language (currently only `"ts"`)

#### `security`

Security settings (required):

- **`allowStdioExec`** (boolean, required): Allow executing stdio commands. Set to `true` to enable stdio transports.
- **`envAllowlist`** (string[], required): Environment variables to pass through to stdio transports. Only allowlisted variables are copied (explicit `transport.env` entries are always included).

#### `cli`

CLI behavior settings (optional):

- **`interactive`** (boolean, optional): Enable interactive prompts. Defaults to `true` if omitted.

#### `client`

MCP client metadata (optional):

- **`name`** (string, optional): Client name sent to MCP servers during handshake. Defaults to `"mcp-toolbox-runtime"` if omitted.
- **`version`** (string, optional): Client version sent to MCP servers during handshake. Defaults to `"0.1.0"` if omitted.

### Authentication

MCP Toolbox supports bearer token authentication for both HTTP and stdio transports. Tokens are resolved from environment variables at runtime.

#### Environment Variable Loading

Before config validation, MCP Toolbox automatically loads environment variables from:

1. `.env` (lower priority)
2. `.env.local` (higher priority, overrides `.env`)

This ensures that `tokenEnv` values resolve properly during config validation.

#### Example Configuration with Auth

```json
{
  "servers": [
    {
      "name": "supabase",
      "transport": {
        "type": "http",
        "url": "https://mcp.supabase.com/mcp",
        "auth": {
          "type": "bearer",
          "tokenEnv": "SUPABASE_MCP_TOKEN"
        }
      }
    },
    {
      "name": "custom-server",
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["mcp-server"],
        "auth": {
          "type": "bearer",
          "tokenEnv": "CUSTOM_SERVER_TOKEN"
        }
      }
    }
  ]
}
```

Create a `.env.local` file (or `.env`) with your tokens:

```bash
SUPABASE_MCP_TOKEN=your_token_here
CUSTOM_SERVER_TOKEN=your_other_token_here
```

**Note**: Add `.env.local` to `.gitignore` to keep tokens out of version control.

#### CI Behavior

When running in CI environments (detected via `CI`, `GITHUB_ACTIONS`, or `ACT` environment variables), or when using the `--skip-missing-auth` flag:

- **Missing tokens**: Servers with missing auth tokens are skipped with a warning, rather than causing the sync to fail
- **Invalid tokens**: If a token is present but authentication fails (401/403), that server is marked as failed but the sync continues with other servers
- **Exit code**: The process exits with code 0 if at least one server succeeds, even if some servers fail due to auth issues

This allows CI pipelines to run successfully even when some servers don't have auth tokens configured.

#### Per-Server Auth Failure Handling

If authentication fails for a specific server (e.g., invalid token, expired credentials), only that server is marked as failed. The sync process continues with remaining servers and completes successfully if at least one server succeeds. This prevents a single auth failure from stopping the entire sync operation.

## Common Commands

### List Available Commands

```bash
npx @merl-ai/mcp-toolbox --help
```

### View Server Status

Check which servers are configured:

```bash
cat mcp-toolbox.config.json | grep -A 5 '"name"'
```

### Regenerate All Wrappers

```bash
npx @merl-ai/mcp-toolbox sync
```

### Regenerate Single Server

```bash
npx @merl-ai/mcp-toolbox sync --server supabase
```

### Check if Sync is Needed

```bash
npx @merl-ai/mcp-toolbox sync --check
```

### Introspect a Server

Connect to a server and snapshot its tools/resources without regenerating code:

```bash
# Introspect all servers
npx @merl-ai/mcp-toolbox introspect

# Introspect a specific server
npx @merl-ai/mcp-toolbox introspect --server supabase
```

This creates snapshots in `toolbox/.snapshots/` but does not generate TypeScript wrappers. Useful for debugging server connections or inspecting schema changes.

### Remove a Server

Edit `mcp-toolbox.config.json` and remove the server entry, then sync:

```bash
# Edit the file
vim mcp-toolbox.config.json

# Regenerate (removes orphaned files)
npx @merl-ai/mcp-toolbox sync
```

## CI/CD & Automation

This repository uses GitHub Actions for continuous integration and automated maintenance. Three workflows are configured:

- **CI** (`ci.yml`) - Runs on every PR and push to `main` (builds, tests, lints)
- **MCP Toolbox Sync** (`mcp-toolbox-sync.yml`) - Automatically regenerates MCP wrappers when upstream schemas change
- **Release** (`release.yml`) - Publishes packages to npm using Changesets

All workflows support local testing with [`act`](https://github.com/nektos/act):

```bash
pnpm act:ci      # Test CI workflow
pnpm act:sync    # Test sync workflow
pnpm act:release # Test release workflow
pnpm act:clean   # Clean up Docker containers
```

For detailed workflow documentation, including authentication setup, secrets configuration, and advanced testing, see [`.github/workflows/README.md`](.github/workflows/README.md).

## Troubleshooting

### Sync Fails with "allowStdioExec is false"

If you see an error about `allowStdioExec`, enable it in your config:

```bash
# Edit the config
vim mcp-toolbox.config.json

# Add or update the security section:
# "security": {
#   "allowStdioExec": true
# }
```

### Tool Execution Fails

Ensure `tsx` is available for CLI execution:

```bash
# Check if tsx is installed
which tsx

# Install if missing
npm install -g tsx

# Or use npx
npx tsx ./toolbox/servers/supabase/tools/getProjectUrl.ts
```

### Generated Files Are Out of Date

Regenerate all wrappers:

```bash
npx @merl-ai/mcp-toolbox sync
```

Check what changed:

```bash
git diff toolbox/
```

### Server Connection Fails

Verify your server configuration:

```bash
# Check the config
cat mcp-toolbox.config.json

# Test the connection manually (for stdio)
npx mcp-remote https://mcp.supabase.com/mcp?project_ref=YOUR_REF
```

## Development

For contributors working on MCP Toolbox itself:

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint code
pnpm lint

# Format code
pnpm format

# Run the CLI locally
pnpm mcp-toolbox sync
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT
