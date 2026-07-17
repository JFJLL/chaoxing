import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const startScript = fileURLToPath(new URL("../../scripts/start.mjs", import.meta.url));
const packageJsonPath = fileURLToPath(new URL("../../package.json", import.meta.url));
const nextConfigPath = fileURLToPath(new URL("../../next.config.ts", import.meta.url));
const temporaryDirectories: string[] = [];

function writeBuild(root: string, buildId: string, chunkName: string) {
  const distDir = join(root, ".next");
  mkdirSync(join(distDir, "static", "chunks"), { recursive: true });
  writeFileSync(join(distDir, "BUILD_ID"), buildId);
  writeFileSync(join(distDir, "static", "chunks", chunkName), `chunk:${buildId}`);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("production build isolation", () => {
  it("keeps the running build snapshot intact when .next is rebuilt", () => {
    const root = mkdtempSync(join(tmpdir(), "chaoxing-runtime-build-"));
    temporaryDirectories.push(root);
    writeBuild(root, "build-old", "old-layout.js");

    const prepare = spawnSync(process.execPath, [startScript, "--prepare-only"], {
      cwd: root,
      encoding: "utf8"
    });

    expect(prepare.status, prepare.stderr).toBe(0);
    expect(prepare.stdout.trim()).toBe(".next-runtime-build-old");

    const runtimeChunk = join(root, ".next-runtime-build-old", "static", "chunks", "old-layout.js");
    expect(readFileSync(runtimeChunk, "utf8")).toBe("chunk:build-old");

    rmSync(join(root, ".next"), { recursive: true, force: true });
    writeBuild(root, "build-new", "new-layout.js");

    expect(readFileSync(runtimeChunk, "utf8")).toBe("chunk:build-old");
    expect(existsSync(join(dirname(runtimeChunk), "new-layout.js"))).toBe(false);
  });

  it("starts Next from the runtime snapshot directory", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { scripts: Record<string, string> };
    const nextConfig = readFileSync(nextConfigPath, "utf8");

    expect(packageJson.scripts.start).toBe("node scripts/start.mjs");
    expect(nextConfig).toContain("process.env.NEXT_DIST_DIR");
    expect(nextConfig).toContain("PHASE_DEVELOPMENT_SERVER");
    expect(nextConfig).toContain(".next-dev");
  });

  it("rebuilds an incomplete runtime snapshot before reusing it", () => {
    const root = mkdtempSync(join(tmpdir(), "chaoxing-incomplete-runtime-build-"));
    temporaryDirectories.push(root);
    writeBuild(root, "build-interrupted", "complete-layout.js");

    const runtimePath = join(root, ".next-runtime-build-interrupted");
    mkdirSync(runtimePath, { recursive: true });
    writeFileSync(join(runtimePath, "BUILD_ID"), "build-interrupted");

    const prepare = spawnSync(process.execPath, [startScript, "--prepare-only"], {
      cwd: root,
      encoding: "utf8"
    });

    expect(prepare.status, prepare.stderr).toBe(0);
    expect(readFileSync(join(runtimePath, "static", "chunks", "complete-layout.js"), "utf8"))
      .toBe("chunk:build-interrupted");
    expect(readFileSync(join(runtimePath, ".runtime-ready"), "utf8")).toBe("build-interrupted");
  });
});
