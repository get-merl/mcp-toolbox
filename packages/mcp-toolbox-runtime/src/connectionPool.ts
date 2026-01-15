import { createPool, Pool } from "generic-pool";
import type { Client } from "@modelcontextprotocol/sdk/client";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export interface PooledClient {
  client: Client;
  transport: Transport;
}

// One pool per server (keyed by serverName)
const pools = new Map<string, Pool<PooledClient>>();

/**
 * Get or create a connection pool for a server.
 * @param serverName - Unique identifier for the server
 * @param factory - Function to create a new client/transport pair
 */
export function getOrCreatePool(
  serverName: string,
  factory: () => Promise<PooledClient>
): Pool<PooledClient> {
  let pool = pools.get(serverName);
  if (!pool) {
    pool = createPool<PooledClient>(
      {
        create: factory,
        destroy: async (resource) => {
          try {
            await resource.transport.close?.();
          } catch {
            // Ignore errors during cleanup
          }
        },
        validate: async (resource) => {
          // Check if connection is still alive
          // This is a best-effort check - MCP SDK doesn't expose a direct "isConnected" method
          try {
            return resource.transport !== null && resource.client !== null;
          } catch {
            return false;
          }
        },
      },
      {
        max: 1, // Single connection per server (MCP pattern)
        min: 0, // Don't pre-create connections
        idleTimeoutMillis: 30_000, // Close after 30s idle
        acquireTimeoutMillis: 10_000, // Timeout if can't connect in 10s
        evictionRunIntervalMillis: 5_000, // Check for idle connections every 5s
        testOnBorrow: true, // Validate before returning to caller
      }
    );
    pools.set(serverName, pool);
  }
  return pool;
}

/**
 * Close and remove a specific server's connection pool.
 */
export async function closePool(serverName: string): Promise<void> {
  const pool = pools.get(serverName);
  if (pool) {
    await pool.drain();
    await pool.clear();
    pools.delete(serverName);
  }
}

/**
 * Close and remove all connection pools.
 * Call this during graceful shutdown.
 */
export async function closeAllPools(): Promise<void> {
  const closePromises = Array.from(pools.keys()).map(closePool);
  await Promise.all(closePromises);
}

/**
 * Get statistics for all pools.
 */
export function getPoolStats(): {
  serverName: string;
  size: number;
  available: number;
  pending: number;
}[] {
  return Array.from(pools.entries()).map(([serverName, pool]) => ({
    serverName,
    size: pool.size,
    available: pool.available,
    pending: pool.pending,
  }));
}

/**
 * Check if a pool exists for a server.
 */
export function hasPool(serverName: string): boolean {
  return pools.has(serverName);
}
