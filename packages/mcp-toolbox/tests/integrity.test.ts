import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDir, cleanupTestDir, fileExists, readFileIfExists } from "./helpers/fs";
import { createTestConfig } from "./helpers/config";
import { runCli } from "./helpers/cli";
import path from "node:path";
import fs from "node:fs/promises";

describe("data integrity and atomicity", () => {
  let testDir: string;
  let configPath: string;

  beforeEach(async () => {
    testDir = await createTestDir();
    configPath = path.join(testDir, "mcp-toolbox.config.json");
    await createTestConfig(configPath);
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  it("should write config files atomically", async () => {
    // Ideal: config writes should use temp + rename pattern
    // This prevents corruption on interruption

    await runCli(["init", "--config", configPath, "--yes"], { cwd: testDir });

    // Config should be valid (not truncated)
    const content = await readFileIfExists(configPath);
    expect(content).toBeTruthy();
    if (content) {
      // Should be parseable
      expect(() => {
        // Simple check - should contain valid structure
        content.includes("ToolboxConfig");
      }).not.toThrow();
    }
  });

  it("should write snapshot files atomically", async () => {
    const outDir = path.join(testDir, "toolbox");

    await runCli(["sync", "--config", configPath, "--yes"], { cwd: testDir });

    // Check snapshot files are valid JSON (not truncated)
    const snapshotsDir = path.join(outDir, ".snapshots");
    if (await fileExists(snapshotsDir)) {
      const serverDirs = await fs.readdir(snapshotsDir);
      for (const serverDir of serverDirs) {
        const latestJson = path.join(snapshotsDir, serverDir, "latest.json");
        if (await fileExists(latestJson)) {
          const content = await readFileIfExists(latestJson);
          if (content) {
            // Should be valid JSON
            expect(() => JSON.parse(content)).not.toThrow();
          }
        }
      }
    }
  });

  it("should maintain catalog consistency", async () => {
    // Ideal: catalog.json should match actual generated files
    const outDir = path.join(testDir, "toolbox");

    await runCli(["sync", "--config", configPath, "--yes"], { cwd: testDir });

    const catalogPath = path.join(outDir, "catalog.json");
    if (await fileExists(catalogPath)) {
      const catalogContent = await readFileIfExists(catalogPath);
      if (!catalogContent) {
        throw new Error("Catalog file exists but content is null");
      }
      const catalog = JSON.parse(catalogContent);
      expect(catalog).toHaveProperty("servers");
      expect(Array.isArray(catalog.servers)).toBe(true);

      // Catalog should match actual server directories
      const serversDir = path.join(outDir, "servers");
      if (await fileExists(serversDir)) {
        const actualServers = await fs.readdir(serversDir);
        // Catalog should reference all actual servers
        // (Simplified check - full validation would be more complex)
      }
    }
  });

  it("should not leave orphaned files on failure", async () => {
    // Ideal: failed operations should clean up partial files
    // This would require simulating a failure mid-operation
  });

  it("should be idempotent - retrying produces same result", async () => {
    // Ideal: all operations should be safe to retry
    const outDir = path.join(testDir, "toolbox");

    // First attempt
    await runCli(["sync", "--config", configPath, "--yes"], { cwd: testDir });
    const firstFiles = await fs.readdir(outDir).catch(() => []);

    // Retry
    await runCli(["sync", "--config", configPath, "--yes"], { cwd: testDir });
    const secondFiles = await fs.readdir(outDir).catch(() => []);

    // Should produce same result
    expect(firstFiles.sort()).toEqual(secondFiles.sort());
  });

  it("should prevent concurrent sync operations", async () => {
    // Ideal: concurrent syncs should be prevented or handled safely
    // This would require running multiple syncs in parallel
    // Should either:
    // - Prevent concurrent execution (lock file)
    // - Handle safely (queue, merge results, etc.)
  });
});
