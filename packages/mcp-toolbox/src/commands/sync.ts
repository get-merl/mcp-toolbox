import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { Command } from "commander";
import { confirm, isCancel, log, progress, outro } from "@clack/prompts";

import {
  defaultConfigPath,
  loadToolboxConfig,
  fileExists,
} from "mcp-toolbox-runtime";
import type { ToolboxServerConfig } from "mcp-toolbox-runtime";
import { slugifyServerName } from "../lib/slug.js";
import { resolveOutDir } from "../lib/resolveOutDir.js";

import { introspectServer } from "../introspect/introspectServer.js";
import type { SnapshotMeta } from "../snapshot/writeSnapshot.js";
import { writeLatestSnapshot } from "../snapshot/writeSnapshot.js";
import { fingerprint } from "../snapshot/fingerprint.js";

import { diffSnapshots } from "../diff/diffSnapshots.js";
import { renderDiffReport } from "../diff/report.js";

import { generateServerTs } from "../codegen/ts/generateServer.js";
import { writeCatalog } from "../codegen/catalog.js";
import { writeToolboxReadme } from "../codegen/readme.js";
import type { IntrospectedServer } from "../introspect/types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Result tracking types
// ─────────────────────────────────────────────────────────────────────────────

type SuccessfulServer = { serverName: string; toolsCount: number };
type FailedServer = { serverName: string; error: string };
type BreakingChange = {
  serverName: string;
  oldVersion: string;
  newVersion: string;
};
type CatalogEntry = {
  serverSlug: string;
  serverName: string;
  snapshot: IntrospectedServer;
};

interface SyncResults {
  successful: SuccessfulServer[];
  failed: FailedServer[];
  breakingChanges: BreakingChange[];
  catalogEntries: CatalogEntry[];
  anyOutOfSync: boolean;
}

