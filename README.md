# MCP Toolbox

A monorepo + CLI for turning MCP (Model Context Protocol) servers into **repo-committed TypeScript modules**.

Instead of loading thousands of tool definitions into an LLM context window, `mcp-toolbox` generates a small SDK tree that IDE agents can discover by reading code on demand.

## Structure

- `packages/mcp-toolbox/` — the `mcp-toolbox` CLI implementation (registry client, introspection, snapshotting, diffing, codegen).
- `mcp-toolbox.config.json` — project config: which MCP servers are enabled, output location, and security toggles.
- `toolbox/` — **generated output** (checked into the repo) that LLMs and humans import from.
- `.github/workflows/` — optional automation to keep `toolbox/` in sync via PRs.

## How users will use this (the product flow)

1) Install + initialize (once per repo).

2) Add one or more MCP servers by configuring their transport (stdio command/args or HTTP URL).

3) Run sync to:
- connect to each server
- fetch `tools/list`
- snapshot schemas for deterministic builds
- generate TypeScript wrappers into `toolbox/`

4) Use the generated wrappers in normal code (or let your IDE LLM discover them and write the code).

## Generated output explained (`toolbox/`)

The `toolbox/` directory is treated as **fully generated** output. We do not patch individual wrapper files; we regenerate them from the latest snapshot.

- `toolbox/README.md`
  - A short “LLM-friendly” guide explaining how to discover and import wrappers.

- `toolbox/catalog.json`
  - A compact index of installed servers and their tools (names + descriptions).
  - Intended for fast search/discovery without reading every wrapper file.

- `toolbox/servers/<serverSlug>/index.ts`
  - Barrel file exporting all tool wrappers for a server.

- `toolbox/servers/<serverSlug>/tools/*.ts`
  - One file per tool wrapper.
  - Each exported function includes **JSDoc** so hover tooltips show tool meaning + MCP IDs.

- `toolbox/.snapshots/<serverSlug>/latest.json`
  - Latest introspection snapshot (what the server returned from `tools/list`).
  - Used as the source of truth for code generation.

- `toolbox/.snapshots/<serverSlug>/latest.meta.json`
  - Snapshot metadata including the **schema fingerprint** used by `sync --check`.

- `toolbox/.reports/<serverSlug>/*.md`
  - Human-readable diff reports when tool schemas change (breaking vs additive).

## Config explained (`mcp-toolbox.config.json`)

Key fields:
- `servers[]`: list of MCP server configurations, each with:
  - `name`: unique identifier for the server
  - `transport`: either `{ type: "stdio", command: string, args?: string[], env?: Record<string, string> }` or `{ type: "http", url: string }`
- `generation.outDir`: where generated output is written (defaults to `./toolbox`).
- `security.allowStdioExec`:
  - `false` by default (safer).
  - If `true`, `sync` may run stdio servers via the configured command.
- `security.envAllowlist`:
  - List of environment variable names copied from the host into stdio transports.
  - Only allowlisted variables are passed through (explicit `transport.env` entries are always included).

## Getting Started

### Install dependencies

```bash
pnpm install
```

### Build the CLI

```bash
pnpm build
```

### Initialize config

```bash
npx mcp-toolbox init
```

### Add an MCP server

Interactive (prompts for name, transport type, and connection details):

```bash
npx mcp-toolbox add
```

Or manually edit `mcp-toolbox.config.json`:

```json
{
  "name": "my-server",
  "transport": {
    "type": "stdio",
    "command": "npx",
    "args": ["mcp-remote", "https://example.com/mcp"]
  }
}
```

### Generate / refresh wrappers

```bash
npx mcp-toolbox sync
```

### Use generated wrappers (example)

```ts
import * as fsTools from "./toolbox/servers/io-github-digital-defiance-mcp-filesystem";

await fsTools.fsAnalyzeDiskUsage({ path: ".", depth: "2" });
```

## Automation (optional)

This repo includes example GitHub Actions workflows:
- `.github/workflows/mcp-toolbox-sync.yml`: scheduled run that regenerates snapshots/wrappers and opens a PR.
- `.github/workflows/mcp-toolbox-check.yml`: CI gate that fails if upstream changed but the repo wasn’t regenerated (`sync --check`).

## Development

- `pnpm build` — build all packages
- `pnpm typecheck` — typecheck all packages
- `pnpm lint` — lint with `oxlint`
- `pnpm format` — format with `oxfmt`
