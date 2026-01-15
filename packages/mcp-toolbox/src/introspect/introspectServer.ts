import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { buildStdioEnv } from "mcp-toolbox-runtime";
import type { ToolboxServerConfig } from "mcp-toolbox-runtime";
import type { IntrospectedServer, McpToolDefinition } from "./types.js";

type IntrospectionState =
  | { stage: "initializing" }
  | { stage: "creating-transport" }
  | { stage: "connecting"; transport: Transport }
  | { stage: "connected"; transport: Transport; client: Client }
  | { stage: "listing-tools"; transport: Transport; client: Client }
  | { stage: "completed"; tools: McpToolDefinition[] }
  | { stage: "error"; error: Error };

export async function introspectServer(args: {
  serverConfig: ToolboxServerConfig;
  allowStdioExec: boolean;
  envAllowlist: string[];
  clientName?: string;
  clientVersion?: string;
  onStatusUpdate?: (status: string) => void;
}): Promise<IntrospectedServer> {
  const serverName = args.serverConfig.name;
  let state: IntrospectionState = { stage: "initializing" };
  let transport: Transport | null = null;
  let client: Client | null = null;

  try {
    // Step 1: Create transport
    state = { stage: "creating-transport" };
    transport = await chooseTransport({
      serverConfig: args.serverConfig,
      allowStdioExec: args.allowStdioExec,
      envAllowlist: args.envAllowlist,
      onStatusUpdate: args.onStatusUpdate,
    });

    // Step 2: Create and connect client
    client = new Client({
      name: args.clientName || "mcp-toolbox",
      version: args.clientVersion || "0.0.1",
    });
    state = { stage: "connecting", transport };
    args.onStatusUpdate?.("Connecting...");

    try {
      await client.connect(transport);
      state = { stage: "connected", transport, client };
      args.onStatusUpdate?.("Connected");
    } catch (connectError) {
      const error = new Error(
        `Failed to connect to server '${serverName}': ${
          connectError instanceof Error
            ? connectError.message
            : String(connectError)
        }`
      );
      state = { stage: "error", error };
      throw error;
    }

    // Step 3: Call listTools with state tracking
    state = { stage: "listing-tools", transport, client };
    args.onStatusUpdate?.("Listing tools...");
    let toolsResult;
    try {
      toolsResult = await client.listTools();
    } catch (listToolsError) {
      // Analyze the error to provide better context
      const errorMessage =
        listToolsError instanceof Error
          ? listToolsError.message
          : String(listToolsError);

      // Check for connection-related errors
      if (
        errorMessage.includes("not connected") ||
        errorMessage.includes("connection") ||
        errorMessage.includes("closed") ||
        errorMessage.includes("disconnect")
      ) {
        const error = new Error(
          `Connection lost while listing tools for server '${serverName}': ${errorMessage}`
        );
        state = { stage: "error", error };
        throw error;
      }

      // Generic listTools error
      const error = new Error(
        `Failed to list tools from server '${serverName}': ${errorMessage}`
      );
      state = { stage: "error", error };
      throw error;
    }

    // Step 4: Process results
    const tools: McpToolDefinition[] = (toolsResult.tools ?? []).map(
      (t: any) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })
    );

    state = { stage: "completed", tools };
    const transportDesc = describeTransport(transport);
    return {
      serverName,
      version: "latest",
      retrievedAt: new Date().toISOString(),
      transport: transportDesc,
      tools,
    };
  } catch (error: unknown) {
    // Re-throw with context based on current state
    if (error instanceof Error) {
      throw error;
    }
    const stage = "stage" in state ? state.stage : "unknown";
    throw new Error(
      `Unexpected error introspecting server '${serverName}' at stage '${stage}': ${String(
        error
      )}`
    );
  } finally {
    // Cleanup based on state
    if (transport) {
      await safeCloseTransport(transport);
    }
  }
}

async function safeCloseTransport(transport: Transport) {
  try {
    // Transports in the SDK expose close(); keep it best-effort.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (transport as any).close?.();
  } catch {
    // ignore
  }
}

function describeTransport(
  transport: Transport
): IntrospectedServer["transport"] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t: any = transport;
  const ctorName = transport?.constructor?.name ?? "";

  if (ctorName.includes("StreamableHTTP")) {
    return { kind: "streamable-http", url: String(t?.url ?? "") };
  }
  if (ctorName.includes("SSE")) {
    return { kind: "sse", url: String(t?.url ?? "") };
  }
  return { kind: "stdio", command: t?.command, args: t?.args };
}

async function chooseTransport(args: {
  serverConfig: ToolboxServerConfig;
  allowStdioExec: boolean;
  envAllowlist: string[];
  onStatusUpdate?: (status: string) => void;
}): Promise<Transport> {
  if (args.serverConfig.transport.type === "http") {
    // Note: StreamableHTTPClientTransport doesn't support headers in options
    // Headers would need to be handled via authProvider or other mechanisms
    return new StreamableHTTPClientTransport(
      new URL(args.serverConfig.transport.url)
    );
  }

  if (args.serverConfig.transport.type === "stdio") {
    if (!args.allowStdioExec) {
      throw new Error(
        `Refusing to run stdio server '${args.serverConfig.name}' because security.allowStdioExec=false. Set security.allowStdioExec=true to enable stdio execution.`
      );
    }
    // Suppress child process output to keep UI clean
    const env = buildStdioEnv({
      allowlist: args.envAllowlist,
      baseEnv: process.env,
      transportEnv: args.serverConfig.transport.env,
      overrides: {
        // Suppress mcp-remote verbose logging
        DEBUG: "",
        NODE_ENV: process.env["NODE_ENV"] || "production",
        // Suppress npm warnings from npx
        npm_config_loglevel: "error",
        NPM_CONFIG_LOGLEVEL: "error",
        // Suppress pnpm warnings
        PNPM_LOG_LEVEL: "error",
      },
    });

    return new StdioClientTransport({
      command: args.serverConfig.transport.command,
      args: args.serverConfig.transport.args ?? [],
      env,
      // Suppress stderr from child process to keep UI clean
      stderr: "ignore",
    });
  }

  throw new Error(
    `Unknown transport type for server '${args.serverConfig.name}'`
  );
}
