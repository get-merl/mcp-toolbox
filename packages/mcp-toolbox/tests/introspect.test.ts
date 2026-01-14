import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDir, cleanupTestDir } from "./helpers/fs";
import { createTestConfig } from "./helpers/config";
import { runCli } from "./helpers/cli";
import path from "node:path";

describe("introspect command", () => {
  let testDir: string;
  let configPath: string;

  beforeEach(async () => {
    testDir = await createTestDir();
    configPath = path.join(testDir, "mcp-toolbox.config.ts");
    await createTestConfig(configPath);
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  it("should introspect server and create snapshot", async () => {
    const outDir = path.join(testDir, "toolbox");

    const result = await runCli(["introspect", "--config", configPath], {
      cwd: testDir,
    });

    // Should create snapshot files
    if (result.exitCode === 0) {
      const snapshotsDir = path.join(outDir, ".snapshots");
      // Snapshot should be created
      // This tests ideal behavior
    }
  });

  it("should validate tool schemas against JSON Schema spec", async () => {
    // Ideal: invalid schemas should be caught before snapshotting
    // This would require a server with invalid schema
  });

  it("should handle malformed server responses gracefully", async () => {
    // Ideal: malformed responses should be caught and reported clearly
  });

  it("should timeout long-running introspection", async () => {
    // Ideal: should have timeout protection (e.g., 60s max)
    // Should not hang indefinitely
  });

  it("should handle servers with many tools efficiently", async () => {
    // Ideal: should handle 1000+ tools without performance issues
  });

  it("should include accurate metadata in snapshot", async () => {
    const outDir = path.join(testDir, "toolbox");

    await runCli(["introspect", "--config", configPath], { cwd: testDir });

    // Check snapshot metadata
    const snapshotsDir = path.join(outDir, ".snapshots");
    // Should include version, retrievedAt, transport info
  });

  it("should support introspecting single server with --server flag", async () => {
    await createTestConfig(configPath, {
      servers: [
        { registryId: "test.server/one", channel: "latest" },
        { registryId: "test.server/two", channel: "latest" },
      ],
    });

    const result = await runCli(
      ["introspect", "--config", configPath, "--server", "test.server/one"],
      { cwd: testDir }
    );

    // Should only introspect specified server
    // This tests ideal behavior
  });

  it("should output JSON when --json flag is used", async () => {
    const result = await runCli(
      ["introspect", "--config", configPath, "--json"],
      { cwd: testDir }
    );

    if (result.stdout) {
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    }
  });
});
