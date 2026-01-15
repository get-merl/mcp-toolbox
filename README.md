# MCP Toolbox

A CLI for turning MCP (Model Context Protocol) servers into TypeScript functions.

Instead of loading thousands of tool definitions into an LLM context window, `mcp-toolbox` generates a small SDK tree that IDE agents can discover by reading code on demand.

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

Follow these steps to set up MCP Toolbox in your project:

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
│   ├── .snapshots/            # Schema snapshots
│   │   └── <server-name>/
│   │       ├── latest.json    # Latest tool schemas
│   │       └── latest.meta.json
│   └── .reports/              # Change reports
│       └── <server-name>/
│           └── *.md
└── .github/workflows/         # Optional automation
    ├── mcp-toolbox-sync.yml   # Auto-sync workflow
    └── mcp-toolbox-check.yml  # CI check workflow
```

### Key Directories

- **`toolbox/`** — Generated TypeScript wrappers (commit to version control)
- **`toolbox/servers/<serverSlug>/`** — Server-specific wrappers
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
  - **`type: "http"`**: Connect via HTTP
    - `url` (string): Server URL

#### `generation`

Code generation settings:

- **`outDir`** (string, default: `"./toolbox"`): Output directory for generated files
- **`language`** (string, default: `"ts"`): Target language (currently only `"ts"`)

#### `security`

Security settings:

- **`allowStdioExec`** (boolean, default: `false`): Allow executing stdio commands. Set to `true` to enable stdio transports.
- **`envAllowlist`** (string[]): Environment variables to pass through to stdio transports. Only allowlisted variables are copied (explicit `transport.env` entries are always included).

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

### Remove a Server

Edit `mcp-toolbox.config.json` and remove the server entry, then sync:

```bash
# Edit the file
vim mcp-toolbox.config.json

# Regenerate (removes orphaned files)
npx @merl-ai/mcp-toolbox sync
```

## Automation

### GitHub Actions

This repository includes example GitHub Actions workflows:

#### Auto-Sync Workflow

`.github/workflows/mcp-toolbox-sync.yml` — Scheduled sync that:

- Runs on a schedule (e.g., daily)
- Regenerates snapshots and wrappers
- Opens a PR if changes are detected

Enable it by:

```bash
# Copy the workflow file (if not already present)
cp .github/workflows/mcp-toolbox-sync.yml.example .github/workflows/mcp-toolbox-sync.yml

# Commit and push
git add .github/workflows/mcp-toolbox-sync.yml
git commit -m "Add MCP Toolbox auto-sync workflow"
git push
```

#### CI Check Workflow

`.github/workflows/mcp-toolbox-check.yml` — CI gate that:

- Runs on every PR
- Fails if upstream schemas changed but wrappers weren't regenerated
- Uses `sync --check` to detect drift

Enable it by:

```bash
# Copy the workflow file (if not already present)
cp .github/workflows/mcp-toolbox-check.yml.example .github/workflows/mcp-toolbox-check.yml

# Commit and push
git add .github/workflows/mcp-toolbox-check.yml
git commit -m "Add MCP Toolbox CI check"
git push
```

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
