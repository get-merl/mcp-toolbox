# MCP Toolbox

This repo includes a generated integration SDK under `./toolbox`.

## How to discover tools

- Browse available servers: `toolbox/servers/`
- Search by name/description: `toolbox/catalog.json`

## How to use in code

Each server is a module:

```ts
import * as github from "./toolbox/servers/io-github-yourorg-yourserver";
```

Each tool is a function exported from that module. Prefer importing and calling these wrappers rather than describing raw MCP tool calls in text.

## Custom scripts

The `scripts/` folder is for creating custom workflows that combine MCP tools with your own logic.

### When to create a script

- Orchestrating multiple tool calls together
- Adding business logic, error handling, or retries
- Creating reusable workflows for common operations
- Automating multi-step tasks

### Example

```ts
// scripts/my-workflow.ts
import { listTables, executeSql } from "../servers/supabase/index.js";

async function main() {
  const tables = await listTables({ schemas: ["public"] });
  for (const table of tables.tables) {
    const count = await executeSql({ sql: `SELECT COUNT(*) FROM ${table.name}` });
    console.log(`${table.name}: ${count.rows[0].count} rows`);
  }
}

main().catch(console.error);
```

Run scripts with: `npx tsx toolbox/scripts/my-workflow.ts`

See `scripts/README.md` for more details and examples.

## Regenerating

```bash
npx mcp-toolbox sync
```
