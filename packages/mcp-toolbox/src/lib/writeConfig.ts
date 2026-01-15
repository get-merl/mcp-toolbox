import fs from "node:fs/promises";
import path from "node:path";
import type { ToolboxConfig } from "@merl-ai/mcp-toolbox-runtime";

export async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeToolboxConfigJson(
  configPath: string,
  config: ToolboxConfig
) {
  await ensureDir(path.dirname(configPath));
  const contents = JSON.stringify(config, null, 2) + "\n";
  await fs.writeFile(configPath, contents, "utf-8");
}

