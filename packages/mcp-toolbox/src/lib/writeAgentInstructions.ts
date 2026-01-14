import fs from "node:fs/promises";
import path from "node:path";
import { fileExists } from "mcp-toolbox-runtime";

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

This repository uses \`mcp-toolbox\` to generate type-safe wrappers for MCP server tools.

### Discovering Tools

- Browse available servers: \`${toolboxDir}/servers/\`
- Search by name/description: \`${toolboxDir}/catalog.json\`
- Read tool implementations: \`${toolboxDir}/servers/{server}/tools/{tool}.ts\`

### Using Tools

The generated tool wrappers can be used in two ways:

#### Direct Execution (Recommended for CLI usage)

Each tool file is executable and reads JSON input from stdin. This is the simplest way to call tools from the command line:

\`\`\`bash
# Tool with no input (empty object)
echo '{}' | ./${toolboxDir}/servers/supabase/tools/getProjectUrl.ts

# Tool with input parameters
echo '{"schemas": ["public"]}' | ./${toolboxDir}/servers/supabase/tools/listTables.ts
\`\`\`

The tool will:
- Read JSON input from stdin (or use \`{}\` if stdin is empty)
- Execute the MCP tool call
- Output the result as JSON to stdout
- Automatically handle cleanup and exit

**Note**: Ensure \`tsx\` is available in your PATH. Install with \`npm install -g tsx\` or use \`npx tsx\` if needed.

#### Programmatic Usage

For use in TypeScript/JavaScript code, import and call the functions directly:

\`\`\`typescript
import { getProjectUrl, listTables } from '${toolboxDir}/servers/supabase/index.js';

// Call a tool
const url = await getProjectUrl({});

// Call with parameters
const tables = await listTables({ schemas: ["public"] });
\`\`\`

Always import specific tool functions rather than using \`callMcpTool\` directly. See \`${toolboxDir}/README.md\` for more details.`;
}
