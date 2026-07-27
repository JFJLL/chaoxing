import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("@/lib/ai/generateCourseOutline", () => ({
  generateCourseOutline: vi.fn(async () => {
    throw Object.assign(
      new Error("AI 模型未配置，请联系管理员检查模型设置"),
      { code: "MODEL_NOT_CONFIGURED" }
    );
  })
}));

let prisma: PrismaClient;
let applicationDb: PrismaClient;
let runImportJob: typeof import("../../src/lib/imports/runImportJob").runImportJob;
let enqueueImportJob: typeof import("../../src/lib/imports/importQueue").enqueueImportJob;
let recoverImportJobFromDatabase: typeof import("../../src/lib/imports/importQueue").recoverImportJobFromDatabase;
let courseId: string;
let userId: string;
let institutionId: string;

const aiEnvNames = [
  "AI_API_KEY",
  "AI_BASE_URL",
  "AI_MODEL",
  "AI_PROVIDER",
  "GEMINI_API_KEY",
  "GEMINI_BASE_URL",
  "GEMINI_MODEL",
  "GEMINI_PROVIDER",
  "GOOGLE_API_KEY",
  "GOOGLE_BASE_URL",
  "GOOGLE_MODEL",
  "GOOGLE_PROVIDER",
  "GOOGLE_AI_BASE_URL",
  "GOOGLE_AI_MODEL",
  "GOOGLE_AI_PROVIDER",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "apiKey",
  "baseUrl",
  "model",
  "key",
  "url",
  "provider",
  "api_key",
  "base_url",
  "apiUrl",
  "api_url",
  "modelName",
  "model_name",
  "aiProvider",
  "geminiApiKey",
  "googleApiKey"
] as const;

const previousAiEnv = Object.fromEntries(aiEnvNames.map((name) => [name, process.env[name]]));
const previousDatabaseUrl = process.env.DATABASE_URL;
const createdJobIds = new Set<string>();
const createdFilePaths = new Set<string>();
const testJobPrefix = "__vitest_import_pipeline__";
const testDatabaseName = `import-pipeline-${randomUUID()}.db`;
const testDatabasePath = resolve(".verification", "tmp", testDatabaseName);
const testDatabaseUrl = `file:../.verification/tmp/${testDatabaseName}`;

async function migrateIsolatedDatabase() {
  const migrationsRoot = resolve("prisma", "migrations");
  const migrationDirectories = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const migrationDirectory of migrationDirectories) {
    const sql = await readFile(join(migrationsRoot, migrationDirectory, "migration.sql"), "utf8");
    await new Promise<void>((resolveMigration, rejectMigration) => {
      const child = spawn("sqlite3", [testDatabasePath], {
        windowsHide: true,
        stdio: ["pipe", "ignore", "pipe"]
      });
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", rejectMigration);
      child.on("close", (code) => {
        if (code === 0) resolveMigration();
        else rejectMigration(new Error(`迁移 ${migrationDirectory} 失败：${stderr.trim() || `sqlite3 退出码 ${code}`}`));
      });
      child.stdin.end(`.bail on\n${sql}\n`);
    });
  }
}

async function waitForJobStatus(jobId: string, status: string) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const job = await prisma.documentImportJob.findUniqueOrThrow({ where: { id: jobId } });
    if (job.status === status) return job;
    if (job.status === "FAILED") throw new Error(job.errorMessage ?? "导入任务失败");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`导入任务未在预期时间进入 ${status}`);
}

