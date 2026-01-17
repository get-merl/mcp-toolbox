import fs from "node:fs/promises";
import path from "node:path";
import { fileExists } from "@merl-ai/mcp-toolbox-runtime";

export async function writeAgentInstructions(
  projectRoot: string,
  toolboxDir: string
): Promise<void> {
  const agentsMdPath = path.join(projectRoot, "AGENTS.md");
  const relativeToolboxDir = path.relative(projectRoot, toolboxDir);
  const normalizedToolboxDir =
    relativeToolboxDir.startsWith("..") || path.isAbsolute(relativeToolboxDir)
      ? toolboxDir
      : relativeToolboxDir;

  const instructions = generateAgentInstructions(normalizedToolboxDir);

  const exists = await fileExists(agentsMdPath);
  if (exists) {
    // Read existing content and append new section
    const existingContent = await fs.readFile(agentsMdPath, "utf-8");
    const newContent = existingContent + "\n\n" + instructions;
    await fs.writeFile(agentsMdPath, newContent, "utf-8");
  } else {
    // Create new file
    await fs.writeFile(agentsMdPath, instructions, "utf-8");
  }
}

function generateAgentInstructions(toolboxDir: string): string {
  return `## MCP Toolbox

Type-safe wrappers for MCP server tools.

### Discover Tools

- \`${toolboxDir}/catalog.json\` — list of all servers and tools with descriptions
- \`${toolboxDir}/servers/{server}/tools/{tool}.ts\` — tool implementations

### Execute Tools

**Single tool call** → run directly, no script needed:

\`\`\`bash
echo '{}' | npx tsx ./${toolboxDir}/servers/supabase/tools/getProjectUrl.ts
echo '{"schemas": ["public"]}' | npx tsx ./${toolboxDir}/servers/supabase/tools/listTables.ts
\`\`\`

Output: JSON to stdout.

**Multi-tool workflow** → create script in \`${toolboxDir}/scripts/\`:

\`\`\`typescript
// ${toolboxDir}/scripts/my-workflow.ts
import { listTables, executeSql } from "../servers/supabase/index.js";

async function main() {
  const tables = await listTables({ schemas: ["public"] });
  for (const table of tables.tables) {
    const count = await executeSql({ sql: \\\`SELECT COUNT(*) FROM \\\${table.name}\\\` });
    console.log(\\\`\\\${table.name}: \\\${count.rows[0].count} rows\\\`);
  }
}

main().catch(console.error);
\`\`\`

Run: \`npx tsx ${toolboxDir}/scripts/my-workflow.ts\`

### Decision Tree

| Scenario                      | Action                                                                    |
| ----------------------------- | ------------------------------------------------------------------------- |
| Single tool, simple input     | \`echo '{...}' \\| npx tsx ./${toolboxDir}/servers/{server}/tools/{tool}.ts\` |
| Multiple tools, chained logic | Create script in \`${toolboxDir}/scripts/\`                                   |
| Reusable workflow             | Create script in \`${toolboxDir}/scripts/\`                                   |`;
}
