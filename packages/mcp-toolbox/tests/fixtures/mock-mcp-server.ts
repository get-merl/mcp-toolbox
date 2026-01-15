import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type {
  CallToolResult,
  ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { McpToolDefinition } from "@/introspect/types";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

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
  private transport: Transport | null = null;
  private config: MockServerConfig;

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
    (this.server.setRequestHandler as any)(
      "tools/list",
      async (): Promise<ListToolsResult> => {
        if (this.config.simulateFailures?.listTools) {
          throw new Error("Simulated listTools failure");
        }

        if (this.config.responseDelay) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.responseDelay)
          );
        }

        if (this.config.simulateFailures?.timeout) {
          await new Promise(() => {}); // Hang forever
        }

        return {
          tools: this.config.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            inputSchema: (tool.inputSchema as any) ?? {
              type: "object",
              properties: {},
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            outputSchema: tool.outputSchema as any,
          })),
        };
      }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.server.setRequestHandler as any)(
      "tools/call",
      async (request: any): Promise<CallToolResult> => {
        if (this.config.simulateFailures?.callTool) {
          throw new Error("Simulated callTool failure");
        }

        if (this.config.responseDelay) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.responseDelay)
          );
        }

        const tool = this.config.tools.find(
          (t) => t.name === request.params.name
        );
        if (!tool) {
          throw new Error(`Tool not found: ${request.params.name}`);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                result: "success",
                tool: request.params.name,
                args: request.params.arguments,
              }),
            },
          ],
        };
      }
    );
  }

  async startStdio(): Promise<{ command: string; args: string[] }> {
    this.transport = new StdioServerTransport();
    await this.server.connect(this.transport);
    return { command: "node", args: [] };
  }

  async stop(): Promise<void> {
    if (this.transport) {
      await (this.transport as any).close?.();
      this.transport = null;
    }
  }

  updateTools(tools: McpToolDefinition[]): void {
    this.config.tools = tools;
  }

  updateConfig(config: Partial<MockServerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Create an in-memory server pair for fast in-process testing.
 * Returns both server and client transports linked together.
 */
export function createInMemoryServerPair(
  config: MockServerConfig = { tools: [] }
) {
  const server = new Server(
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

  // Setup handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.setRequestHandler as any)(
    "tools/list",
    async (): Promise<ListToolsResult> => {
      if (config.simulateFailures?.listTools) {
        throw new Error("Simulated listTools failure");
      }

      if (config.responseDelay) {
        await new Promise((resolve) =>
          setTimeout(resolve, config.responseDelay)
        );
      }

      return {
        tools: config.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          inputSchema: (tool.inputSchema as any) ?? {
            type: "object",
            properties: {},
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          outputSchema: tool.outputSchema as any,
        })),
      };
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.setRequestHandler as any)(
    "tools/call",
    async (request: any): Promise<CallToolResult> => {
      if (config.simulateFailures?.callTool) {
        throw new Error("Simulated callTool failure");
      }

      if (config.responseDelay) {
        await new Promise((resolve) =>
          setTimeout(resolve, config.responseDelay)
        );
      }

      const tool = config.tools.find((t) => t.name === request.params.name);
      if (!tool) {
        throw new Error(`Tool not found: ${request.params.name}`);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              result: "success",
              tool: request.params.name,
              args: request.params.arguments,
            }),
          },
        ],
      };
    }
  );

  // Create linked transport pair
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  return {
    server,
    serverTransport,
    clientTransport,
    async start() {
      await server.connect(serverTransport);
    },
    async stop() {
      await server.close();
    },
  };
}

/**
 * Default mock tools for testing
 */
export const defaultMockTools: McpToolDefinition[] = [
  {
    name: "echo",
    description: "Echo back the input",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Message to echo" },
      },
      required: ["message"],
    },
  },
  {
    name: "add",
    description: "Add two numbers",
    inputSchema: {
      type: "object",
      properties: {
        a: { type: "number", description: "First number" },
        b: { type: "number", description: "Second number" },
      },
      required: ["a", "b"],
    },
    outputSchema: {
      type: "object",
      properties: {
        result: { type: "number" },
      },
    },
  },
];
