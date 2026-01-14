import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDir, cleanupTestDir, fileExists, readFileIfExists } from "./helpers/fs";
import { runCli } from "./helpers/cli";
import path from "node:path";

describe("init command", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  it("should create valid config file with defaults", async () => {
    const configPath = path.join(testDir, "mcp-toolbox.config.ts");

    const result = await runCli(["init", "--config", configPath, "--yes"], {
      cwd: testDir,
    });

    expect(result.exitCode).toBe(0);
    expect(await fileExists(configPath)).toBe(true);

    const content = await readFileIfExists(configPath);
    expect(content).toContain("ToolboxConfig");
    expect(content).toContain('"servers": []');
    expect(content).toContain('"outDir": "toolbox"');
    expect(content).toContain('"allowStdioExec": false');
  });

  it("should be idempotent - running multiple times produces identical results", async () => {
    const configPath = path.join(testDir, "mcp-toolbox.config.ts");

    // Run init twice
    await runCli(["init", "--config", configPath, "--yes"], { cwd: testDir });
    const firstContent = await readFileIfExists(configPath);

    await runCli(["init", "--config", configPath, "--yes"], { cwd: testDir });
    const secondContent = await readFileIfExists(configPath);

    expect(firstContent).toBe(secondContent);
  });

  it("should create parent directories if they don't exist", async () => {
    const configPath = path.join(testDir, "nested", "deep", "mcp-toolbox.config.ts");

    const result = await runCli(["init", "--config", configPath, "--yes"], {
      cwd: testDir,
    });

    expect(result.exitCode).toBe(0);
    expect(await fileExists(configPath)).toBe(true);
  });

  it("should respect custom output directory", async () => {
    const configPath = path.join(testDir, "mcp-toolbox.config.ts");
    const customOutDir = "custom-output";

    const result = await runCli(
      ["init", "--config", configPath, "--outDir", customOutDir, "--yes"],
      { cwd: testDir }
    );

    expect(result.exitCode).toBe(0);
    const content = await readFileIfExists(configPath);
    expect(content).toContain(`"outDir": "${customOutDir}"`);
  });

  it("should provide clear error message when config already exists", async () => {
    const configPath = path.join(testDir, "mcp-toolbox.config.ts");

    await runCli(["init", "--config", configPath, "--yes"], { cwd: testDir });

    // Running again should not error, but should be idempotent
    const result = await runCli(["init", "--config", configPath, "--yes"], {
      cwd: testDir,
    });

    expect(result.exitCode).toBe(0);
  });

  it("should work in non-interactive mode with --yes flag", async () => {
    const configPath = path.join(testDir, "mcp-toolbox.config.ts");

    const result = await runCli(["init", "--config", configPath, "--yes"], {
      cwd: testDir,
      env: { CI: "true" }, // Simulate non-interactive environment
    });

    expect(result.exitCode).toBe(0);
    expect(await fileExists(configPath)).toBe(true);
  });
});
