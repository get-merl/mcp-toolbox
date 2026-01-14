import fs from "node:fs/promises";
import path from "node:path";
import type { IntrospectedServer } from "../introspect/types";

export type Catalog = {
  generatedAt: string;
  servers: Array<{
    serverSlug: string;
    registryId: string;
    version: string;
    tools: Array<{ name: string; description?: string }>;
  }>;
};

export async function writeCatalog(args: {
  outDir: string;
  entries: Array<{ serverSlug: string; registryId: string; snapshot: IntrospectedServer }>;
}) {
  const catalog: Catalog = {
    generatedAt: new Date().toISOString(),
    servers: args.entries.map((e) => ({
      serverSlug: e.serverSlug,
      registryId: e.registryId,
      version: e.snapshot.version,
      tools: e.snapshot.tools.map((t) => ({ name: t.name, description: t.description })),
    })),
  };
  await fs.mkdir(args.outDir, { recursive: true });
  await fs.writeFile(path.join(args.outDir, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n", "utf-8");
}

