import { Command } from "commander";
import { spinner, outro } from "@clack/prompts";
import { defaultConfigPath, loadToolboxConfig } from "@merl-ai/mcp-toolbox-runtime";
import { slugifyServerName } from "../lib/slug.js";
import { introspectServer } from "../introspect/introspectServer.js";
import { writeLatestSnapshot } from "../snapshot/writeSnapshot.js";
import { resolveOutDir } from "../lib/resolveOutDir.js";

export function introspectCommand() {
  const cmd = new Command("introspect")
    .description("Connect to configured MCP servers and snapshot tools/list")
    .option("--config <path>", "Path to config file", defaultConfigPath())
    .option("--outDir <path>", "Output directory (default: toolbox)")
    .option("--server <name>", "Only introspect a single server (name)")
    .action(async (opts) => {
      const config = await loadToolboxConfig(opts.config);
      const outDir = resolveOutDir({
        configPath: opts.config,
        outDirOverride: opts.outDir,
        configOutDir: config.generation?.outDir,
      });
      const target = opts.server as string | undefined;

      const servers = config.servers.filter((s) =>
        target ? s.name === target : true
      );

      for (const serverConfig of servers) {
        const s = spinner();
        s.start(`Introspecting ${serverConfig.name}…`);
        const introspected = await introspectServer({
          serverConfig,
          allowStdioExec: config.security.allowStdioExec,
        envAllowlist: config.security.envAllowlist,
          clientName: config.client?.name,
          clientVersion: config.client?.version,
        });
        const serverSlug = slugifyServerName(serverConfig.name);
        await writeLatestSnapshot({
          outDir,
          serverSlug,
          serverName: serverConfig.name,
          introspected,
        });
        s.stop(
          `Snapshotted ${serverConfig.name} (${introspected.tools.length} tools)`
        );
      }
      outro(`Snapshots written to ${outDir}`);
    });

  return cmd;
}
