import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { CallToolResult, ListToolsResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpToolDefinition } from "@/introspect/types";

export type MockServerConfig = {
  tools: McpToolDefinition[];
  version?: string;
  simulateFailures?: {
    listTools?: boolean;
    callTool?: boolean;
    networkError?: boolean;
    timeout?: boolean;
  };
  responseDelay?: number;
};

export class MockMcpServer {
  private server: Server;
  private transport: StdioServerTransport | SSEServerTransport | null = null;
  private config: MockServerConfig;
  private process: NodeJS.Process | null = null;

  constructor(config: MockServerConfig) {
    this.config = config;
    this.server = new Server(
      {
        name: "mock-mcp-server",
        version: config.version ?? "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.server.setRequestHandler as any)("tools/list", async (): Promise<ListToolsResult> => {
      if (this.config.simulateFailures?.listTools) {
        throw new Error("Simulated listTools failure");
      }

      if (this.config.responseDelay) {
        await new Promise((resolve) => setTimeout(resolve, this.config.responseDelay));
      }

      if (this.config.simulateFailures?.timeout) {
        await new Promise(() => {}); // Hang forever
      }

      return {
        tools: this.config.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          inputSchema: (tool.inputSchema as any) ?? { type: "object", properties: {} },
        })),
      };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.server.setRequestHandler as any)("tools/call", async (request: any): Promise<CallToolResult> => {
      if (this.config.simulateFailures?.callTool) {
        throw new Error("Simulated callTool failure");
      }

      if (this.config.responseDelay) {
        await new Promise((resolve) => setTimeout(resolve, this.config.responseDelay));
      }

      const tool = this.config.tools.find((t) => t.name === request.params.name);
      if (!tool) {
        throw new Error(`Tool not found: ${request.params.name}`);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ result: "success", tool: request.params.name }),
          },
        ],
      };
    });
  }

  async startStdio(): Promise<{ command: string; args: string[] }> {
    this.transport = new StdioServerTransport();
    await this.server.connect(this.transport);
    return { command: "node", args: [] };
  }

  async startSSE(port: number): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.transport = new (SSEServerTransport as any)({
      path: "/sse",
      port,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.server.connect(this.transport as any);
    return `http://localhost:${port}/sse`;
  }

  async stop(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    if (this.process) {
      this.process.kill(15); // SIGTERM signal code
      this.process = null;
    }
  }

  updateTools(tools: McpToolDefinition[]): void {
    this.config.tools = tools;
  }

  updateConfig(config: Partial<MockServerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
