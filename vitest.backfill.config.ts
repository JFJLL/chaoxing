import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/backfillKnowledgeIndex.test.ts"],
    exclude: ["node_modules/**"],
    fileParallelism: false,
    testTimeout: 600_000,
    hookTimeout: 600_000
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src")
    }
  }
});
