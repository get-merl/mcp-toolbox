import { describe, it, expect, afterEach } from "vitest";
import {
  getOrCreatePool,
  closePool,
  closeAllPools,
  getPoolStats,
  hasPool,
} from "../src/connectionPool.js";
import type { PooledClient } from "../src/connectionPool.js";

// Mock client and transport for testing
function createMockClient(): PooledClient {
  return {
    client: {
      callTool: async () => ({ content: [] }),
    } as any,
    transport: {
      close: async () => {},
    } as any,
  };
}

describe("connectionPool", () => {
  afterEach(async () => {
    await closeAllPools();
  });

  describe("getOrCreatePool", () => {
    it("should create a new pool for a server", async () => {
      const pool = getOrCreatePool("test-server", async () =>
        createMockClient()
      );
      expect(pool).toBeDefined();
      expect(hasPool("test-server")).toBe(true);
    });

    it("should return the same pool for the same server name", async () => {
      const pool1 = getOrCreatePool("test-server", async () =>
        createMockClient()
      );
      const pool2 = getOrCreatePool("test-server", async () =>
        createMockClient()
      );
      expect(pool1).toBe(pool2);
    });

    it("should create different pools for different servers", async () => {
      const pool1 = getOrCreatePool("server-1", async () => createMockClient());
      const pool2 = getOrCreatePool("server-2", async () => createMockClient());
      expect(pool1).not.toBe(pool2);
      expect(hasPool("server-1")).toBe(true);
      expect(hasPool("server-2")).toBe(true);
    });
  });

  describe("pool operations", () => {
    it("should acquire and release resources", async () => {
      const pool = getOrCreatePool("test-server", async () =>
        createMockClient()
      );

      const resource = await pool.acquire();
      expect(resource).toBeDefined();
      expect(resource.client).toBeDefined();
      expect(resource.transport).toBeDefined();

      pool.release(resource);
    });

    it("should call factory only once for single acquisition", async () => {
      let factoryCalls = 0;
      const pool = getOrCreatePool("test-server", async () => {
        factoryCalls++;
        return createMockClient();
      });

      await pool.acquire().then((r) => pool.release(r));
      await pool.acquire().then((r) => pool.release(r));

      // With max=1 and proper release, factory should be called once
      expect(factoryCalls).toBe(1);
    });
  });

  describe("closePool", () => {
    it("should close and remove a specific pool", async () => {
      getOrCreatePool("test-server", async () => createMockClient());
      expect(hasPool("test-server")).toBe(true);

      await closePool("test-server");
      expect(hasPool("test-server")).toBe(false);
    });

    it("should handle closing non-existent pool gracefully", async () => {
      await expect(closePool("non-existent")).resolves.toBeUndefined();
    });
  });

  describe("closeAllPools", () => {
    it("should close all pools", async () => {
      getOrCreatePool("server-1", async () => createMockClient());
      getOrCreatePool("server-2", async () => createMockClient());
      getOrCreatePool("server-3", async () => createMockClient());

      expect(hasPool("server-1")).toBe(true);
      expect(hasPool("server-2")).toBe(true);
      expect(hasPool("server-3")).toBe(true);

      await closeAllPools();

      expect(hasPool("server-1")).toBe(false);
      expect(hasPool("server-2")).toBe(false);
      expect(hasPool("server-3")).toBe(false);
    });
  });

  describe("getPoolStats", () => {
    it("should return stats for all pools", async () => {
      getOrCreatePool("server-1", async () => createMockClient());
      getOrCreatePool("server-2", async () => createMockClient());

      const stats = getPoolStats();
      expect(stats).toHaveLength(2);
      expect(stats.map((s) => s.serverName)).toContain("server-1");
      expect(stats.map((s) => s.serverName)).toContain("server-2");
    });

    it("should return empty array when no pools exist", async () => {
      const stats = getPoolStats();
      expect(stats).toHaveLength(0);
    });

    it("should return correct pool metrics", async () => {
      const pool = getOrCreatePool("test-server", async () =>
        createMockClient()
      );

      // Acquire a resource
      const resource = await pool.acquire();

      const stats = getPoolStats();
      expect(stats).toHaveLength(1);
      expect(stats[0].serverName).toBe("test-server");
      expect(stats[0].size).toBe(1);

      pool.release(resource);
    });
  });
});
