import { Command } from "commander";
import path from "node:path";
import { outro } from "@clack/prompts";
import { loadToolboxConfigWithPath } from "@merl-ai/mcp-toolbox-runtime";
import { writeToolboxConfigJson } from "../lib/writeConfig.js";

export function removeCommand() {
  const cmd = new Command("remove")
    .description("Remove an MCP server from mcp-toolbox.config.json")
    .argument("[name]", "Server name")
    .option("--config <path>", "Path to config file (auto-detected if not specified)")
    .action(async (name: string | undefined, opts) => {
      const configPathOpt: string | undefined = opts.config;
      if (!name) {
        throw new Error("Server name is required");
      }
      const { config, filepath: configPath } = await loadToolboxConfigWithPath(configPathOpt);
      const initialLength = config.servers.length;
      config.servers = config.servers.filter((s) => s.name !== name);
      if (config.servers.length === initialLength) {
        throw new Error(`Server '${name}' not found in config`);
      }
      await writeToolboxConfigJson(configPath, config);
      const resolvedPath = path.resolve(configPath);
      outro(`Removed server '${name}' from ${resolvedPath}`);
    });

  return cmd;
}
