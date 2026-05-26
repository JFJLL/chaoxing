import { rmSync } from "node:fs";

for (const target of [".next", "test-results", "playwright-report", "tsconfig.tsbuildinfo"]) {
  rmSync(target, { recursive: true, force: true });
}
