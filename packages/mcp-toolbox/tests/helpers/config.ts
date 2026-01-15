import fs from "node:fs/promises";
import type { ToolboxConfig } from "@merl-ai/mcp-toolbox-runtime";
import { writeFileAtomic } from "./fs";

export async function createTestConfig(
  configPath: string,
  config: Partial<ToolboxConfig> = {}
): Promise<void> {
  const defaultConfig: ToolboxConfig = {
    servers: [],
    generation: {
      outDir: "toolbox",
      language: "ts",
    },
    security: {
      allowStdioExec: false,
      envAllowlist: ["PATH"],
    },
    cli: {
      interactive: false,
    },
    ...config,
  };

  const content = JSON.stringify(defaultConfig, null, 2) + "\n";
  await writeFileAtomic(configPath, content);
}

export async function readConfig(configPath: string): Promise<ToolboxConfig> {
  const content = await fs.readFile(configPath, "utf-8");
  return JSON.parse(content) as ToolboxConfig;
}

export async function addServerToConfig(
  configPath: string,
  name: string,
  transport:
    | { type: "stdio"; command: string; args?: string[] }
    | { type: "http"; url: string }
): Promise<void> {
  const config = await readConfig(configPath);
  if (!config.servers.some((s) => s.name === name)) {
    config.servers.push({ name, transport });
    await createTestConfig(configPath, config);
  }
}

export async function removeServerFromConfig(
  configPath: string,
  name: string
): Promise<void> {
  const config = await readConfig(configPath);
  config.servers = config.servers.filter((s) => s.name !== name);
  await createTestConfig(configPath, config);
}
