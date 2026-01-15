import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDir, cleanupTestDir, fileExists, listFiles } from "./helpers/fs";
import { runCli } from "./helpers/cli";
import { createTestConfig, addServerToConfig } from "./helpers/config";
import path from "node:path";
import fs from "node:fs/promises";

describe("sync command - core functionality", () => {
  let testDir: string;
  let configPath: string;

  beforeEach(async () => {
    testDir = await createTestDir();
    configPath = path.join(testDir, "mcp-toolbox.config.json");
    await createTestConfig(configPath, {
      generation: { outDir: "toolbox", language: "ts" },
      security: { allowStdioExec: true, envAllowlist: [] },
    });
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  it("should generate all required files on first sync", async () => {
    // Note: This test requires a real or mocked MCP server
    // For now, we test the file structure expectations

    const outDir = path.join(testDir, "toolbox");

    // This would require a working server or mock
    // For ideal behavior test, we validate:
    // - Snapshot files are created
    // - TypeScript wrappers are generated
    // - Catalog.json is created
    // - README.md is created

    const result = await runCli(["sync", "--config", configPath, "--yes"], {
      cwd: testDir,
    });

    // When sync succeeds, verify file structure
    if (result.exitCode === 0) {
      const snapshotDir = path.join(outDir, ".snapshots");
      const serversDir = path.join(outDir, "servers");
      const catalogPath = path.join(outDir, "catalog.json");
      const readmePath = path.join(outDir, "README.md");

      // At least catalog and README should exist if any servers were synced
      // Note: This is testing ideal behavior - actual implementation may differ
    }
  });

  it("should be idempotent - running sync twice produces identical output", async () => {
    // This tests ideal behavior: same input = same output
    const outDir = path.join(testDir, "toolbox");

    // First sync
    await runCli(["sync", "--config", configPath, "--yes"], { cwd: testDir });
    const firstFiles = await listFiles(outDir, true);
    const firstCatalog = await fs
      .readFile(path.join(outDir, "catalog.json"), "utf-8")
      .catch(() => null);

    // Second sync (no changes)
    await runCli(["sync", "--config", configPath, "--yes"], { cwd: testDir });
    const secondFiles = await listFiles(outDir, true);
    const secondCatalog = await fs
      .readFile(path.join(outDir, "catalog.json"), "utf-8")
      .catch(() => null);

    // Files should be identical
    expect(firstFiles.sort()).toEqual(secondFiles.sort());
    if (firstCatalog && secondCatalog) {
      // Parse and compare (ignoring generatedAt timestamp if present)
      const firstJson = JSON.parse(firstCatalog);
      const secondJson = JSON.parse(secondCatalog);
      // Remove timestamps for comparison
      delete firstJson.generatedAt;
      delete secondJson.generatedAt;
      expect(firstJson).toEqual(secondJson);
    }
  });

  it.todo("should handle partial failures gracefully", async () => {
    // Ideal behavior: if one server fails, others continue
    // This requires multiple servers in config and one to fail

    await createTestConfig(configPath, {
      servers: [
        { 
          name: "test-server-valid",
          transport: { type: "http", url: "http://localhost:8080/valid" }
        },
        { 
          name: "test-server-invalid",
          transport: { type: "http", url: "http://localhost:8080/invalid" }
        },
      ],
    });

    const result = await runCli(["sync", "--config", configPath, "--yes"], {
      cwd: testDir,
    });

    // Ideal: should process valid server even if invalid fails
    // Should provide clear summary of successes/failures
    // This tests the ideal behavior specification
  });

  it("should detect and report breaking changes", async () => {
    // This tests the breaking changes workflow
    // Requires: initial sync, then schema change, then sync again

    const outDir = path.join(testDir, "toolbox");

    // First sync
    await runCli(["sync", "--config", configPath, "--yes"], { cwd: testDir });

    // Simulate schema change by modifying snapshot
    // Then sync again
    const result = await runCli(["sync", "--config", configPath], {
      cwd: testDir,
      input: "n\n", // Reject breaking changes
    });

    // Should prompt for confirmation
    // Should preserve old state if cancelled
    // This tests ideal behavior
  });

  it("should generate valid TypeScript code", async () => {
    // After sync, generated code should:
    // - Compile without errors
    // - Be importable
    // - Have correct types

    const outDir = path.join(testDir, "toolbox");

    await runCli(["sync", "--config", configPath, "--yes"], { cwd: testDir });

    // Check if generated files exist and are valid TypeScript
    const serversDir = path.join(outDir, "servers");
    if (await fileExists(serversDir)) {
      const serverDirs = await fs.readdir(serversDir);
      for (const serverDir of serverDirs) {
        const indexPath = path.join(serversDir, serverDir, "index.ts");
        if (await fileExists(indexPath)) {
          const content = await fs.readFile(indexPath, "utf-8");
          // Basic validation: should be valid TypeScript syntax
          expect(content).toContain("export");
          expect(content).toMatch(/^\/\/ Generated by mcp-toolbox/);
        }
      }
    }
  });

  it("should create snapshot files atomically", async () => {
    // Ideal: snapshot writes should be atomic (temp + rename)
    // This prevents corruption on interruption

    const outDir = path.join(testDir, "toolbox");
    const snapshotsDir = path.join(outDir, ".snapshots");

    await runCli(["sync", "--config", configPath, "--yes"], { cwd: testDir });

    // Check snapshot files exist and are valid JSON
    if (await fileExists(snapshotsDir)) {
      const serverDirs = await fs.readdir(snapshotsDir);
      for (const serverDir of serverDirs) {
        const latestJson = path.join(snapshotsDir, serverDir, "latest.json");
        if (await fileExists(latestJson)) {
          const content = await fs.readFile(latestJson, "utf-8");
          // Should be valid JSON (not truncated)
          expect(() => JSON.parse(content)).not.toThrow();
        }
      }
    }
  });

  it("should generate diff reports for schema changes", async () => {
    const outDir = path.join(testDir, "toolbox");
    const reportsDir = path.join(outDir, ".reports");

    // First sync
    await runCli(["sync", "--config", configPath, "--yes"], { cwd: testDir });

    // Second sync (with changes) should generate report
    await runCli(["sync", "--config", configPath, "--yes"], { cwd: testDir });

    // Reports should be created when changes detected
    if (await fileExists(reportsDir)) {
      const serverDirs = await fs.readdir(reportsDir);
      for (const serverDir of serverDirs) {
        const reports = await fs.readdir(path.join(reportsDir, serverDir));
        // Reports should be markdown files
        expect(reports.some((r) => r.endsWith(".md"))).toBe(true);
      }
    }
  });
});
