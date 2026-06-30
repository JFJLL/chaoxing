import { rmSync } from "node:fs";

for (const target of [".next", "test-results", "tsconfig.tsbuildinfo"]) {
  rmSync(target, { recursive: true, force: true });
}
