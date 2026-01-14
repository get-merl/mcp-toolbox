#!/usr/bin/env node

// src/cli.ts
import { Command as Command7 } from "commander";
import { intro, outro as outro2 } from "@clack/prompts";

// src/commands/init.ts
import { Command } from "commander";
import { confirm, isCancel, outro, text } from "@clack/prompts";
import { defaultConfigPath, defaultOutDir, fileExists } from "mcp-toolbox-runtime";

// src/lib/writeConfig.ts
import fs from "fs/promises";
import path from "path";
async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}
async function writeToolboxConfigTs(configPath, config) {
  await ensureDir(path.dirname(configPath));
  const contents = `import type { ToolboxConfig } from "mcp-toolbox";

const config: ToolboxConfig = ${JSON.stringify(config, null, 2)};

export default config;
`;
  await fs.writeFile(configPath, contents, "utf-8");
}

// src/commands/init.ts
function initCommand() {
  const cmd = new Command("init").description("Initialize mcp-toolbox in the current repo").option("--config <path>", "Path to config file", defaultConfigPath()).option("--outDir <path>", "Generated output directory", defaultOutDir()).option("--yes", "Run non-interactively with defaults", false);
  cmd.action(async (opts) => {
    const configPath = opts.config;
    const outDir = opts.outDir;
    const nonInteractive = Boolean(opts.yes);
    if (!nonInteractive) {
      const outDirAnswer = await text({
        message: "Where should generated wrappers be written?",
        initialValue: outDir
      });
      if (isCancel(outDirAnswer)) return;
      const outDirStr = outDirAnswer;
      const writeIfMissing = await confirm({
        message: `Write config file at ${configPath}?`,
        initialValue: true
      });
      if (isCancel(writeIfMissing)) return;
      if (!writeIfMissing) {
        outro("Init cancelled.");
        return;
      }
      await maybeWriteConfig(configPath, outDirStr);
      return;
    }
    await maybeWriteConfig(configPath, outDir);
  });
  return cmd;
}
async function maybeWriteConfig(configPath, outDir) {
  if (await fileExists(configPath)) return;
  await writeToolboxConfigTs(configPath, {
    servers: [],
    generation: { outDir, language: "ts" },
    security: { allowStdioExec: false, envAllowlist: [] },
    cli: { interactive: true }
  });
}

// src/commands/registry.ts
import { Command as Command2 } from "commander";
import { spinner } from "@clack/prompts";
import { RegistryClient } from "mcp-toolbox-runtime";
function registryCommand() {
  const cmd = new Command2("registry").description("Query the MCP registry");
  cmd.command("search").argument("<query>", "Search term").option("--json", "Output machine-readable JSON", false).action(async (query, opts) => {
    const s = spinner();
    s.start("Searching registry\u2026");
    const client = new RegistryClient();
    const res = await client.listServers({ search: query, version: "latest" });
    s.stop(`Found ${res.servers?.length ?? 0} servers`);
    if (opts.json) {
      process.stdout.write(JSON.stringify(res, null, 2) + "\n");
      return;
    }
    for (const entry of res.servers ?? []) {
      const server = entry.server;
      console.log(`${server.name}@${server.version} \u2014 ${server.title ?? server.description}`);
    }
  });
  cmd.command("list").option("--json", "Output machine-readable JSON", false).action(async (opts) => {
    const s = spinner();
    s.start("Listing registry servers\u2026");
    const client = new RegistryClient();
    const res = await client.listServers({ version: "latest", limit: 30 });
    s.stop(`Got ${res.servers?.length ?? 0} servers (page)`);
    if (opts.json) {
      process.stdout.write(JSON.stringify(res, null, 2) + "\n");
      return;
    }
    for (const entry of res.servers ?? []) {
      const server = entry.server;
      console.log(`${server.name}@${server.version} \u2014 ${server.title ?? server.description}`);
    }
    if (res.metadata?.next_cursor) {
      console.log(`next_cursor: ${res.metadata.next_cursor}`);
    }
  });
  cmd.command("show").argument("<id>", "Registry server ID").option("--json", "Output machine-readable JSON", false).option("--version <version>", "Version to fetch (default: latest)", "latest").action(async (id, opts) => {
    const s = spinner();
    s.start(`Fetching ${id}@${opts.version}\u2026`);
    const client = new RegistryClient();
    const res = await client.getServerVersion({ serverName: id, version: opts.version });
    s.stop("Fetched");
    if (opts.json) {
      process.stdout.write(JSON.stringify(res, null, 2) + "\n");
      return;
    }
    const server = res.server;
    console.log(`${server.name}@${server.version}`);
    console.log(server.title ?? "");
    console.log(server.description);
    if (server.websiteUrl) console.log(`website: ${server.websiteUrl}`);
  });
  return cmd;
}

