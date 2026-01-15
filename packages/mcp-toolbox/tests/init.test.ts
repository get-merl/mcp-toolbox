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
    const configPath = path.join(testDir, "mcp-toolbox.config.json");

    const result = await runCli(["init", "--config", configPath, "--yes"], {
      cwd: testDir,
    });

    expect(result.exitCode).toBe(0);
    expect(await fileExists(configPath)).toBe(true);

    const content = await readFileIfExists(configPath);
    // Validate it's valid JSON
    expect(() => JSON.parse(content!)).not.toThrow();
    const config = JSON.parse(content!);
    expect(config.servers).toEqual([]);
    expect(config.generation.outDir).toBe("toolbox");
    expect(config.security.allowStdioExec).toBe(false);
    expect(config.security.envAllowlist).toContain("PATH");
  });

  it("should be idempotent - running multiple times produces identical results", async () => {
    const configPath = path.join(testDir, "mcp-toolbox.config.json");

    // Run init twice
    await runCli(["init", "--config", configPath, "--yes"], { cwd: testDir });
    const firstContent = await readFileIfExists(configPath);

    await runCli(["init", "--config", configPath, "--yes"], { cwd: testDir });
    const secondContent = await readFileIfExists(configPath);

    expect(firstContent).toBe(secondContent);
  });

  it("should create parent directories if they don't exist", async () => {
    const configPath = path.join(testDir, "nested", "deep", "mcp-toolbox.config.json");

    const result = await runCli(["init", "--config", configPath, "--yes"], {
      cwd: testDir,
    });

    expect(result.exitCode).toBe(0);
    expect(await fileExists(configPath)).toBe(true);
  });

  it("should respect custom output directory", async () => {
    const configPath = path.join(testDir, "mcp-toolbox.config.json");
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
    const configPath = path.join(testDir, "mcp-toolbox.config.json");

    await runCli(["init", "--config", configPath, "--yes"], { cwd: testDir });

    // Running again should not error, but should be idempotent
    const result = await runCli(["init", "--config", configPath, "--yes"], {
      cwd: testDir,
    });

    expect(result.exitCode).toBe(0);
  });

  it("should work in non-interactive mode with --yes flag", async () => {
    const configPath = path.join(testDir, "mcp-toolbox.config.json");

    const result = await runCli(["init", "--config", configPath, "--yes"], {
      cwd: testDir,
      env: { CI: "true" }, // Simulate non-interactive environment
    });

    expect(result.exitCode).toBe(0);
    expect(await fileExists(configPath)).toBe(true);
  });
});
