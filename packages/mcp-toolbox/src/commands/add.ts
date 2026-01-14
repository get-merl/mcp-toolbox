import { Command } from "commander";
import { isCancel, select, spinner, text } from "@clack/prompts";
import { defaultConfigPath, loadToolboxConfig, fileExists, RegistryClient } from "mcp-toolbox-runtime";
import { writeToolboxConfigTs } from "../lib/writeConfig";

export function addCommand() {
  const cmd = new Command("add")
    .description("Add a registry server to mcp-toolbox.config.ts")
    .argument("[registryId]", "Registry server ID")
    .option("--config <path>", "Path to config file", defaultConfigPath())
    .option("--yes", "Run non-interactively", false)
    .action(async (registryId: string | undefined, opts) => {
      const configPath: string = opts.config;
      const nonInteractive: boolean = Boolean(opts.yes);

      if (!(await fileExists(configPath))) {
        throw new Error(
          `Config file not found at ${configPath}. Run 'mcp-toolbox init' first.`
        );
      }

      const config = await loadToolboxConfig(configPath);
      const client = new RegistryClient();

      let chosenId = registryId;
      if (!chosenId && !nonInteractive) {
        const query = await text({ message: "Search for a server (name substring):" });
        if (isCancel(query)) return;

        const s = spinner();
        s.start("Searching registry…");
        const res = await client.listServers({ search: String(query), version: "latest", limit: 30 });
        s.stop(`Found ${res.servers?.length ?? 0}`);

        const options =
          (res.servers ?? []).map((x) => ({
            value: x.server.name,
            label: `${x.server.name}@${x.server.version}`,
            hint: x.server.title ?? x.server.description,
          })) ?? [];

        if (options.length === 0) {
          throw new Error("No matching servers found.");
        }

        const picked = await select({
          message: "Select a server to add:",
          options,
        });
        if (isCancel(picked)) return;
        chosenId = String(picked);
      }

      if (!chosenId) {
        throw new Error("registryId is required (or run without --yes for interactive selection).");
      }

      // Validate it exists (best effort)
      await client.getServerVersion({ serverName: chosenId, version: "latest" });

      if (config.servers.some((s) => s.registryId === chosenId)) return;
      config.servers.push({ registryId: chosenId, channel: "latest" });
      await writeToolboxConfigTs(configPath, config);
    });

  return cmd;
}

