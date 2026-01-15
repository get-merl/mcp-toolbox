import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ToolboxConfig } from "./config.js";
import { defaultConfigPath } from "./paths.js";
import { loadToolboxConfig, fileExists } from "./loadConfig.js";
import { buildStdioEnv } from "./env.js";

type CallArgs = { serverName: string; toolName: string; input: unknown };

const clientCache = new Map<string, { client: Client; transport: Transport }>();

export async function callMcpTool<T = unknown>(args: CallArgs): Promise<T> {
  const config = await loadConfigForRuntime();
  const serverCfg = config.servers.find((s) => s.name === args.serverName);
  if (!serverCfg)
    throw new Error(`mcp-toolbox: server not configured: ${args.serverName}`);

  const cacheKey = args.serverName;
  let cached = clientCache.get(cacheKey);
  if (!cached) {
    const transport = await chooseTransportRuntime(config, serverCfg);
    const client = new Client({
      name: config.client?.name || "mcp-toolbox-runtime",
      version: config.client?.version || "0.1.0",
    });
    await client.connect(transport);
    cached = { client, transport };
    clientCache.set(cacheKey, cached);
  }

  const res = await cached.client.callTool({
    name: args.toolName,
    arguments: args.input as any,
  } as any);
  return res as unknown as T;
}

async function loadConfigForRuntime(): Promise<ToolboxConfig> {
  const explicit = process.env["MCP_TOOLBOX_CONFIG"];
  const configPath = explicit ? explicit : defaultConfigPath();
  if (!(await fileExists(configPath))) {
    throw new Error(
      `mcp-toolbox: config not found at ${configPath}. Set MCP_TOOLBOX_CONFIG or create mcp-toolbox.config.json`
    );
  }
  return await loadToolboxConfig(configPath);
}

async function chooseTransportRuntime(
  config: ToolboxConfig,
  serverCfg: ToolboxConfig["servers"][number]
) {
  if (serverCfg.transport.type === "http") {
    // Note: StreamableHTTPClientTransport doesn't support headers in options
    // Headers would need to be handled via authProvider or other mechanisms
    return new StreamableHTTPClientTransport(new URL(serverCfg.transport.url));
  }

  if (serverCfg.transport.type === "stdio") {
    if (!config.security.allowStdioExec) {
      throw new Error(
        `mcp-toolbox: stdio disabled (security.allowStdioExec=false) for ${serverCfg.name}`
      );
    }
    const stdioTransport = serverCfg.transport;
    const env = buildStdioEnv({
      allowlist: config.security.envAllowlist,
      baseEnv: process.env,
      transportEnv: stdioTransport.env,
    });
    return new StdioClientTransport({
      command: serverCfg.transport.command,
      args: serverCfg.transport.args ?? [],
      env,
      // Suppress stderr from child process to keep UI clean
      stderr: "ignore",
    });
  }

  throw new Error(`mcp-toolbox: unknown transport type for ${serverCfg.name}`);
}

// Export types for users
export type { ToolboxConfig, ToolboxServerConfig } from "./config.js";

// Export shared utilities used by CLI
export { defaultConfigPath, defaultOutDir, resolveFromCwd } from "./paths.js";
export { loadToolboxConfig, fileExists } from "./loadConfig.js";
export { buildStdioEnv } from "./env.js";
