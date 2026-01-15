# Contributing to MCP Toolbox

Thank you for your interest in contributing to MCP Toolbox!

## Development Setup

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 10.0.0

### Getting Started

1. Clone the repository:

```bash
git clone https://github.com/merl-ai/mcp-toolbox.git
cd mcp-toolbox
```

2. Install dependencies:

```bash
pnpm install
```

3. Build all packages:

```bash
pnpm build
```

4. Run tests:

```bash
pnpm test
```

## Project Structure

```
packages/
├── mcp-toolbox/          # CLI implementation
│   ├── src/
│   │   ├── commands/     # CLI commands (init, add, remove, sync)
│   │   ├── codegen/      # Code generation for TypeScript wrappers
│   │   ├── diff/         # Schema diffing and reporting
│   │   ├── introspect/   # MCP server introspection
│   │   └── snapshot/     # Snapshot management
│   └── tests/            # Test files
└── mcp-toolbox-runtime/  # Runtime library for generated code
    └── src/
        ├── config.ts     # Configuration schema
        ├── loadConfig.ts # Config loading with cosmiconfig
        └── index.ts      # Main runtime exports
```

## Development Workflow

### Running the CLI locally

```bash
# Build first
pnpm build

# Run CLI commands
pnpm mcp-toolbox init
pnpm mcp-toolbox sync
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm --filter mcp-toolbox test:watch
```

### Code Style

We use [oxlint](https://oxc-project.github.io/oxlint/) for linting and [oxfmt](https://github.com/nicolo-ribaudo/oxfmt) for formatting.

```bash
# Lint
pnpm lint

# Format
pnpm format
```

## Making Changes

### Creating a Changeset

We use [changesets](https://github.com/changesets/changesets) for versioning and changelog generation.

After making changes, create a changeset:

```bash
pnpm changeset
```

This will prompt you to:
1. Select which packages changed
2. Choose the semver bump type (major/minor/patch)
3. Write a summary of the changes

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Create a changeset describing your changes
4. Ensure tests pass: `pnpm test`
5. Ensure the build passes: `pnpm build`
6. Submit a pull request

### Commit Messages

Use clear, descriptive commit messages. Examples:

- `feat: add single-server sync option`
- `fix: handle connection timeout in introspection`
- `docs: update README with installation instructions`
- `chore: update dependencies`

## Architecture Notes

### Config Loading

Configuration is loaded using [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig), which searches for config files in standard locations. The config schema is defined with [Zod](https://zod.dev/) for runtime validation.

### Connection Pooling

The runtime uses [generic-pool](https://github.com/coopernurse/node-pool) for connection management, with automatic cleanup of idle connections.

### Code Generation

Generated TypeScript wrappers use `json-schema-to-typescript` for robust type generation from MCP tool schemas.

## Questions?

Feel free to open an issue for questions or discussion.
