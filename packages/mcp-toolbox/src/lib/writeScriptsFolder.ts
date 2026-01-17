import fs from "node:fs/promises";
import path from "node:path";
import { fileExists } from "@merl-ai/mcp-toolbox-runtime";

/**
 * Creates the scripts folder with a README explaining its purpose.
 * This folder is for agents and users to create custom scripts that
 * combine MCP tool wrappers with other code.
 */
export async function writeScriptsFolder(outDir: string): Promise<void> {
  const scriptsDir = path.join(outDir, "scripts");
  const readmePath = path.join(scriptsDir, "README.md");
  const examplePath = path.join(scriptsDir, "example.ts");
  
  // Get the folder name from the outDir path for use in documentation
  const folderName = path.basename(outDir);

  // Create the scripts directory
  await fs.mkdir(scriptsDir, { recursive: true });

  // Write README.md
  const readmeContent = `# Custom Scripts

This folder is for custom scripts that combine MCP tool wrappers with your own logic.

## Purpose

While the generated tool wrappers in \`servers/\` provide direct access to individual MCP tools, real-world automation often requires:

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

\`\`\`typescript
#!/usr/bin/env npx tsx
// scripts/my-workflow.ts

import { listTables, executeSql } from "../servers/supabase/index.js";

async function main() {
  // Get all tables
  const tables = await listTables({ schemas: ["public"] });
  
  // Process each table...
  for (const table of tables.tables) {
    const result = await executeSql({
      sql: \`SELECT COUNT(*) FROM \${table.name}\`
    });
    console.log(\`\${table.name}: \${result.rows[0].count} rows\`);
  }
}

main().catch(console.error);
\`\`\`

### Running Scripts

Scripts can be executed directly:

\`\`\`bash
# Run directly with tsx
npx tsx ${folderName}/scripts/my-workflow.ts

# Or make executable and run
chmod +x ${folderName}/scripts/my-workflow.ts
./${folderName}/scripts/my-workflow.ts
\`\`\`

### Passing Arguments

For scripts that need input:

\`\`\`typescript
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
    sql: \`SELECT * FROM \${tableName} LIMIT 10\`
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
\`\`\`

Run with: \`npx tsx ${folderName}/scripts/query-table.ts users\`

## Examples

See \`example.ts\` for a starter template.

## Tips

1. **Start simple**: Begin with single-purpose scripts, then compose them
2. **Handle errors**: MCP tools can fail — add appropriate error handling
3. **Log progress**: For multi-step workflows, log what's happening
4. **Use TypeScript**: Get full type safety with the generated wrappers
`;

  await fs.writeFile(readmePath, readmeContent, "utf-8");

  // Write example script only if it doesn't exist (preserve user modifications)
  if (!(await fileExists(examplePath))) {
    const exampleContent = `#!/usr/bin/env npx tsx
/**
 * Example custom script
 * 
 * This is a template for creating custom workflows that combine
 * MCP tools with your own logic. Modify this file or create new
 * scripts in this folder.
 * 
 * Usage: npx tsx ${folderName}/scripts/example.ts
 */

// Import tools from your MCP servers
// import { listTables, executeSql } from "../servers/supabase/index.js";

async function main() {
  console.log("🚀 Custom script starting...");
  
  // Example: List and process tables
  // const tables = await listTables({ schemas: ["public"] });
  // console.log(\`Found \${tables.tables.length} tables\`);
  
  // Example: Execute custom SQL
  // const result = await executeSql({ sql: "SELECT NOW()" });
  // console.log("Current time:", result.rows[0].now);
  
  console.log("✅ Script complete!");
}

main().catch((error) => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});
`;

    await fs.writeFile(examplePath, exampleContent, "utf-8");
  }
}
