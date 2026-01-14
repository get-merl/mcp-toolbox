import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { Command } from "commander";
import { confirm, isCancel, spinner } from "@clack/prompts";

import { defaultConfigPath, loadToolboxConfig, fileExists } from "mcp-toolbox-runtime";
import { slugifyServerName } from "../lib/slug";

import { introspectServer } from "../introspect/introspectServer";
import type { SnapshotMeta } from "../snapshot/writeSnapshot";
import { writeLatestSnapshot } from "../snapshot/writeSnapshot";
import { fingerprint } from "../snapshot/fingerprint";

import { diffSnapshots } from "../diff/diffSnapshots";
import { renderDiffReport } from "../diff/report";

import { generateServerTs } from "../codegen/ts/generateServer";
import { writeCatalog } from "../codegen/catalog";
import { writeToolboxReadme } from "../codegen/readme";

export function syncCommand() {
  const cmd = new Command("sync")
    .description("Introspect servers, snapshot schemas, and regenerate wrappers")
    .option("--config <path>", "Path to config file", defaultConfigPath())
    .option("--yes", "Run non-interactively (accept breaking changes)", false)
    .option("--check", "Fail if upstream changed but code not regenerated", false)
    .option("--json", "Output machine-readable JSON", false)
    .option("--no-format", "Skip formatting generated output with oxfmt")
    .action(async (opts) => {
      const configPath: string = opts.config;
      const nonInteractive: boolean = Boolean(opts.yes);
      const checkOnly: boolean = Boolean(opts.check);
      const shouldFormat: boolean = Boolean(opts.format);

      if (!(await fileExists(configPath))) {
        throw new Error(`Config file not found at ${configPath}. Run 'mcp-toolbox init' first.`);
      }

      const config = await loadToolboxConfig(configPath);
      const outDir = config.generation.outDir || "toolbox";

      const entriesForCatalog: Array<{
        serverSlug: string;
        registryId: string;
        snapshot: any;
      }> = [];

      const results: any[] = [];
      let anyOutOfSync = false;

      for (const serverCfg of config.servers) {
        const serverSlug = slugifyServerName(serverCfg.registryId);
        const baseDir = path.join(outDir, ".snapshots", serverSlug);
        const latestJsonPath = path.join(baseDir, "latest.json");
        const latestMetaPath = path.join(baseDir, "latest.meta.json");

        const oldSnap = await readJsonIfExists<any>(latestJsonPath);
        const oldMeta = await readJsonIfExists<SnapshotMeta>(latestMetaPath);

        const s = spinner();
        s.start(`Introspecting ${serverCfg.registryId}...`);
        const newSnap = await introspectServer({
          serverConfig: serverCfg,
          allowStdioExec: config.security.allowStdioExec,
        });
        s.stop(`Fetched tools (${newSnap.tools.length})`);

        const newFingerprintCandidate = fingerprintFromTools(newSnap);
        const oldFingerprint = oldMeta?.schemaFingerprint;
        const changed = oldFingerprint ? oldFingerprint !== newFingerprintCandidate : true;

        if (checkOnly) {
          if (changed) anyOutOfSync = true;
          results.push({ registryId: serverCfg.registryId, changed });
          continue;
        }

        // Diff/report only (we never patch generated output; we always regenerate).
        if (oldSnap) {
          const diff = diffSnapshots(oldSnap, newSnap);
          if (diff.changes.length > 0) {
            const report = renderDiffReport({
              registryId: serverCfg.registryId,
              oldVersion: oldSnap.version,
              newVersion: newSnap.version,
              diff,
            });

            const reportsDir = path.join(outDir, ".reports", serverSlug);
            await fs.mkdir(reportsDir, { recursive: true });
            const reportName = `${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
            await fs.writeFile(path.join(reportsDir, reportName), report, "utf-8");

            if (diff.breaking && !nonInteractive) {
              const ok = await confirm({
                message: `Breaking changes detected for ${serverCfg.registryId}. Continue and regenerate?`,
                initialValue: false,
              });
              if (isCancel(ok) || !ok) {
                throw new Error(`Aborted due to breaking changes for ${serverCfg.registryId}.`);
              }
            }
          }
        }

        const written = await writeLatestSnapshot({
          outDir,
          serverSlug,
          registryId: serverCfg.registryId,
          channel: serverCfg.channel,
          introspected: newSnap,
        });

        await generateServerTs({
          outDir,
          serverSlug,
          registryId: serverCfg.registryId,
          snapshot: newSnap,
        });

        entriesForCatalog.push({ serverSlug, registryId: serverCfg.registryId, snapshot: newSnap });

        results.push({
          registryId: serverCfg.registryId,
          serverSlug,
          schemaFingerprint: written.schemaFingerprint,
          changed,
        });
      }

      if (checkOnly) {
        if (opts.json) process.stdout.write(JSON.stringify({ results }, null, 2) + "\n");
        if (anyOutOfSync) process.exitCode = 1;
        return;
      }

      await writeCatalog({ outDir, entries: entriesForCatalog });
      await writeToolboxReadme(outDir);

      if (shouldFormat) {
        await tryFormatWithOxfmt(outDir);
      }

      if (opts.json) process.stdout.write(JSON.stringify({ results }, null, 2) + "\n");
    });

  return cmd;
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const txt = await fs.readFile(filePath, "utf-8");
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

function fingerprintFromTools(snap: { tools: unknown; version: string; serverName: string }) {
  return fingerprint({ serverName: snap.serverName, version: snap.version, tools: snap.tools });
}

async function tryFormatWithOxfmt(targetDir: string) {
  // Use local binary if available; fall back to npx.
  const localBin = path.join(process.cwd(), "node_modules", ".bin", "oxfmt");
  const cmd = await fileExists(localBin).then((ok) => (ok ? localBin : "npx"));
  const args =
    cmd === "npx"
      ? ["--no-install", "oxfmt", "--write", targetDir]
      : ["--write", targetDir];
  await spawnAndWait(cmd, args);
}

async function spawnAndWait(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

