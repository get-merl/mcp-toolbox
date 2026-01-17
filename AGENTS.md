## MCP Toolbox

This repository uses `mcp-toolbox` to generate type-safe wrappers for MCP server tools.

### Discovering Tools

- Browse available servers: `toolbox/servers/`
- Search by name/description: `toolbox/catalog.json`
- Read tool implementations: `toolbox/servers/{server}/tools/{tool}.ts`

### Using Tools

The generated tool wrappers can be used in two ways:

#### Direct Execution (Recommended for CLI usage)

Each tool file is executable and reads JSON input from stdin. This is the simplest way to call tools from the command line:

```bash
# Tool with no input (empty object)
echo '{}' | ./toolbox/servers/supabase/tools/getProjectUrl.ts

# Tool with input parameters
echo '{"schemas": ["public"]}' | ./toolbox/servers/supabase/tools/listTables.ts
```

The tool will:
- Read JSON input from stdin (or use `{}` if stdin is empty)
- Execute the MCP tool call
- Output the result as JSON to stdout
- Automatically handle cleanup and exit

**Note**: Ensure `tsx` is available in your PATH. Install with `npm install -g tsx` or use `npx tsx` if needed.

#### Programmatic Usage

For use in TypeScript/JavaScript code, import and call the functions directly:

```typescript
import { getProjectUrl, listTables } from 'toolbox/servers/supabase/index.js';

// Call a tool
const url = await getProjectUrl({});

// Call with parameters
const tables = await listTables({ schemas: ["public"] });
```

Always import specific tool functions rather than using `callMcpTool` directly. See `toolbox/README.md` for more details.

### Custom Scripts

The `toolbox/scripts/` folder is for creating custom workflows that combine MCP tools with your own logic.

**When to create a script:**
- Orchestrating multiple tool calls together
- Adding business logic, error handling, or retries
- Creating reusable workflows for common operations
- Automating multi-step tasks

**Example script:**

```typescript
// toolbox/scripts/my-workflow.ts
import { listTables, executeSql } from "../servers/supabase/index.js";

async function main() {
  const tables = await listTables({ schemas: ["public"] });
  for (const table of tables.tables) {
    const count = await executeSql({ sql: \`SELECT COUNT(*) FROM \${table.name}\` });
    console.log(\`\${table.name}: \${count.rows[0].count} rows\`);
  }
}

main().catch(console.error);
```

Run with: `npx tsx toolbox/scripts/my-workflow.ts`

Scripts are testable, versionable, and can be collaboratively improved. See `toolbox/scripts/README.md` for more details.