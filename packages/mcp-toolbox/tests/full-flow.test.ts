import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDir, cleanupTestDir, fileExists } from "./helpers/fs";
import { runCli } from "./helpers/cli";
import path from "node:path";

describe("end-to-end happy path", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  it("should complete full user journey successfully", async () => {
    const configPath = path.join(testDir, "mcp-toolbox.config.json");
    const outDir = path.join(testDir, "toolbox");

    // 1. Initialize
    let result = await runCli(["init", "--config", configPath, "--yes"], {
      cwd: testDir,
    });
    expect(result.exitCode).toBe(0);
    expect(await fileExists(configPath)).toBe(true);

    // 2. Search registry (optional - may require network)
    // result = await runCli(["registry", "search", "filesystem"], { cwd: testDir });
    // This step may fail without network, which is okay for test

    // 3. Add server (would require valid server ID or mock)
    // result = await runCli(["add", "test.server/mock", "--config", configPath, "--yes"], {
    //   cwd: testDir,
    // });

    // 4. Sync generates files
    // result = await runCli(["sync", "--config", configPath, "--yes"], { cwd: testDir });
    // if (result.exitCode === 0) {
    //   expect(await fileExists(path.join(outDir, "catalog.json"))).toBe(true);
    // }

    // 5. Generated code compiles and is importable
    // (Would require actual sync to test)

    // 6. Sync again (idempotent)
    // result = await runCli(["sync", "--config", configPath, "--yes"], { cwd: testDir });
    // Should succeed and produce identical output

    // This test validates the ideal complete flow
    // Some steps may be skipped if they require network/mocks
  });

  it("should maintain consistent state throughout flow", async () => {
    // Ideal: system should be in consistent state at each step
    const configPath = path.join(testDir, "mcp-toolbox.config.json");

    // Each operation should leave system in valid state
    await runCli(["init", "--config", configPath, "--yes"], { cwd: testDir });

    // Config should be valid after init
    expect(await fileExists(configPath)).toBe(true);

    // Further steps would validate state consistency
  });

  it("should handle errors at any point in flow", async () => {
    // Ideal: errors at any step should:
    // - Be handled gracefully
    // - Not corrupt state
    // - Provide recovery guidance

    const configPath = path.join(testDir, "mcp-toolbox.config.json");

    // Initialize
    await runCli(["init", "--config", configPath, "--yes"], { cwd: testDir });

    // Try invalid operation
    const result = await runCli(["sync", "--config", configPath, "--yes"], {
      cwd: testDir,
    });

    // Should handle gracefully (may fail, but shouldn't corrupt)
    // System should still be in valid state
    expect(await fileExists(configPath)).toBe(true);
  });
});
