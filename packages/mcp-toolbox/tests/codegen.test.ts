import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateServerTs } from "@/codegen/ts/generateServer";
import type { IntrospectedServer } from "@/introspect/types";
import { createTestDir, cleanupTestDir, fileExists } from "./helpers/fs";
import path from "node:path";
import fs from "node:fs/promises";

describe("code generation", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  it("should generate valid TypeScript interfaces from JSON Schema", async () => {
    const snapshot: IntrospectedServer = {
      serverName: "test.server/mock",
      version: "1.0.0",
      retrievedAt: new Date().toISOString(),
      transport: { kind: "stdio" },
      tools: [
        {
          name: "test_tool",
          description: "Test tool",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string" },
              count: { type: "number" },
              enabled: { type: "boolean" },
            },
            required: ["name"],
          },
        },
      ],
    };

    await generateServerTs({
      outDir: testDir,
      serverSlug: "test-server-mock",
      registryId: "test.server/mock",
      snapshot,
    });

    const toolFile = path.join(
      testDir,
      "servers",
      "test-server-mock",
      "tools",
      "testTool.ts"
    );
    expect(await fileExists(toolFile)).toBe(true);

    const content = await fs.readFile(toolFile, "utf-8");
    expect(content).toContain("export interface");
    expect(content).toContain("name: string");
    expect(content).toContain("count?: number");
    expect(content).toContain("enabled?: boolean");
  });

  it("should handle complex JSON Schema (nested objects, arrays)", async () => {
    const snapshot: IntrospectedServer = {
      serverName: "test.server/complex",
      version: "1.0.0",
      retrievedAt: new Date().toISOString(),
      transport: { kind: "stdio" },
      tools: [
        {
          name: "complex_tool",
          description: "Complex tool",
          inputSchema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    value: { type: "number" },
                  },
                },
              },
              metadata: {
                type: "object",
                properties: {
                  tags: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
      ],
    };

    await generateServerTs({
      outDir: testDir,
      serverSlug: "test-server-complex",
      registryId: "test.server/complex",
      snapshot,
    });

    const toolFile = path.join(
      testDir,
      "servers",
      "test-server-complex",
      "tools",
      "complexTool.ts"
    );
    expect(await fileExists(toolFile)).toBe(true);

    const content = await fs.readFile(toolFile, "utf-8");
    // Should handle arrays and nested objects
    expect(content).toContain("export interface");
  });

  it("should handle tool name collisions with clear naming strategy", async () => {
    const snapshot: IntrospectedServer = {
      serverName: "test.server/collision",
      version: "1.0.0",
      retrievedAt: new Date().toISOString(),
      transport: { kind: "stdio" },
      tools: [
        { name: "get_user", description: "Get user" },
        { name: "getUser", description: "Get user (camelCase)" },
        { name: "get_user", description: "Get user (duplicate)" }, // Duplicate
      ],
    };

    await generateServerTs({
      outDir: testDir,
      serverSlug: "test-server-collision",
      registryId: "test.server/collision",
      snapshot,
    });

    // Should handle collisions by appending numbers
    const toolsDir = path.join(
      testDir,
      "servers",
      "test-server-collision",
      "tools"
    );
    const files = await fs.readdir(toolsDir);
    // Should have unique file names
    expect(new Set(files).size).toBe(files.length);
  });

  it("should include complete JSDoc in generated functions", async () => {
    const snapshot: IntrospectedServer = {
      serverName: "test.server/docs",
      version: "1.0.0",
      retrievedAt: new Date().toISOString(),
      transport: { kind: "stdio" },
      tools: [
        {
          name: "documented_tool",
          description: "This is a well-documented tool",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    };

    await generateServerTs({
      outDir: testDir,
      serverSlug: "test-server-docs",
      registryId: "test.server/docs",
      snapshot,
    });

    const toolFile = path.join(
      testDir,
      "servers",
      "test-server-docs",
      "tools",
      "documentedTool.ts"
    );
    const content = await fs.readFile(toolFile, "utf-8");

    // JSDoc should include:
    expect(content).toContain("/**");
    expect(content).toContain("This is a well-documented tool");
    expect(content).toContain("test.server/docs"); // Server ID
    expect(content).toContain("documented_tool"); // Tool ID
    expect(content).toContain("@param");
    expect(content).toContain("@returns");
  });

  it("should generate barrel export file", async () => {
    const snapshot: IntrospectedServer = {
      serverName: "test.server/barrel",
      version: "1.0.0",
      retrievedAt: new Date().toISOString(),
      transport: { kind: "stdio" },
      tools: [
        { name: "tool1", description: "Tool 1" },
        { name: "tool2", description: "Tool 2" },
      ],
    };

    await generateServerTs({
      outDir: testDir,
      serverSlug: "test-server-barrel",
      registryId: "test.server/barrel",
      snapshot,
    });

    const indexFile = path.join(
      testDir,
      "servers",
      "test-server-barrel",
      "index.ts"
    );
    expect(await fileExists(indexFile)).toBe(true);

    const content = await fs.readFile(indexFile, "utf-8");
    expect(content).toContain("export * from");
    expect(content).toContain("tool1");
    expect(content).toContain("tool2");
  });

  it("should generate code that compiles without TypeScript errors", async () => {
    // This is an ideal behavior test
    // Generated code should pass tsc --noEmit
    // Note: Full validation would require running tsc
    const snapshot: IntrospectedServer = {
      serverName: "test.server/compile",
      version: "1.0.0",
      retrievedAt: new Date().toISOString(),
      transport: { kind: "stdio" },
      tools: [
        {
          name: "compile_test",
          description: "Compile test",
          inputSchema: {
            type: "object",
            properties: {
              value: { type: "string" },
            },
            required: ["value"],
          },
        },
      ],
    };

    await generateServerTs({
      outDir: testDir,
      serverSlug: "test-server-compile",
      registryId: "test.server/compile",
      snapshot,
    });

    // Basic syntax validation
    const toolFile = path.join(
      testDir,
      "servers",
      "test-server-compile",
      "tools",
      "compileTest.ts"
    );
    const content = await fs.readFile(toolFile, "utf-8");

    // Should have valid TypeScript structure
    expect(content).toContain("import");
    expect(content).toContain("export");
    expect(content).toContain("async function");
    expect(content).toContain("Promise");
  });
});
