import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { Command } from "commander";
import { confirm, isCancel, log, progress, outro } from "@clack/prompts";

import {
  loadToolboxConfigWithPath,
  fileExists,
  resolveAuth,
  isAuthError,
} from "@merl-ai/mcp-toolbox-runtime";
import type { ToolboxServerConfig } from "@merl-ai/mcp-toolbox-runtime";
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
import { writeScriptsFolder } from "../lib/writeScriptsFolder.js";
import type { IntrospectedServer } from "../introspect/types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Result tracking types
// ─────────────────────────────────────────────────────────────────────────────

type SuccessfulServer = { serverName: string; toolsCount: number };
type FailedServer = { serverName: string; error: string };
type SkippedServer = { serverName: string; reason: string };
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
  skipped: SkippedServer[];
  breakingChanges: BreakingChange[];
  catalogEntries: CatalogEntry[];
  anyOutOfSync: boolean;
}

function createSyncResults(): SyncResults {
  return {
    successful: [],
    failed: [],
    skipped: [],
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

  const parts: string[] = [];
  if (results.successful.length > 0) {
    const toolsCount = results.successful.reduce(
      (sum, s) => sum + s.toolsCount,
      0
    );
    const serverPlural = results.successful.length === 1 ? "" : "s";
    const toolPlural = toolsCount === 1 ? "" : "s";
    parts.push(
      `Synced ${results.successful.length} server${serverPlural} (${toolsCount} tool${toolPlural} total)`
    );
  }
  if (results.skipped.length > 0) {
    const plural = results.skipped.length === 1 ? "" : "s";
    parts.push(`${results.skipped.length} server${plural} skipped`);
  }
  if (results.failed.length > 0) {
    const plural = results.failed.length === 1 ? "" : "s";
    parts.push(`${results.failed.length} server${plural} failed`);
  }

  return parts.join(", ") || "";
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
  await writeScriptsFolder(args.outDir);

  if (args.shouldFormat) {
    await tryFormatWithOxfmt(args.outDir);
  }
}

export function syncCommand() {
  const cmd = new Command("sync")
    .description(
      "Introspect servers, snapshot schemas, and regenerate wrappers"
    )
    .option("--config <path>", "Path to config file (auto-detected if not specified)")
    .option("--yes", "Run non-interactively (accept breaking changes)", false)
    .option(
      "--check",
      "Fail if upstream changed but code not regenerated",
      false
    )
    .option("--no-format", "Skip formatting generated output with oxfmt")
    .option("--server <name>", "Sync only the specified server")
    .option(
      "--skip-missing-auth",
      "Skip servers with missing auth tokens instead of failing",
      false
    )
    .action(async (opts) => {
      let p: ReturnType<typeof progress> | undefined;
      let progressStarted = false;
      try {
        const configPathOpt: string | undefined = opts.config;
        const nonInteractive: boolean = Boolean(opts.yes);
        const checkOnly: boolean = Boolean(opts.check);
        const shouldFormat: boolean = Boolean(opts.format);
        const serverFilter: string | undefined = opts.server;
        const skipMissingAuth: boolean = Boolean(opts.skipMissingAuth);

        const { config, filepath: configPath } = await loadToolboxConfigWithPath(configPathOpt);
        const outDir = resolveOutDir({
          configPath,
          configOutDir: config.generation.outDir,
        });

        // In CI environment, skip server connections in check mode
        // Just verify generated code exists and is valid
        const isCI = Boolean(
          process.env["CI"] || process.env["GITHUB_ACTIONS"] || process.env["ACT"]
        );
        const shouldSkipMissingAuth = skipMissingAuth || isCI;

        if (isCI && checkOnly) {
          // CI check mode: verify generated code without connecting to servers
          await verifyGeneratedCode(outDir, config.servers);
          return;
        }

        const results = createSyncResults();

        // Filter servers if --server option is specified
        const serversToSync = serverFilter
          ? config.servers.filter((s) => s.name === serverFilter)
          : config.servers;

        if (serverFilter && serversToSync.length === 0) {
          log.error(`Server '${serverFilter}' not found in config`);
          process.exitCode = 1;
          return;
        }

        const totalServers = serversToSync.length;
        p = progress({ max: totalServers });

        if (totalServers > 0) {
          p.start("Syncing servers...");
          progressStarted = true;

          for (let i = 0; i < serversToSync.length; i++) {
            const serverCfg = serversToSync[i];
            if (!serverCfg) continue;

            // Check for missing auth tokens before processing
            const authResult = resolveAuth(serverCfg.transport.auth);
            if (authResult.status === "missing" && shouldSkipMissingAuth) {
              results.skipped.push({
                serverName: serverCfg.name,
                reason: `Missing auth token: ${authResult.envVar}`,
              });
              p.advance(1, `⊘ ${serverCfg.name}: Skipped (missing auth)`);
              continue;
            }

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
              // Handle auth errors (401/403) as per-server failures that don't stop the process
              if (isAuthError(error)) {
                const errorMsg =
                  error instanceof Error ? error.message : String(error);
                results.failed.push({
                  serverName: serverCfg.name,
                  error: `Authentication failed: ${errorMsg}`,
                });
                p.advance(1, `✗ ${serverCfg.name}: Auth failed`);
                continue; // Continue to next server
              }

              // Other errors
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
          for (const skipped of results.skipped) {
            log.warn(`${skipped.serverName}: ${skipped.reason}`);
          }
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

async function verifyGeneratedCode(
  outDir: string,
  servers: ToolboxServerConfig[]
): Promise<void> {
  // If no servers are configured, there's nothing to verify
  // This is considered a valid state (exit code 0)
  if (servers.length === 0) {
    return;
  }

  const catalogPath = path.join(outDir, "catalog.json");
  const readmePath = path.join(outDir, "README.md");
  const serversDir = path.join(outDir, "servers");

  // Check that catalog.json exists and is valid
  if (!(await fileExists(catalogPath))) {
    throw new Error(
      `Generated code verification failed: catalog.json not found at ${catalogPath}`
    );
  }

  try {
    const catalogContent = await fs.readFile(catalogPath, "utf-8");
    JSON.parse(catalogContent);
  } catch (error) {
    throw new Error(
      `Generated code verification failed: catalog.json is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  // Check that README.md exists
  if (!(await fileExists(readmePath))) {
    throw new Error(
      `Generated code verification failed: README.md not found at ${readmePath}`
    );
  }

  // Check that servers directory exists
  if (!(await fileExists(serversDir))) {
    throw new Error(
      `Generated code verification failed: servers directory not found at ${serversDir}`
    );
  }

  // Verify each configured server has generated code
  for (const server of servers) {
    const serverSlug = slugifyServerName(server.name);
    const serverDir = path.join(serversDir, serverSlug);
    const indexPath = path.join(serverDir, "index.ts");

    if (!(await fileExists(serverDir))) {
      throw new Error(
        `Generated code verification failed: server directory not found for '${server.name}' at ${serverDir}`
      );
    }

    if (!(await fileExists(indexPath))) {
      throw new Error(
        `Generated code verification failed: index.ts not found for server '${server.name}' at ${indexPath}`
      );
    }

    // Verify snapshot exists
    const snapshotDir = path.join(outDir, ".snapshots", serverSlug);
    const latestSnapshotPath = path.join(snapshotDir, "latest.json");
    if (!(await fileExists(latestSnapshotPath))) {
      throw new Error(
        `Generated code verification failed: snapshot not found for server '${server.name}' at ${latestSnapshotPath}`
      );
    }
  }

  log.success("Generated code verification passed");
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