// src/commands/add.ts
import { Command as Command3 } from "commander";
import { isCancel as isCancel2, select, spinner as spinner2, text as text2 } from "@clack/prompts";
import { defaultConfigPath as defaultConfigPath2, loadToolboxConfig, fileExists as fileExists2, RegistryClient as RegistryClient2 } from "mcp-toolbox-runtime";
function addCommand() {
  const cmd = new Command3("add").description("Add a registry server to mcp-toolbox.config.ts").argument("[registryId]", "Registry server ID").option("--config <path>", "Path to config file", defaultConfigPath2()).option("--yes", "Run non-interactively", false).action(async (registryId, opts) => {
    const configPath = opts.config;
    const nonInteractive = Boolean(opts.yes);
    if (!await fileExists2(configPath)) {
      throw new Error(
        `Config file not found at ${configPath}. Run 'mcp-toolbox init' first.`
      );
    }
    const config = await loadToolboxConfig(configPath);
    const client = new RegistryClient2();
    let chosenId = registryId;
    if (!chosenId && !nonInteractive) {
      const query = await text2({ message: "Search for a server (name substring):" });
      if (isCancel2(query)) return;
      const s = spinner2();
      s.start("Searching registry\u2026");
      const res = await client.listServers({ search: String(query), version: "latest", limit: 30 });
      s.stop(`Found ${res.servers?.length ?? 0}`);
      const options = (res.servers ?? []).map((x) => ({
        value: x.server.name,
        label: `${x.server.name}@${x.server.version}`,
        hint: x.server.title ?? x.server.description
      })) ?? [];
      if (options.length === 0) {
        throw new Error("No matching servers found.");
      }
      const picked = await select({
        message: "Select a server to add:",
        options
      });
      if (isCancel2(picked)) return;
      chosenId = String(picked);
    }
    if (!chosenId) {
      throw new Error("registryId is required (or run without --yes for interactive selection).");
    }
    await client.getServerVersion({ serverName: chosenId, version: "latest" });
    if (config.servers.some((s) => s.registryId === chosenId)) return;
    config.servers.push({ registryId: chosenId, channel: "latest" });
    await writeToolboxConfigTs(configPath, config);
  });
  return cmd;
}

// src/commands/remove.ts
import { Command as Command4 } from "commander";
import { defaultConfigPath as defaultConfigPath3 } from "mcp-toolbox-runtime";
function removeCommand() {
  const cmd = new Command4("remove").description("Remove a registry server from mcp-toolbox.config.ts").argument("[registryId]", "Registry server ID").option("--config <path>", "Path to config file", defaultConfigPath3()).option("--yes", "Run non-interactively", false).action(async (registryId, _opts) => {
    if (!registryId) {
      console.log(
        "remove requires a registryId for now (interactive mode not implemented yet)"
      );
      return;
    }
    console.log(`remove not implemented yet (registryId=${registryId})`);
  });
  return cmd;
}

// src/commands/introspect.ts
import { Command as Command5 } from "commander";
import { spinner as spinner3 } from "@clack/prompts";
import { defaultConfigPath as defaultConfigPath4, defaultOutDir as defaultOutDir2, loadToolboxConfig as loadToolboxConfig2 } from "mcp-toolbox-runtime";