function createSyncResults(): SyncResults {
  return {
    successful: [],
    failed: [],
    breakingChanges: [],
    catalogEntries: [],
    anyOutOfSync: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary message formatting
// ─────────────────────────────────────────────────────────────────────────────

function formatSyncSummary(results: SyncResults, checkOnly: boolean): string {
  if (checkOnly) {
    return results.anyOutOfSync ? "Out of sync" : "Up to date";
  }

  if (results.failed.length > 0) {
    const successMsg =
      results.successful.length > 0
        ? `${results.successful.length} succeeded, `
        : "";
    const plural = results.failed.length === 1 ? "" : "s";
    return `${successMsg}${results.failed.length} server${plural} failed`;
  }

  if (results.successful.length > 0) {
    const toolsCount = results.successful.reduce(
      (sum, s) => sum + s.toolsCount,
      0
    );
    const serverPlural = results.successful.length === 1 ? "" : "s";
    const toolPlural = toolsCount === 1 ? "" : "s";
    return `Synced ${results.successful.length} server${serverPlural} (${toolsCount} tool${toolPlural} total)`;
  }

  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-sync finalization
// ─────────────────────────────────────────────────────────────────────────────

async function finalizeSyncOutput(args: {
  outDir: string;
  catalogEntries: CatalogEntry[];
  shouldFormat: boolean;
}): Promise<void> {
  await writeCatalog({ outDir: args.outDir, entries: args.catalogEntries });
  await writeToolboxReadme(args.outDir);

  if (args.shouldFormat) {
    await tryFormatWithOxfmt(args.outDir);
  }
}

export function syncCommand() {
  // Defensive handling of defaultConfigPath to ensure it always returns a string
  let defaultConfigPathValue: string;
  try {
    defaultConfigPathValue = defaultConfigPath();
    if (!defaultConfigPathValue || typeof defaultConfigPathValue !== "string") {
      defaultConfigPathValue = "mcp-toolbox.config.json";
    }
  } catch (err) {
    defaultConfigPathValue = "mcp-toolbox.config.json";
  }

  const cmd = new Command("sync")
    .description(
      "Introspect servers, snapshot schemas, and regenerate wrappers"
    )
    .option("--config <path>", "Path to config file", defaultConfigPathValue)
    .option("--yes", "Run non-interactively (accept breaking changes)", false)
    .option(
      "--check",
      "Fail if upstream changed but code not regenerated",
      false
    )
    .option("--no-format", "Skip formatting generated output with oxfmt")
    .action(async (opts) => {
      let p: ReturnType<typeof progress> | undefined;
      let progressStarted = false;
      try {
        const configPath: string = opts.config;
        const nonInteractive: boolean = Boolean(opts.yes);
        const checkOnly: boolean = Boolean(opts.check);
        const shouldFormat: boolean = Boolean(opts.format);

        if (!(await fileExists(configPath))) {
          const errorMsg = `Config file not found at ${configPath}. Run 'mcp-toolbox init' first.`;
          log.error(errorMsg);
          process.exitCode = 1;
          return;
        }

        const config = await loadToolboxConfig(configPath);
        const outDir = resolveOutDir({
          configPath,
          configOutDir: config.generation.outDir,
        });

        const results = createSyncResults();

        const totalServers = config.servers.length;
        p = progress({ max: totalServers });

        if (totalServers > 0) {
          p.start("Syncing servers...");
          progressStarted = true;

          for (let i = 0; i < config.servers.length; i++) {
            const serverCfg = config.servers[i];
            if (!serverCfg) continue;

            try {
              const result = await processServer({
                serverCfg,
                outDir,
                allowStdioExec: config.security.allowStdioExec,
                envAllowlist: config.security.envAllowlist,
                clientName: config.client?.name,
                clientVersion: config.client?.version,
                checkOnly,
                onStatusUpdate: (status) => {
                  if (p && progressStarted) {
                    p.advance(0, `${serverCfg.name}: ${status}`);
                  }
                },
              });

              if (result.status === "checked") {
                if (result.changed) results.anyOutOfSync = true;
                p.advance(
                  1,
                  result.changed
                    ? `${result.serverName}: Changed`
                    : `${result.serverName}: Up to date`
                );
                continue;
              }

              if (result.breakingChange && !nonInteractive) {
                results.breakingChanges.push(result.breakingChange);
              }

              results.catalogEntries.push({
                serverSlug: result.serverSlug,
                serverName: result.serverName,
                snapshot: result.snapshot,
              });
              results.successful.push({
                serverName: result.serverName,
                toolsCount: result.toolsCount,
              });
              p.advance(
                1,
                `✓ ${result.serverName} (${result.toolsCount} tools)`
              );
            } catch (error: unknown) {
              const errorMsg =
                error instanceof Error ? error.message : String(error);
              results.failed.push({
                serverName: serverCfg.name,
                error: errorMsg,
              });
              p.advance(1, `✗ ${serverCfg.name}: Failed`);
            }
          }

          // Stop progress bar with summary message
          if (progressStarted) {
            const summary = formatSyncSummary(results, checkOnly);
            p.stop(summary || undefined);
            progressStarted = false;
          }
        }

        // Display detailed error messages (only for errors in non-check mode)
        if (!checkOnly) {
          for (const failed of results.failed) {
            log.error(`${failed.serverName}: ${failed.error}`);
          }

          // Handle breaking changes after all tasks complete (in interactive mode)
          if (!nonInteractive && results.breakingChanges.length > 0) {
            const serversList = results.breakingChanges
              .map(
                (b) => `  - ${b.serverName} (${b.oldVersion} → ${b.newVersion})`
              )
              .join("\n");
            const ok = await confirm({
              message: `Breaking changes detected for ${results.breakingChanges.length} server(s):\n${serversList}\n\nCode has been regenerated. Continue?`,
              initialValue: true,
            });
            if (isCancel(ok) || !ok) {
              throw new Error("Aborted by user.");
            }
          }

          // Only set exit code to 1 if all servers failed (complete failure)
          if (results.failed.length > 0 && results.successful.length === 0) {
            process.exitCode = 1;
          }
        } else {
          // Check-only mode summary
          if (results.anyOutOfSync) {
            log.warn("Some servers are out of sync");
            process.exitCode = 1;
          } else {
            log.success("All servers are up to date");
          }
        }

        if (checkOnly) {
          return;
        }

        await finalizeSyncOutput({
          outDir,
          catalogEntries: results.catalogEntries,
          shouldFormat,
        });

        outro(`Finished: MCP Toolbox generated at ${outDir}`);
      } catch (error: unknown) {
        // Stop progress bar if it was started
        if (p && progressStarted) {
          p.stop("Sync failed");
        }
        const errorMsg = error instanceof Error ? error.message : String(error);
        log.error(errorMsg);
        process.exitCode = 1;
      }
    });

  return cmd;
}

type ServerResult =
  | { status: "checked"; serverName: string; changed: boolean }
  | {
      status: "success";
      serverName: string;
      serverSlug: string;
      toolsCount: number;
      snapshot: any;
      breakingChange?: {
        serverName: string;
        oldVersion: string;
        newVersion: string;
      };
    };

async function processServer(args: {
  serverCfg: ToolboxServerConfig;
  outDir: string;
  allowStdioExec: boolean;
  envAllowlist: string[];
  clientName?: string;
  clientVersion?: string;
  checkOnly: boolean;
  onStatusUpdate?: (status: string) => void;
}): Promise<ServerResult> {
  if (!args.serverCfg.name || typeof args.serverCfg.name !== "string") {
    throw new Error(
      `Server has invalid or missing name: ${args.serverCfg.name}`
    );
  }

  const serverSlug = slugifyServerName(args.serverCfg.name);
  const baseDir = path.join(args.outDir, ".snapshots", serverSlug);
  const latestJsonPath = path.join(baseDir, "latest.json");
  const latestMetaPath = path.join(baseDir, "latest.meta.json");

  const oldSnap = await readJsonIfExists<any>(latestJsonPath);
  const oldMeta = await readJsonIfExists<SnapshotMeta>(latestMetaPath);

  const newSnap = await introspectServer({
    serverConfig: args.serverCfg,
    allowStdioExec: args.allowStdioExec,
    envAllowlist: args.envAllowlist,
    clientName: args.clientName,
    clientVersion: args.clientVersion,
    onStatusUpdate: args.onStatusUpdate,
  });

  const newFingerprintCandidate = fingerprintFromTools(newSnap);
  const oldFingerprint = oldMeta?.schemaFingerprint;
  const changed = oldFingerprint
    ? oldFingerprint !== newFingerprintCandidate
    : true;

  if (args.checkOnly) {
    return { status: "checked", serverName: args.serverCfg.name, changed };
  }

  let breakingChange:
    | { serverName: string; oldVersion: string; newVersion: string }
    | undefined;

  // Diff/report only (we never patch generated output; we always regenerate).
  if (oldSnap) {
    const diff = diffSnapshots(oldSnap, newSnap);
    if (diff.changes.length > 0) {
      const report = renderDiffReport({
        serverName: args.serverCfg.name,
        oldVersion: oldSnap.version,
        newVersion: newSnap.version,
        diff,
      });

      const reportsDir = path.join(args.outDir, ".reports", serverSlug);
      await fs.mkdir(reportsDir, { recursive: true });
      const reportName = `${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
      await fs.writeFile(path.join(reportsDir, reportName), report, "utf-8");

      if (diff.breaking) {
        breakingChange = {
          serverName: args.serverCfg.name,
          oldVersion: oldSnap.version,
          newVersion: newSnap.version,
        };
      }
    }
  }

  // Generate code
  await writeLatestSnapshot({
    outDir: args.outDir,
    serverSlug,
    serverName: args.serverCfg.name,
    introspected: newSnap,
  });

  await generateServerTs({
    outDir: args.outDir,
    serverSlug,
    serverName: args.serverCfg.name,
    snapshot: newSnap,
  });

  return {
    status: "success",
    serverName: args.serverCfg.name,
    serverSlug,
    toolsCount: newSnap.tools.length,
    snapshot: newSnap,
    breakingChange,
  };
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const txt = await fs.readFile(filePath, "utf-8");
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

function fingerprintFromTools(snap: {
  tools: unknown;
  version: string;
  serverName: string;
}) {
  return fingerprint({
    serverName: snap.serverName,
    version: snap.version,
    tools: snap.tools,
  });
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
      else
        reject(
          new Error(
            `${command} ${args.join(" ")} failed with exit code ${code}`
          )
        );
    });
  });
}
