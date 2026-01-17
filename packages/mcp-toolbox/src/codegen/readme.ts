import fs from "node:fs/promises";
import path from "node:path";

export async function writeToolboxReadme(outDir: string) {
  // Get the folder name from the outDir path for use in documentation
  const folderName = path.basename(outDir);
  
  const contents = `# MCP Toolbox

This repo includes a generated integration SDK under \`./${folderName}\`.

## How to discover tools

- Browse available servers: \`${folderName}/servers/\`
- Search by name/description: \`${folderName}/catalog.json\`

## How to use in code

Each server is a module:

\`\`\`ts
import * as github from "./${folderName}/servers/io-github-yourorg-yourserver";
\`\`\`

Each tool is a function exported from that module. Prefer importing and calling these wrappers rather than describing raw MCP tool calls in text.

## Custom scripts

The \`scripts/\` folder is for creating custom workflows that combine MCP tools with your own logic.

### When to create a script

- Orchestrating multiple tool calls together
- Adding business logic, error handling, or retries
- Creating reusable workflows for common operations
- Automating multi-step tasks

### Example

\`\`\`ts
// scripts/my-workflow.ts
import { listTables, executeSql } from "../servers/supabase/index.js";

async function main() {
  const tables = await listTables({ schemas: ["public"] });
  for (const table of tables.tables) {
    const count = await executeSql({ sql: \`SELECT COUNT(*) FROM \${table.name}\` });
    console.log(\`\${table.name}: \${count.rows[0].count} rows\`);
  }
}

main().catch(console.error);
\`\`\`

Run scripts with: \`npx tsx ${folderName}/scripts/my-workflow.ts\`

See \`scripts/README.md\` for more details and examples.

## Regenerating

\`\`\`bash
npx mcp-toolbox sync
\`\`\`
`;
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "README.md"), contents, "utf-8");
}