// src/lib/slug.ts
function slugifyServerName(serverName) {
  return serverName.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

// src/introspect/introspectServer.ts
import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { RegistryClient as RegistryClient3 } from "mcp-toolbox-runtime";
async function introspectServer(args) {
  const registry = new RegistryClient3();
  const serverName = args.serverConfig.registryId;
  const registryRes = await registry.getServerVersion({
    serverName,
    version: "latest"
  });
  const transport = await chooseTransport({
    serverConfig: args.serverConfig,
    allowStdioExec: args.allowStdioExec,
    registryServerJson: registryRes.server
  });
  const client = new Client({ name: "mcp-toolbox", version: "0.0.1" });
  try {
    await client.connect(transport);
    const toolsResult = await client.listTools();
    const tools = (toolsResult.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }));
    return {
      serverName,
      version: registryRes.server.version ?? "latest",
      retrievedAt: (/* @__PURE__ */ new Date()).toISOString(),
      transport: describeTransport(transport),
      tools
    };
  } finally {
    await safeCloseTransport(transport);
  }
}
async function safeCloseTransport(transport) {
  try {
    await transport.close?.();
  } catch {
  }
}
function describeTransport(transport) {
  const t = transport;
  const ctorName = transport?.constructor?.name ?? "";
  if (ctorName.includes("StreamableHTTP")) {
    return { kind: "streamable-http", url: String(t?.url ?? "") };
  }
  if (ctorName.includes("SSE")) {
    return { kind: "sse", url: String(t?.url ?? "") };
  }
  return { kind: "stdio", command: t?.command, args: t?.args };
}
async function chooseTransport(args) {
  const overrideHttp = args.serverConfig.overrides?.http?.url;
  if (overrideHttp) {
    return new StreamableHTTPClientTransport(new URL(overrideHttp), {});
  }
  const overrideRun = args.serverConfig.overrides?.run;
  if (overrideRun) {
    if (!args.allowStdioExec) {
      throw new Error(
        `Refusing to run stdio server '${args.serverConfig.registryId}' because security.allowStdioExec=false`
      );
    }
    return new StdioClientTransport({
      command: overrideRun.command,
      args: overrideRun.args ?? [],
      env: overrideRun.env
    });
  }
  const remotes = args.registryServerJson?.remotes ?? [];
  const streamable = remotes.find((r) => r.type === "streamable-http" && r.url);
  if (streamable?.url) {
    if (streamable.variables && Object.keys(streamable.variables).length > 0) {
      throw new Error(
        `Remote transport for '${args.serverConfig.registryId}' requires variables; set overrides.http.url instead.`
      );
    }
    return new StreamableHTTPClientTransport(new URL(streamable.url), {});
  }
  const sse = remotes.find((r) => r.type === "sse" && r.url);
  if (sse?.url) {
    throw new Error(
      `Server '${args.serverConfig.registryId}' only advertises legacy SSE. Provide overrides.http.url or overrides.run to introspect.`
    );
  }
  const packages = args.registryServerJson?.packages ?? [];
  const npmStdio = packages.find(
    (p) => p.registryType === "npm" && p.transport?.type === "stdio" && p.identifier
  );
  if (npmStdio?.identifier) {
    if (!args.allowStdioExec) {
      throw new Error(
        `Refusing to run stdio server '${args.serverConfig.registryId}' because security.allowStdioExec=false`
      );
    }
    const pkgVersion = npmStdio.version && npmStdio.version !== "latest" ? `${npmStdio.identifier}@${npmStdio.version}` : npmStdio.identifier;
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => typeof v === "string")
    );
    const requiredVars = (npmStdio.environmentVariables ?? []).filter((v) => v.isRequired && v.name);
    for (const v of requiredVars) {
      const name = String(v.name);
      if (env[name]) continue;
      if (name === "WORKSPACE_ROOT") {
        env[name] = process.cwd();
        continue;
      }
      throw new Error(
        `Server '${args.serverConfig.registryId}' requires env var ${name}. Set it in overrides.run.env.`
      );
    }
    return new StdioClientTransport({
      command: "npx",
      args: ["-y", pkgVersion],
      env
    });
  }
  throw new Error(
    `No runnable transport found for '${args.serverConfig.registryId}'. Provide overrides.run (stdio) or overrides.http.url.`
  );
}

// src/snapshot/writeSnapshot.ts
import fs2 from "fs/promises";
import path2 from "path";

// src/snapshot/fingerprint.ts
import crypto from "crypto";

