import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ToolboxServerConfig } from "mcp-toolbox-runtime";
import { RegistryClient } from "mcp-toolbox-runtime";
import type { IntrospectedServer, McpToolDefinition } from "./types";

export async function introspectServer(args: {
  serverConfig: ToolboxServerConfig;
  allowStdioExec: boolean;
}): Promise<IntrospectedServer> {
  const registry = new RegistryClient();
  const serverName = args.serverConfig.registryId;

  // We always introspect "latest" for MVP.
  const registryRes = await registry.getServerVersion({
    serverName,
    version: "latest",
  });

  const transport = await chooseTransport({
    serverConfig: args.serverConfig,
    allowStdioExec: args.allowStdioExec,
    registryServerJson: registryRes.server as any,
  });

  const client = new Client({ name: "mcp-toolbox", version: "0.0.1" });

  try {
    await client.connect(transport);
    const toolsResult = await client.listTools();
    const tools: McpToolDefinition[] = (toolsResult.tools ?? []).map((t: any) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));

    return {
      serverName,
      version: registryRes.server.version ?? "latest",
      retrievedAt: new Date().toISOString(),
      transport: describeTransport(transport),
      tools,
    };
  } finally {
    await safeCloseTransport(transport);
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

function describeTransport(transport: Transport): IntrospectedServer["transport"] {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registryServerJson: any;
}): Promise<Transport> {
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
      env: overrideRun.env,
    });
  }

  // Try registry-provided remotes (recommended).
  const remotes: Array<{ type: string; url?: string; variables?: unknown }> =
    args.registryServerJson?.remotes ?? [];
  const streamable = remotes.find((r) => r.type === "streamable-http" && r.url);
  if (streamable?.url) {
    if (streamable.variables && Object.keys(streamable.variables).length > 0) {
      throw new Error(
        `Remote transport for '${args.serverConfig.registryId}' requires variables; set overrides.http.url instead.`
      );
    }
    return new StreamableHTTPClientTransport(new URL(streamable.url), {});
  }

  // Legacy SSE remote (deprecated but present for some servers).
  const sse = remotes.find((r) => r.type === "sse" && r.url);
  if (sse?.url) {
    // The SDK has SSEClientTransport, but we’ll avoid depending on deprecated paths for MVP.
    throw new Error(
      `Server '${args.serverConfig.registryId}' only advertises legacy SSE. Provide overrides.http.url or overrides.run to introspect.`
    );
  }

  // Try registry-provided packages (common for stdio/npm-distributed servers).
  const packages: Array<{
    registryType?: string;
    identifier?: string;
    version?: string;
    transport?: { type?: string };
    environmentVariables?: Array<{ name?: string; isRequired?: boolean }>;
  }> = args.registryServerJson?.packages ?? [];

  const npmStdio = packages.find(
    (p) => p.registryType === "npm" && p.transport?.type === "stdio" && p.identifier
  );

  if (npmStdio?.identifier) {
    if (!args.allowStdioExec) {
      throw new Error(
        `Refusing to run stdio server '${args.serverConfig.registryId}' because security.allowStdioExec=false`
      );
    }

    const pkgVersion =
      npmStdio.version && npmStdio.version !== "latest"
        ? `${npmStdio.identifier}@${npmStdio.version}`
        : npmStdio.identifier;

    // Best-effort env defaults for common servers.
    const env: Record<string, string> = Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => typeof v === "string")
    ) as Record<string, string>;
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
      env,
    });
  }

  throw new Error(
    `No runnable transport found for '${args.serverConfig.registryId}'. Provide overrides.run (stdio) or overrides.http.url.`
  );
}

