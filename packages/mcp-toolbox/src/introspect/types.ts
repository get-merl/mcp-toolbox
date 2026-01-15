export type McpToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
};

export type McpToolsListResult = {
  tools: McpToolDefinition[];
};

export type IntrospectedServer = {
  serverName: string;
  version: string; // 'latest' or exact version string from registry
  retrievedAt: string; // ISO
  transport: {
    kind: "streamable-http" | "sse" | "stdio";
    url?: string;
    command?: string;
    args?: string[];
  };
  tools: McpToolDefinition[];
};

