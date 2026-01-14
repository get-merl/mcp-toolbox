import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname),
  plugins: [
    tsconfigPaths({
      projects: [resolve(__dirname, "./tsconfig.test.json")],
    }),
  ],
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    globals: true,
    environment: "node",
    typecheck: {
      tsconfig: "./tsconfig.test.json",
    },
  },
  resolve: {
    extensions: [".ts", ".js", ".json"],
  },
  esbuild: {
    target: "node20",
  },
});
