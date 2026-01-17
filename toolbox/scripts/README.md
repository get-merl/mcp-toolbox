# Custom Scripts

This folder is for custom scripts that combine MCP tool wrappers with your own logic.

## Purpose

While the generated tool wrappers in `servers/` provide direct access to individual MCP tools, real-world automation often requires:

- **Orchestrating multiple tools** — Chaining tool calls together
- **Adding business logic** — Conditional execution, error handling, retries
- **Transforming data** — Processing outputs before passing to other tools
- **Creating workflows** — Multi-step operations that accomplish higher-level goals

## Benefits

- **Testable**: Scripts can be tested like any other code
- **Versionable**: Commit scripts to version control
- **Collaborative**: LLMs and humans can iterate on scripts together
- **Reusable**: Build a library of common operations

## Usage

### Creating a Script

```typescript
#!/usr/bin/env npx tsx
// scripts/my-workflow.ts

import { listTables, executeSql } from "../servers/supabase/index.js";

async function main() {
  // Get all tables
  const tables = await listTables({ schemas: ["public"] });
  
  // Process each table...
  for (const table of tables.tables) {
    const result = await executeSql({
      sql: `SELECT COUNT(*) FROM ${table.name}`
    });
    console.log(`${table.name}: ${result.rows[0].count} rows`);
  }
}

main().catch(console.error);
```

### Running Scripts

Scripts can be executed directly:

```bash
# Run directly with tsx
npx tsx toolbox/scripts/my-workflow.ts

# Or make executable and run
chmod +x toolbox/scripts/my-workflow.ts
./toolbox/scripts/my-workflow.ts
```

### Passing Arguments

For scripts that need input:

```typescript
#!/usr/bin/env npx tsx
// scripts/query-table.ts

import { executeSql } from "../servers/supabase/index.js";

const tableName = process.argv[2];
if (!tableName) {
  console.error("Usage: query-table.ts <table-name>");
  process.exit(1);
}

async function main() {
  const result = await executeSql({
    sql: `SELECT * FROM ${tableName} LIMIT 10`
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
```

Run with: `npx tsx toolbox/scripts/query-table.ts users`

## Examples

See `example.ts` for a starter template.

## Tips

1. **Start simple**: Begin with single-purpose scripts, then compose them
2. **Handle errors**: MCP tools can fail — add appropriate error handling
3. **Log progress**: For multi-step workflows, log what's happening
4. **Use TypeScript**: Get full type safety with the generated wrappers