// src/snapshot/normalize.ts
function normalizeForHash(value) {
  if (value === null || value === void 0) return value;
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (typeof value !== "object") return value;
  const obj = value;
  const out = {};
  for (const key of Object.keys(obj).sort()) {
    if (key === "retrievedAt" || key === "timestamp") continue;
    out[key] = normalizeForHash(obj[key]);
  }
  return out;
}
function stableStringify(value) {
  return JSON.stringify(normalizeForHash(value));
}

// src/snapshot/fingerprint.ts
function fingerprint(value) {
  const normalized = stableStringify(value);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

// src/snapshot/writeSnapshot.ts
async function writeLatestSnapshot(args) {
  const baseDir = path2.join(args.outDir, ".snapshots", args.serverSlug);
  await fs2.mkdir(baseDir, { recursive: true });
  const schemaFingerprint = fingerprint({
    serverName: args.introspected.serverName,
    version: args.introspected.version,
    tools: args.introspected.tools
  });
  const meta = {
    retrievedAt: args.introspected.retrievedAt,
    registryId: args.registryId,
    channel: args.channel,
    transport: args.introspected.transport,
    serverReportedVersion: args.introspected.version,
    schemaFingerprint
  };
  const latestJsonPath = path2.join(baseDir, "latest.json");
  const latestMetaPath = path2.join(baseDir, "latest.meta.json");
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const historicalPath = path2.join(baseDir, `${timestamp}.json`);
  const snapshotBody = JSON.stringify(args.introspected, null, 2) + "\n";
  await fs2.writeFile(latestJsonPath, snapshotBody, "utf-8");
  await fs2.writeFile(historicalPath, snapshotBody, "utf-8");
  await fs2.writeFile(latestMetaPath, JSON.stringify(meta, null, 2) + "\n", "utf-8");
  return { latestJsonPath, latestMetaPath, schemaFingerprint };
}

// src/commands/introspect.ts
function introspectCommand() {
  const cmd = new Command5("introspect").description("Connect to configured MCP servers and snapshot tools/list").option("--config <path>", "Path to config file", defaultConfigPath4()).option("--outDir <path>", "Output directory (default: toolbox)", defaultOutDir2()).option("--server <registryId>", "Only introspect a single server (registryId)").option("--json", "Output machine-readable JSON", false).action(async (opts) => {
    const config = await loadToolboxConfig2(opts.config);
    const outDir = opts.outDir ?? config.generation?.outDir ?? defaultOutDir2();
    const target = opts.server;
    const servers = config.servers.filter((s) => target ? s.registryId === target : true);
    const results = [];
    for (const serverConfig of servers) {
      const s = spinner3();
      s.start(`Introspecting ${serverConfig.registryId}\u2026`);
      const introspected = await introspectServer({
        serverConfig,
        allowStdioExec: config.security.allowStdioExec
      });
      const serverSlug = slugifyServerName(serverConfig.registryId);
      const written = await writeLatestSnapshot({
        outDir,
        serverSlug,
        registryId: serverConfig.registryId,
        channel: serverConfig.channel,
        introspected
      });
      s.stop(`Snapshotted ${serverConfig.registryId} (${introspected.tools.length} tools)`);
      results.push({
        registryId: serverConfig.registryId,
        serverSlug,
        schemaFingerprint: written.schemaFingerprint
      });
    }
    if (opts.json) {
      process.stdout.write(JSON.stringify({ results }, null, 2) + "\n");
    }
  });
  return cmd;
}

// src/commands/sync.ts
import fs6 from "fs/promises";
import path6 from "path";
import { spawn } from "child_process";
import { Command as Command6 } from "commander";
import { confirm as confirm2, isCancel as isCancel3, spinner as spinner4 } from "@clack/prompts";
import { defaultConfigPath as defaultConfigPath5, loadToolboxConfig as loadToolboxConfig3, fileExists as fileExists3 } from "mcp-toolbox-runtime";

// src/diff/diffSnapshots.ts
function diffSnapshots(oldSnap, newSnap) {
  const oldTools = indexTools(oldSnap.tools);
  const newTools = indexTools(newSnap.tools);
  const changes = [];
  let breaking = false;
  for (const [toolName] of oldTools) {
    if (!newTools.has(toolName)) {
      changes.push({ kind: "tool_removed", toolName });
      breaking = true;
    }
  }
  for (const [toolName] of newTools) {
    if (!oldTools.has(toolName)) {
      changes.push({ kind: "tool_added", toolName });
    }
  }
  for (const [toolName, oldTool] of oldTools) {
    const newTool = newTools.get(toolName);
    if (!newTool) continue;
    const fields = [];
    if ((oldTool.description ?? "") !== (newTool.description ?? "")) {
      changes.push({ kind: "tool_description_changed", toolName });
    }
    if (stableStringify(oldTool.inputSchema) !== stableStringify(newTool.inputSchema)) {
      fields.push("inputSchema");
      breaking = true;
    }
    if (fields.length) {
      changes.push({ kind: "tool_changed", toolName, fields });
    }
  }
  return { breaking, changes };
}
function indexTools(tools) {
  const m = /* @__PURE__ */ new Map();
  for (const t of tools) m.set(t.name, t);
  return m;
}

// src/diff/report.ts
function renderDiffReport(args) {
  const lines = [];
  lines.push(`# MCP Toolbox Diff Report`);
  lines.push("");
  lines.push(`- server: \`${args.registryId}\``);
  if (args.oldVersion) lines.push(`- from: \`${args.oldVersion}\``);
  if (args.newVersion) lines.push(`- to: \`${args.newVersion}\``);
  lines.push(`- breaking: **${args.diff.breaking ? "yes" : "no"}**`);
  lines.push("");
  if (args.diff.changes.length === 0) {
    lines.push("No changes detected.");
    lines.push("");
    return lines.join("\n");
  }
  lines.push("## Changes");
  lines.push("");
  for (const c of args.diff.changes) {
    if (c.kind === "tool_added") lines.push(`- added tool \`${c.toolName}\``);
    if (c.kind === "tool_removed") lines.push(`- removed tool \`${c.toolName}\``);
    if (c.kind === "tool_description_changed")
      lines.push(`- description changed for \`${c.toolName}\``);
    if (c.kind === "tool_changed")
      lines.push(`- schema changed for \`${c.toolName}\`: ${c.fields.join(", ")}`);
  }
  lines.push("");
  return lines.join("\n");
}

// src/codegen/ts/generateServer.ts
import fs3 from "fs/promises";
import path3 from "path";

// src/codegen/ts/names.ts
function toCamelCase(name) {
  const parts = name.split(/[^a-zA-Z0-9]+/g).filter(Boolean);
  if (parts.length === 0) return "tool";
  const [first, ...rest] = parts;
  if (!first) return "tool";
  return first.toLowerCase() + rest.map((p) => p.slice(0, 1).toUpperCase() + p.slice(1).toLowerCase()).join("");
}
function toPascalCase(name) {
  const c = toCamelCase(name);
  return c.slice(0, 1).toUpperCase() + c.slice(1);
}

// src/codegen/ts/jsonSchemaToTs.ts
function jsonSchemaToTsType(schema) {
  if (!schema || typeof schema !== "object") return "unknown";
  const t = schema.type;
  if (t === "string") return "string";
  if (t === "number" || t === "integer") return "number";
  if (t === "boolean") return "boolean";
  if (t === "null") return "null";
  if (t === "array") {
    return `${jsonSchemaToTsType(schema.items)}[]`;
  }
  if (t === "object" || schema.properties) {
    return "Record<string, unknown>";
  }
  if (Array.isArray(schema.anyOf)) return "unknown";
  if (Array.isArray(schema.oneOf)) return "unknown";
  return "unknown";
}
function jsonSchemaToTsInterface(name, schema) {
  if (!schema || typeof schema !== "object") {
    return `export type ${name} = unknown;
`;
  }
  const isObject = schema.type === "object" || schema.properties;
  if (!isObject) {
    return `export type ${name} = ${jsonSchemaToTsType(schema)};
`;
  }
  const props = schema.properties ?? {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const lines = [];
  lines.push(`export interface ${name} {`);
  for (const key of Object.keys(props)) {
    const optional = required.includes(key) ? "" : "?";
    lines.push(`  ${safeProp(key)}${optional}: ${jsonSchemaToTsType(props[key])};`);
  }
  lines.push(`}`);
  lines.push("");
  return lines.join("\n") + "\n";
}
function safeProp(key) {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

// src/codegen/ts/generateServer.ts
async function generateServerTs(args) {
  const serverDir = path3.join(args.outDir, "servers", args.serverSlug);
  const toolsDir = path3.join(serverDir, "tools");
  await fs3.mkdir(toolsDir, { recursive: true });
  const usedNames = /* @__PURE__ */ new Map();
  const exports = [];
  for (const tool of args.snapshot.tools) {
    const baseFn = toCamelCase(tool.name);
    const n = usedNames.get(baseFn) ?? 0;
    usedNames.set(baseFn, n + 1);
    const fnName = n === 0 ? baseFn : `${baseFn}__${n + 1}`;
    const inputTypeName = `${toPascalCase(fnName)}Input`;
    const outputTypeName = `${toPascalCase(fnName)}Output`;
    const fileName = `${fnName}.ts`;
    const filePath = path3.join(toolsDir, fileName);
    const jsdocLines = [];
    jsdocLines.push("/**");
    if (tool.description) jsdocLines.push(` * ${escapeJSDoc(tool.description)}`);
    jsdocLines.push(" *");
    jsdocLines.push(` * MCP server: \`${escapeJSDoc(args.registryId)}\``);
    jsdocLines.push(` * MCP tool: \`${escapeJSDoc(tool.name)}\``);
    jsdocLines.push(` * @param input Tool input`);
    jsdocLines.push(` * @returns Tool output`);
    jsdocLines.push(" */");
    const ts = [
      `import { callMcpTool } from "mcp-toolbox-runtime";`,
      ``,
      `// Generated by mcp-toolbox. Do not edit by hand.`,
      ``,
      jsonSchemaToTsInterface(inputTypeName, tool.inputSchema),
      `export type ${outputTypeName} = unknown;`,
      ``,
      ...jsdocLines,
      `export async function ${fnName}(input: ${inputTypeName}): Promise<${outputTypeName}> {`,
      `  return await callMcpTool<${outputTypeName}>({`,
      `    registryId: ${JSON.stringify(args.registryId)},`,
      `    toolName: ${JSON.stringify(tool.name)},`,
      `    input,`,
      `  });`,
      `}`,
      ``
    ].join("\n");
    await fs3.writeFile(filePath, ts, "utf-8");
    exports.push(`export * from "./tools/${fnName}";`);
  }
  const indexTs = [
    `// Generated by mcp-toolbox. Do not edit by hand.`,
    `// registryId: ${args.registryId}`,
    ``,
    ...exports,
    ``
  ].join("\n");
  await fs3.writeFile(path3.join(serverDir, "index.ts"), indexTs, "utf-8");
}
function escapeJSDoc(s) {
  return s.replaceAll("*/", "*\\/");
}

// src/codegen/catalog.ts
import fs4 from "fs/promises";
import path4 from "path";
async function writeCatalog(args) {
  const catalog = {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    servers: args.entries.map((e) => ({
      serverSlug: e.serverSlug,
      registryId: e.registryId,
      version: e.snapshot.version,
      tools: e.snapshot.tools.map((t) => ({ name: t.name, description: t.description }))
    }))
  };
  await fs4.mkdir(args.outDir, { recursive: true });
  await fs4.writeFile(path4.join(args.outDir, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n", "utf-8");
}

// src/codegen/readme.ts
import fs5 from "fs/promises";
import path5 from "path";
async function writeToolboxReadme(outDir) {
  const contents = `# MCP Toolbox

This repo includes a generated integration SDK under \`./toolbox\`.

## How to discover tools

- Browse available servers: \`toolbox/servers/\`
- Search by name/description: \`toolbox/catalog.json\`

## How to use in code

Each server is a module:

\`\`\`ts
import * as github from "./toolbox/servers/io-github-yourorg-yourserver";
\`\`\`

Each tool is a function exported from that module. Prefer importing and calling these wrappers rather than describing raw MCP tool calls in text.

## Regenerating

\`\`\`bash
npx mcp-toolbox sync
\`\`\`
`;
  await fs5.mkdir(outDir, { recursive: true });
  await fs5.writeFile(path5.join(outDir, "README.md"), contents, "utf-8");
}

// src/commands/sync.ts
function syncCommand() {
  const cmd = new Command6("sync").description("Introspect servers, snapshot schemas, and regenerate wrappers").option("--config <path>", "Path to config file", defaultConfigPath5()).option("--yes", "Run non-interactively (accept breaking changes)", false).option("--check", "Fail if upstream changed but code not regenerated", false).option("--json", "Output machine-readable JSON", false).option("--no-format", "Skip formatting generated output with oxfmt").action(async (opts) => {
    const configPath = opts.config;
    const nonInteractive = Boolean(opts.yes);
    const checkOnly = Boolean(opts.check);
    const shouldFormat = Boolean(opts.format);
    if (!await fileExists3(configPath)) {
      throw new Error(`Config file not found at ${configPath}. Run 'mcp-toolbox init' first.`);
    }
    const config = await loadToolboxConfig3(configPath);
    const outDir = config.generation.outDir || "toolbox";
    const entriesForCatalog = [];
    const results = [];
    let anyOutOfSync = false;
    for (const serverCfg of config.servers) {
      const serverSlug = slugifyServerName(serverCfg.registryId);
      const baseDir = path6.join(outDir, ".snapshots", serverSlug);
      const latestJsonPath = path6.join(baseDir, "latest.json");
      const latestMetaPath = path6.join(baseDir, "latest.meta.json");
      const oldSnap = await readJsonIfExists(latestJsonPath);
      const oldMeta = await readJsonIfExists(latestMetaPath);
      const s = spinner4();
      s.start(`Introspecting ${serverCfg.registryId}...`);
      const newSnap = await introspectServer({
        serverConfig: serverCfg,
        allowStdioExec: config.security.allowStdioExec
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
      if (oldSnap) {
        const diff = diffSnapshots(oldSnap, newSnap);
        if (diff.changes.length > 0) {
          const report = renderDiffReport({
            registryId: serverCfg.registryId,
            oldVersion: oldSnap.version,
            newVersion: newSnap.version,
            diff
          });
          const reportsDir = path6.join(outDir, ".reports", serverSlug);
          await fs6.mkdir(reportsDir, { recursive: true });
          const reportName = `${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.md`;
          await fs6.writeFile(path6.join(reportsDir, reportName), report, "utf-8");
          if (diff.breaking && !nonInteractive) {
            const ok = await confirm2({
              message: `Breaking changes detected for ${serverCfg.registryId}. Continue and regenerate?`,
              initialValue: false
            });
            if (isCancel3(ok) || !ok) {
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
        introspected: newSnap
      });
      await generateServerTs({
        outDir,
        serverSlug,
        registryId: serverCfg.registryId,
        snapshot: newSnap
      });
      entriesForCatalog.push({ serverSlug, registryId: serverCfg.registryId, snapshot: newSnap });
      results.push({
        registryId: serverCfg.registryId,
        serverSlug,
        schemaFingerprint: written.schemaFingerprint,
        changed
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
async function readJsonIfExists(filePath) {
  try {
    const txt = await fs6.readFile(filePath, "utf-8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
}
function fingerprintFromTools(snap) {
  return fingerprint({ serverName: snap.serverName, version: snap.version, tools: snap.tools });
}
async function tryFormatWithOxfmt(targetDir) {
  const localBin = path6.join(process.cwd(), "node_modules", ".bin", "oxfmt");
  const cmd = await fileExists3(localBin).then((ok) => ok ? localBin : "npx");
  const args = cmd === "npx" ? ["--no-install", "oxfmt", "--write", targetDir] : ["--write", targetDir];
  await spawnAndWait(cmd, args);
}
async function spawnAndWait(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

// src/cli.ts
async function runCli(argv) {
  const program = new Command7().name("mcp-toolbox").description(
    "Generate repo-committed code wrappers for MCP servers to enable token-efficient tool use."
  ).version("0.0.1");
  program.hook("preAction", async () => {
    intro("mcp-toolbox");
  }).hook("postAction", async () => {
    outro2("Done.");
  });
  program.addCommand(initCommand());
  program.addCommand(registryCommand());
  program.addCommand(addCommand());
  program.addCommand(removeCommand());
  program.addCommand(introspectCommand());
  program.addCommand(syncCommand());
  await program.parseAsync(argv);
}

// src/bin.ts
await runCli(process.argv);
