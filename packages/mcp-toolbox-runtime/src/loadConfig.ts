import fs from "node:fs/promises";
import { cosmiconfig } from "cosmiconfig";
import { TypeScriptLoader } from "cosmiconfig-typescript-loader";
import type { ToolboxConfig } from "./config.js";
import { toolboxConfigSchema } from "./config.js";

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const MODULE_NAME = "mcp-toolbox";

const explorer = cosmiconfig(MODULE_NAME, {
  searchPlaces: [
    "package.json",
    `.${MODULE_NAME}rc`,
    `.${MODULE_NAME}rc.json`,
    `.${MODULE_NAME}rc.yaml`,
    `.${MODULE_NAME}rc.yml`,
    `${MODULE_NAME}.config.js`,
    `${MODULE_NAME}.config.cjs`,
    `${MODULE_NAME}.config.mjs`,
    `${MODULE_NAME}.config.ts`,
    `${MODULE_NAME}.config.json`,
  ],
  loaders: {
    ".ts": TypeScriptLoader(),
  },
});

export async function loadToolboxConfig(
  configPath?: string
): Promise<ToolboxConfig> {
  const result = configPath
    ? await explorer.load(configPath)
    : await explorer.search();

  if (!result || result.isEmpty) {
    throw new Error(
      `mcp-toolbox: no config found. Create mcp-toolbox.config.json or run 'mcp-toolbox init'`
    );
  }

  const parsed = toolboxConfigSchema.safeParse(result.config);
  if (!parsed.success) {
    const issueLines = parsed.error.issues.map((issue) => {
      const pathLabel = issue.path.length > 0 ? issue.path.join(".") : "config";
      return `- ${pathLabel}: ${issue.message}`;
    });
    throw new Error(
      `mcp-toolbox: invalid config at ${result.filepath}:\n${issueLines.join("\n")}`
    );
  }

  return parsed.data;
}

/**
 * Load config and return both the config and the filepath it was loaded from.
 * Useful for commands that need to write back to the config file.
 */
export async function loadToolboxConfigWithPath(
  configPath?: string
): Promise<{ config: ToolboxConfig; filepath: string }> {
  const result = configPath
    ? await explorer.load(configPath)
    : await explorer.search();

  if (!result || result.isEmpty) {
    throw new Error(
      `mcp-toolbox: no config found. Create mcp-toolbox.config.json or run 'mcp-toolbox init'`
    );
  }

  const parsed = toolboxConfigSchema.safeParse(result.config);
  if (!parsed.success) {
    const issueLines = parsed.error.issues.map((issue) => {
      const pathLabel = issue.path.length > 0 ? issue.path.join(".") : "config";
      return `- ${pathLabel}: ${issue.message}`;
    });
    throw new Error(
      `mcp-toolbox: invalid config at ${result.filepath}:\n${issueLines.join("\n")}`
    );
  }

  return { config: parsed.data, filepath: result.filepath };
}

/**
 * Clear the cosmiconfig cache. Useful for tests.
 */
export function clearConfigCache(): void {
  explorer.clearCaches();
}
