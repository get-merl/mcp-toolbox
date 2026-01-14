import type { RegistryServerListResponse, RegistryServerResponse } from "mcp-toolbox-runtime";

export class MockRegistryServer {
  private servers: Map<string, RegistryServerResponse> = new Map();
  private listResponse: RegistryServerListResponse = {
    servers: [],
    metadata: {},
  };

  setServer(name: string, server: RegistryServerResponse): void {
    this.servers.set(name, server);
    this.updateListResponse();
  }

  getServer(name: string, version: string): RegistryServerResponse {
    const server = this.servers.get(name);
    if (!server) {
      throw new Error(`Server not found: ${name}`);
    }
    return server;
  }

  listServers(params: {
    search?: string;
    limit?: number;
    cursor?: string;
  }): RegistryServerListResponse {
    let servers = Array.from(this.listResponse.servers ?? []);

    if (params.search) {
      const searchLower = params.search.toLowerCase();
      servers = servers.filter(
        (s) =>
          s.server.name.toLowerCase().includes(searchLower) ||
          s.server.title?.toLowerCase().includes(searchLower) ||
          s.server.description?.toLowerCase().includes(searchLower)
      );
    }

    if (params.limit) {
      servers = servers.slice(0, params.limit);
    }

    return {
      servers,
      metadata: {
        ...this.listResponse.metadata,
        next_cursor: servers.length >= (params.limit ?? 30) ? "next-page" : undefined,
      },
    };
  }

  private updateListResponse(): void {
    this.listResponse = {
      servers: Array.from(this.servers.values()),
      metadata: {},
    };
  }

  simulateNetworkError(shouldError: boolean): void {
    // This would be used to simulate network failures
    // Implementation depends on how we mock fetch
  }

  simulateRateLimit(shouldRateLimit: boolean): void {
    // This would be used to simulate rate limiting
  }
}

export function createMockServerResponse(
  name: string,
  options: {
    version?: string;
    title?: string;
    description?: string;
    remotes?: Array<{ type: string; url?: string; variables?: unknown }>;
    packages?: Array<{
      registryType?: string;
      identifier?: string;
      version?: string;
      transport?: { type?: string };
      environmentVariables?: Array<{ name?: string; isRequired?: boolean }>;
    }>;
  } = {}
): RegistryServerResponse {
  return {
    _meta: {},
    server: {
      name,
      version: options.version ?? "1.0.0",
      title: options.title ?? `Mock ${name}`,
      description: options.description ?? `Description for ${name}`,
      remotes: options.remotes ?? [],
      packages: options.packages ?? [],
    },
  };
}
