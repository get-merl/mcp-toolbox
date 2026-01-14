import { Command } from "commander";
import { spinner } from "@clack/prompts";
import { defaultConfigPath, defaultOutDir, loadToolboxConfig } from "mcp-toolbox-runtime";
import { slugifyServerName } from "../lib/slug";
import { introspectServer } from "../introspect/introspectServer";
import { writeLatestSnapshot } from "../snapshot/writeSnapshot";

export function introspectCommand() {
  const cmd = new Command("introspect")
    .description("Connect to configured MCP servers and snapshot tools/list")
    .option("--config <path>", "Path to config file", defaultConfigPath())
    .option("--outDir <path>", "Output directory (default: toolbox)", defaultOutDir())
    .option("--server <registryId>", "Only introspect a single server (registryId)")
    .option("--json", "Output machine-readable JSON", false)
    .action(async (opts) => {
      const config = await loadToolboxConfig(opts.config);
      const outDir = opts.outDir ?? config.generation?.outDir ?? defaultOutDir();
      const target = opts.server as string | undefined;

      const servers = config.servers.filter((s) => (target ? s.registryId === target : true));
      const results: Array<{
        registryId: string;
        serverSlug: string;
        schemaFingerprint: string;
      }> = [];

      for (const serverConfig of servers) {
        const s = spinner();
        s.start(`Introspecting ${serverConfig.registryId}…`);
        const introspected = await introspectServer({
          serverConfig,
          allowStdioExec: config.security.allowStdioExec,
        });
        const serverSlug = slugifyServerName(serverConfig.registryId);
        const written = await writeLatestSnapshot({
          outDir,
          serverSlug,
          registryId: serverConfig.registryId,
          channel: serverConfig.channel,
          introspected,
        });
        s.stop(`Snapshotted ${serverConfig.registryId} (${introspected.tools.length} tools)`);
        results.push({
          registryId: serverConfig.registryId,
          serverSlug,
          schemaFingerprint: written.schemaFingerprint,
        });
      }

      if (opts.json) {
        process.stdout.write(JSON.stringify({ results }, null, 2) + "\n");
      }
    });

  return cmd;
}

