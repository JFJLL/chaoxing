import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const BUILD_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const RUNTIME_DIR_PATTERN = /^\.next-runtime-[A-Za-z0-9_-]+$/;
const RUNTIME_ACTIVE_FILE = ".runtime-active.json";

function assertInsideProject(projectRoot, targetPath) {
  const relativePath = relative(projectRoot, targetPath);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("The build directory must be inside the project root");
  }
}

function readRuntimeProcessIds(runtimePath) {
  const activePath = join(runtimePath, RUNTIME_ACTIVE_FILE);
  if (!existsSync(activePath)) return [];

  try {
    const active = JSON.parse(readFileSync(activePath, "utf8"));
    const candidates = Array.isArray(active.pids) ? active.pids : [active.pid];
    return candidates.filter((pid) => Number.isSafeInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

export function cleanupRuntimeBuilds({ projectRoot = process.cwd(), currentRuntimeDistDir } = {}) {
  const root = resolve(projectRoot);
  if (!RUNTIME_DIR_PATTERN.test(currentRuntimeDistDir ?? "")) {
    throw new Error("The current runtime build directory is invalid");
  }

  const currentRuntimePath = resolve(root, currentRuntimeDistDir);
  assertInsideProject(root, currentRuntimePath);
  const removed = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !RUNTIME_DIR_PATTERN.test(entry.name) || entry.name === currentRuntimeDistDir) continue;
    const runtimePath = resolve(root, entry.name);
    assertInsideProject(root, runtimePath);
    if (readRuntimeProcessIds(runtimePath).some(isProcessAlive)) continue;
    rmSync(runtimePath, { recursive: true, force: true });
    removed.push(entry.name);
  }

  return removed;
}

function addRuntimeLease(runtimePath, pid) {
  const activePath = join(runtimePath, RUNTIME_ACTIVE_FILE);
  const pids = [...new Set([...readRuntimeProcessIds(runtimePath).filter(isProcessAlive), pid])];
  writeFileSync(activePath, JSON.stringify({ pids, updatedAt: new Date().toISOString() }));
}

function removeRuntimeLease(runtimePath, pid) {
  const activePath = join(runtimePath, RUNTIME_ACTIVE_FILE);
  const pids = readRuntimeProcessIds(runtimePath).filter((activePid) => activePid !== pid && isProcessAlive(activePid));
  if (pids.length === 0) {
    rmSync(activePath, { force: true });
    return;
  }
  writeFileSync(activePath, JSON.stringify({ pids, updatedAt: new Date().toISOString() }));
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
    cleanupRuntimeBuilds({ projectRoot: root, currentRuntimeDistDir: runtimeDistDir });
    return runtimeDistDir;
  }

  rmSync(runtimePath, { recursive: true, force: true });
  cpSync(sourcePath, runtimePath, { recursive: true });
  writeFileSync(runtimeReadyPath, buildId);
  cleanupRuntimeBuilds({ projectRoot: root, currentRuntimeDistDir: runtimeDistDir });

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
  const childPid = child.pid;
  const runtimePath = join(projectRoot, runtimeDistDir);
  if (childPid) addRuntimeLease(runtimePath, childPid);

  const releaseRuntime = () => {
    if (childPid) removeRuntimeLease(runtimePath, childPid);
  };

  child.once("error", (error) => {
    releaseRuntime();
    console.error(error);
    process.exitCode = 1;
  });
  child.once("exit", (code) => {
    releaseRuntime();
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
