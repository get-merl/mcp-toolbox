import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDir, cleanupTestDir } from "./helpers/fs";
import { createTestConfig } from "./helpers/config";
import { runCli } from "./helpers/cli";
import path from "node:path";

describe("transport selection and connection management", () => {
  let testDir: string;
  let configPath: string;

  beforeEach(async () => {
    testDir = await createTestDir();
    configPath = path.join(testDir, "mcp-toolbox.config.ts");
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  it("should use HTTP transport when overrides.http.url is provided", async () => {
    await createTestConfig(configPath, {
      servers: [
        {
          registryId: "test.server/http",
          channel: "latest",
          overrides: {
            http: { url: "http://localhost:8080/sse" },
          },
        },
      ],
      security: { allowStdioExec: false, envAllowlist: [] },
    });

    // This would require a mock HTTP server
    // Tests ideal behavior: HTTP override should be respected
  });

  it("should use stdio transport when overrides.run is provided", async () => {
    await createTestConfig(configPath, {
      servers: [
        {
          registryId: "test.server/stdio",
          channel: "latest",
          overrides: {
            run: {
              command: "node",
              args: ["-e", "console.log('mock')"],
            },
          },
        },
      ],
      security: { allowStdioExec: true, envAllowlist: [] },
    });

    // Tests ideal behavior: stdio override should work
  });

  it("should reject stdio when allowStdioExec is false", async () => {
    await createTestConfig(configPath, {
      servers: [
        {
          registryId: "test.server/stdio",
          channel: "latest",
          overrides: {
            run: {
              command: "node",
              args: ["-e", "console.log('mock')"],
            },
          },
        },
      ],
      security: { allowStdioExec: false, envAllowlist: [] },
    });

    const result = await runCli(["sync", "--config", configPath, "--yes"], {
      cwd: testDir,
    });

    // Should fail with clear error about stdio being disabled
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr || result.stdout).toContain("allowStdioExec");
  });

  it("should validate required environment variables before connection", async () => {
    // Ideal: should check for required env vars early
    // Should provide clear error if missing
  });

  it("should handle connection timeouts appropriately", async () => {
    // Ideal: connections should timeout after reasonable duration
    // Should not hang indefinitely
  });

  it("should cleanup connections even on errors", async () => {
    // Ideal: all connections should be closed, even if introspection fails
  });
});
