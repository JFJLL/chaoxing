import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.test.ts"],
    exclude: ["node_modules/**"],
    fileParallelism: false
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src")
    }
  }
});
