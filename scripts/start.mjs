import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const BUILD_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function assertInsideProject(projectRoot, targetPath) {
  const relativePath = relative(projectRoot, targetPath);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("The build directory must be inside the project root");
  }
}

export function prepareRuntimeBuild({ projectRoot = process.cwd(), sourceDistDir = ".next" } = {}) {
  const root = resolve(projectRoot);
  const sourcePath = resolve(root, sourceDistDir);
  assertInsideProject(root, sourcePath);

  const buildIdPath = join(sourcePath, "BUILD_ID");
  if (!existsSync(buildIdPath)) {
    throw new Error(`Production build not found at ${sourceDistDir}. Run npm run build first.`);
  }

  const buildId = readFileSync(buildIdPath, "utf8").trim();
  if (!BUILD_ID_PATTERN.test(buildId)) {
    throw new Error("Production BUILD_ID is invalid");
  }

  const runtimeDistDir = `.next-runtime-${buildId}`;
  const runtimePath = join(root, runtimeDistDir);
  const runtimeBuildIdPath = join(runtimePath, "BUILD_ID");
  const runtimeReadyPath = join(runtimePath, ".runtime-ready");
  if (
    existsSync(runtimeBuildIdPath)
    && existsSync(runtimeReadyPath)
    && readFileSync(runtimeBuildIdPath, "utf8").trim() === buildId
    && readFileSync(runtimeReadyPath, "utf8").trim() === buildId
  ) {
    return runtimeDistDir;
  }

  rmSync(runtimePath, { recursive: true, force: true });
  cpSync(sourcePath, runtimePath, { recursive: true });
  writeFileSync(runtimeReadyPath, buildId);

  return runtimeDistDir;
}

export function startProductionServer(args = process.argv.slice(2)) {
  const projectRoot = process.cwd();
  const runtimeDistDir = prepareRuntimeBuild({ projectRoot });
  const nextCli = join(projectRoot, "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(nextCli)) {
    throw new Error("Next.js CLI not found. Run npm install first.");
  }

  const child = spawn(process.execPath, [nextCli, "start", "--hostname", "127.0.0.1", ...args], {
    cwd: projectRoot,
    env: { ...process.env, NEXT_DIST_DIR: runtimeDistDir },
    stdio: "inherit"
  });

  child.once("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  child.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => child.kill(signal));
  }
}

const isMain = Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  if (process.argv[2] === "--prepare-only") {
    console.log(prepareRuntimeBuild());
  } else {
    startProductionServer();
  }
}
