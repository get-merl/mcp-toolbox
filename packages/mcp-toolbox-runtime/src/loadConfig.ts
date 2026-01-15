import fs from "node:fs/promises";
import type { ToolboxConfig } from "./config.js";
import { toolboxConfigSchema } from "./config.js";

export async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadToolboxConfig(
  configPath: string
): Promise<ToolboxConfig> {
  if (!configPath.endsWith(".json")) {
    throw new Error(
      `mcp-toolbox: config must be JSON (.json). Found: ${configPath}. Please migrate to mcp-toolbox.config.json.`
    );
  }

  const rawText = await fs.readFile(configPath, "utf-8");
  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(rawText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `mcp-toolbox: failed to parse JSON config at ${configPath}: ${message}`
    );
  }

  const parsed = toolboxConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    const issueLines = parsed.error.issues.map((issue) => {
      const pathLabel =
        issue.path.length > 0 ? issue.path.join(".") : "config";
      return `- ${pathLabel}: ${issue.message}`;
    });
    throw new Error(
      `mcp-toolbox: invalid config at ${configPath}:\n${issueLines.join("\n")}`
    );
  }

  return parsed.data;
}