describe("import pipeline", () => {
  beforeAll(async () => {
    for (const name of aiEnvNames) delete process.env[name];
    await mkdir(dirname(testDatabasePath), { recursive: true });
    await migrateIsolatedDatabase();
    process.env.DATABASE_URL = testDatabaseUrl;
    vi.resetModules();
    const { PrismaClient: TestPrismaClient } = await import("@prisma/client");
    prisma = new TestPrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    const dbModule = await import("../../src/lib/db");
    applicationDb = dbModule.db;
    ({ runImportJob } = await import("../../src/lib/imports/runImportJob"));
    ({ enqueueImportJob, recoverImportJobFromDatabase } = await import("../../src/lib/imports/importQueue"));

    const institution = await prisma.institution.create({
      data: { name: `导入流水线测试 ${randomUUID()}` }
    });
    institutionId = institution.id;
    const user = await prisma.user.create({
      data: {
        name: "导入流水线测试教师",
        email: `${randomUUID()}@import-pipeline.test`,
        role: "TEACHER",
        institutionId
      }
    });
    userId = user.id;
    const course = await prisma.course.create({
      data: {
        title: "隔离导入流水线课程",
        status: "ACTIVE",
        ownerId: userId,
        institutionId
      }
    });
    courseId = course.id;
  });

  afterEach(async () => {
    if (createdJobIds.size) {
      await prisma.documentImportJob.deleteMany({ where: { id: { in: [...createdJobIds] } } });
      createdJobIds.clear();
    }
    await Promise.all([...createdFilePaths].map((filePath) => rm(filePath, { force: true })));
    createdFilePaths.clear();
  });

  afterAll(async () => {
    if (institutionId) await prisma.institution.deleteMany({ where: { id: institutionId } });
    for (const [name, value] of Object.entries(previousAiEnv)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    await applicationDb?.$disconnect();
    await prisma?.$disconnect();
    await Promise.all([
      rm(testDatabasePath, { force: true }),
      rm(`${testDatabasePath}-journal`, { force: true }),
      rm(`${testDatabasePath}-shm`, { force: true }),
      rm(`${testDatabasePath}-wal`, { force: true })
    ]);
  });

  it("extracts text and records a failed job when no model is configured", async () => {
    const dir = ".uploads/test";
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `pipeline-${Date.now()}.md`);
    createdFilePaths.add(filePath);
    await writeFile(filePath, "# 数字阅读服务培训\n\n## 服务认知\n读者需求。\n\n## 活动策划\n宣传渠道。\n\n## 数据分析\n反馈指标。", "utf8");

    const job = await prisma.documentImportJob.create({
      data: {
        courseId,
        userId,
        status: "QUEUED",
        originalName: `${testJobPrefix}-pipeline.md`,
        filePath,
        mimeType: "text/markdown"
      }
    });
    createdJobIds.add(job.id);

    await expect(runImportJob(job.id)).rejects.toMatchObject({ code: "MODEL_NOT_CONFIGURED" });
    const updated = await prisma.documentImportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("FAILED");
    expect(updated.extractedText).toContain("数字阅读服务培训");
    expect(updated.generatedOutline).toBeNull();
    expect(updated.errorMessage).toBe("AI 模型未配置，请联系管理员检查模型设置");

    const map = await prisma.courseKnowledgeMap.findFirst({
      where: { sourceJobId: job.id },
      include: { nodes: true, edges: true }
    });
    expect(map).toBeNull();
  }, 20_000);

  it("recovers queued import jobs from the database", async () => {
    const dir = ".uploads/test";
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `recovery-${Date.now()}.md`);
    createdFilePaths.add(filePath);
    await writeFile(filePath, "# 恢复测试\n\n## 队列恢复\n服务重启后继续解析。", "utf8");

    const job = await prisma.documentImportJob.create({
      data: {
        courseId,
        userId,
        status: "QUEUED",
        currentStage: "等待恢复",
        originalName: `${testJobPrefix}-recovery.md`,
        filePath,
        mimeType: "text/markdown"
      }
    });
    createdJobIds.add(job.id);

    const recovered = await recoverImportJobFromDatabase(job.id, courseId);
    expect(recovered).toBe(true);
    const updated = await waitForJobStatus(job.id, "FAILED");
    expect(updated.extractedText).toContain("恢复测试");
    expect(updated.generatedOutline).toBeNull();
    expect(updated.errorMessage).toBe("AI 模型未配置，请联系管理员检查模型设置");
  }, 20_000);

  it("fails fast for unsupported queue providers", () => {
    const previousProvider = process.env.IMPORT_QUEUE_PROVIDER;
    try {
      process.env.IMPORT_QUEUE_PROVIDER = "redis";
      expect(() => enqueueImportJob("job-without-redis-worker")).toThrow("IMPORT_QUEUE_PROVIDER=redis is not supported");
    } finally {
      if (previousProvider === undefined) delete process.env.IMPORT_QUEUE_PROVIDER;
      else process.env.IMPORT_QUEUE_PROVIDER = previousProvider;
    }
  });
});
