import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { GeneratedCourseOutline } from "../../src/types/course";

const mocks = vi.hoisted(() => ({ generateCourseOutline: vi.fn() }));
vi.mock("@/lib/ai/generateCourseOutline", () => ({
  generateCourseOutline: mocks.generateCourseOutline
}));

let prisma: PrismaClient;
let applicationDb: PrismaClient;
let runImportJob: typeof import("../../src/lib/imports/runImportJob").runImportJob;
let enqueueImportJob: typeof import("../../src/lib/imports/importQueue").enqueueImportJob;
let recoverImportJobFromDatabase: typeof import("../../src/lib/imports/importQueue").recoverImportJobFromDatabase;
let saveImportBatchOutline: typeof import("../../src/lib/imports/saveImportBatchOutline").saveImportBatchOutline;
let composePublishedKnowledgeMaps: typeof import("../../src/lib/knowledgeMap/knowledgeMapService").composePublishedKnowledgeMaps;
let saveKnowledgeMapTextRevision: typeof import("../../src/lib/knowledgeMap/knowledgeMapService").saveKnowledgeMapTextRevision;
let softDeleteKnowledgeMapSeries: typeof import("../../src/lib/knowledgeMap/knowledgeMapService").softDeleteKnowledgeMapSeries;
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
const createdBatchIds = new Set<string>();
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
  const migrationSql = (await Promise.all(migrationDirectories.map(async (migrationDirectory) => {
    const sql = await readFile(join(migrationsRoot, migrationDirectory, "migration.sql"), "utf8");
    return `-- ${migrationDirectory}\n${sql}`;
  }))).join("\n\n");
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
      else rejectMigration(new Error(`隔离数据库迁移失败：${stderr.trim() || `sqlite3 退出码 ${code}`}`));
    });
    child.stdin.end(`.bail on\n${migrationSql}\n`);
  });
}

function outline(title: string): GeneratedCourseOutline {
  return {
    title,
    description: `${title}课程说明`,
    targetAudience: "课程学习者",
    learningObjectives: ["理解资料内容", "掌握核心方法", "完成课程实践"],
    chapters: [{
      title: `${title} 第一章`,
      summary: `${title}章节简介`,
      order: 1,
      lessons: [{
        title: `${title} 第一课`,
        summary: `${title}课时简介`,
        order: 1,
        estimatedMinutes: 45,
        keyPoints: [`${title}知识点`],
        suggestedActivities: [`${title}活动`],
        assessmentPrompts: [`${title}评价`]
      }]
    }]
  };
}

async function createBatchJobs(documents: Array<{ name: string; text: string }>) {
  const batch = await prisma.documentImportBatch.create({
    data: { courseId, userId, status: "PROCESSING" }
  });
  createdBatchIds.add(batch.id);
  const jobs = [];
  for (const document of documents) {
    const filePath = join(".uploads/test", `${randomUUID()}-${document.name}`);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, document.text, "utf8");
    createdFilePaths.add(filePath);
    const job = await prisma.documentImportJob.create({
      data: {
        courseId,
        userId,
        batchId: batch.id,
        status: "QUEUED",
        originalName: document.name,
        filePath,
        mimeType: "text/markdown"
      }
    });
    createdJobIds.add(job.id);
    jobs.push(job);
  }
  return { batch, jobs };
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
    ({ saveImportBatchOutline } = await import("../../src/lib/imports/saveImportBatchOutline"));
    ({ composePublishedKnowledgeMaps, saveKnowledgeMapTextRevision, softDeleteKnowledgeMapSeries } = await import("../../src/lib/knowledgeMap/knowledgeMapService"));

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

  beforeEach(() => {
    mocks.generateCourseOutline.mockReset();
    mocks.generateCourseOutline.mockRejectedValue(Object.assign(
      new Error("AI 模型未配置，请联系管理员检查模型设置"),
      { code: "MODEL_NOT_CONFIGURED" }
    ));
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { entity: "Course", entityId: courseId } });
    await prisma.chapter.deleteMany({ where: { courseId } });
    await prisma.courseKnowledgeMap.deleteMany({ where: { courseId, sourceJobId: null } });
    await prisma.course.updateMany({ where: { id: courseId }, data: { outlineVersion: 0 } });
    if (createdJobIds.size) {
      await prisma.courseKnowledgeMap.deleteMany({ where: { sourceJobId: { in: [...createdJobIds] } } });
      await prisma.documentImportJob.deleteMany({ where: { id: { in: [...createdJobIds] } } });
      createdJobIds.clear();
    }
    if (createdBatchIds.size) {
      await prisma.documentImportBatch.deleteMany({ where: { id: { in: [...createdBatchIds] } } });
      createdBatchIds.clear();
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

  it("combines two completed documents exactly once after both independent maps are ready", async () => {
    const { batch, jobs } = await createBatchJobs([
      { name: "资料甲.md", text: "# 资料甲\n\n## 甲章节\n甲资料真实内容。" },
      { name: "资料乙.md", text: "# 资料乙\n\n## 乙章节\n乙资料真实内容。" }
    ]);
    let combinedCalls = 0;
    mocks.generateCourseOutline.mockImplementation(async (input: { documentText: string }) => {
      if (input.documentText.includes("资料 1：")) {
        combinedCalls += 1;
        expect(input.documentText).toContain("资料甲.md");
        expect(input.documentText).toContain("甲资料真实内容");
        expect(input.documentText).toContain("资料乙.md");
        expect(input.documentText).toContain("乙资料真实内容");
        return { outline: outline("综合目录") };
      }
      return { outline: outline(input.documentText.includes("资料甲") ? "资料甲" : "资料乙") };
    });

    await runImportJob(jobs[0]!.id);
    const afterFirst = await prisma.documentImportBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(afterFirst.status).toBe("PROCESSING");
    expect(afterFirst.generatedOutline).toBeNull();

    await runImportJob(jobs[1]!.id);
    const completed = await prisma.documentImportBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(completed.status).toBe("READY_FOR_REVIEW");
    expect(completed.generatedOutlineVersion).toBe(1);
    expect(JSON.parse(completed.generatedOutline ?? "{}")).toMatchObject({ title: "综合目录" });
    expect(combinedCalls).toBe(1);
    expect(await prisma.courseKnowledgeMap.count({ where: { sourceJobId: { in: jobs.map((job) => job.id) } } })).toBe(2);
  }, 20_000);

  it("allows only one concurrent batch combiner when the last documents finish together", async () => {
    const { batch, jobs } = await createBatchJobs([
      { name: "并发甲.md", text: "# 并发甲\n\n甲正文。" },
      { name: "并发乙.md", text: "# 并发乙\n\n乙正文。" }
    ]);
    let combinedCalls = 0;
    mocks.generateCourseOutline.mockImplementation(async (input: { documentText: string }) => {
      if (input.documentText.includes("资料 1：")) {
        combinedCalls += 1;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 40));
        return { outline: outline("并发综合目录") };
      }
      return { outline: outline(input.documentText.includes("并发甲") ? "并发甲" : "并发乙") };
    });

    await Promise.all(jobs.map((job) => runImportJob(job.id)));

    const completed = await prisma.documentImportBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(completed.status).toBe("READY_FOR_REVIEW");
    expect(completed.generatedOutlineVersion).toBe(1);
    expect(combinedCalls).toBe(1);
  }, 20_000);

  it("marks a batch failed and never exposes a partial outline when one document fails", async () => {
    const { batch, jobs } = await createBatchJobs([
      { name: "成功资料.md", text: "# 成功资料\n\n成功正文。" },
      { name: "失败资料.md", text: "# 失败资料\n\n触发失败。" }
    ]);
    mocks.generateCourseOutline.mockImplementation(async (input: { documentText: string }) => {
      if (input.documentText.includes("失败资料")) throw new Error("稳定模拟的资料解析失败");
      return { outline: outline("成功资料") };
    });

    await runImportJob(jobs[0]!.id);
    await expect(runImportJob(jobs[1]!.id)).rejects.toThrow("稳定模拟的资料解析失败");

    const failed = await prisma.documentImportBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(failed.status).toBe("FAILED");
    expect(failed.generatedOutline).toBeNull();
    expect((await prisma.documentImportJob.findUniqueOrThrow({ where: { id: jobs[0]!.id } })).status).toBe("READY_FOR_REVIEW");
    expect((await prisma.documentImportJob.findUniqueOrThrow({ where: { id: jobs[1]!.id } })).status).toBe("FAILED");
  }, 20_000);

  it("rejects saving an incomplete batch without changing the persisted course directory", async () => {
    const { batch, jobs } = await createBatchJobs([
      { name: "待完成甲.md", text: "# 待完成甲\n\n已完成正文。" },
      { name: "待完成乙.md", text: "# 待完成乙\n\n仍在排队。" }
    ]);
    await prisma.documentImportJob.update({
      where: { id: jobs[0]!.id },
      data: { status: "READY_FOR_REVIEW", generatedOutline: JSON.stringify(outline("资料甲")) }
    });
    await prisma.documentImportBatch.update({
      where: { id: batch.id },
      data: {
        status: "READY_FOR_REVIEW",
        generatedOutline: JSON.stringify(outline("不应保存的综合目录")),
        generatedOutlineVersion: 1
      }
    });

    await expect(saveImportBatchOutline({
      jobId: jobs[0]!.id,
      actorId: userId,
      outline: outline("不应保存的综合目录"),
      expectedOutlineVersion: 0,
      expectedBatchVersion: 1
    })).rejects.toMatchObject({ code: "IMPORT_BATCH_DOCUMENTS_INCOMPLETE" });

    expect(await prisma.chapter.count({ where: { courseId } })).toBe(0);
    expect((await prisma.course.findUniqueOrThrow({ where: { id: courseId } })).outlineVersion).toBe(0);
    expect((await prisma.documentImportBatch.findUniqueOrThrow({ where: { id: batch.id } })).savedAt).toBeNull();
  });

  it("applies one ready batch once and rejects a repeated formal save", async () => {
    const { batch, jobs } = await createBatchJobs([
      { name: "正式保存甲.md", text: "# 正式保存甲\n\n正文甲。" },
      { name: "正式保存乙.md", text: "# 正式保存乙\n\n正文乙。" }
    ]);
    await prisma.documentImportJob.updateMany({
      where: { id: { in: jobs.map((job) => job.id) } },
      data: { status: "READY_FOR_REVIEW", generatedOutline: JSON.stringify(outline("单份目录")) }
    });
    const combined = outline("正式综合目录");
    await prisma.documentImportBatch.update({
      where: { id: batch.id },
      data: { status: "READY_FOR_REVIEW", generatedOutline: JSON.stringify(combined), generatedOutlineVersion: 1 }
    });

    const saved = await saveImportBatchOutline({
      jobId: jobs[0]!.id,
      actorId: userId,
      outline: combined,
      expectedOutlineVersion: 0,
      expectedBatchVersion: 1
    });
    expect(saved.outlineVersion).toBe(1);
    expect(saved.chapters).toHaveLength(1);

    await expect(saveImportBatchOutline({
      jobId: jobs[1]!.id,
      actorId: userId,
      outline: combined,
      expectedOutlineVersion: 1,
      expectedBatchVersion: 1
    })).rejects.toMatchObject({ code: "IMPORT_BATCH_ALREADY_APPLIED" });
    expect(await prisma.chapter.count({ where: { courseId } })).toBe(1);
    expect((await prisma.course.findUniqueOrThrow({ where: { id: courseId } })).outlineVersion).toBe(1);
  });

  it("keeps applied document maps visible and rebuilds deleted composites from the latest source versions", async () => {
    const { batch, jobs } = await createBatchJobs([
      { name: "组合甲.md", text: "# 组合甲\n\n甲正文。" },
      { name: "组合乙.md", text: "# 组合乙\n\n乙正文。" }
    ]);
    mocks.generateCourseOutline.mockImplementation(async (input: { documentText: string }) => ({
      outline: outline(input.documentText.includes("组合甲") ? "组合甲" : input.documentText.includes("资料 1：") ? "组合目录" : "组合乙")
    }));
    await Promise.all(jobs.map((job) => runImportJob(job.id)));

    await saveImportBatchOutline({
      jobId: jobs[0]!.id,
      actorId: userId,
      outline: outline("组合目录"),
      expectedOutlineVersion: 0,
      expectedBatchVersion: 1
    });
    expect((await prisma.documentImportBatch.findUniqueOrThrow({ where: { id: batch.id } })).status).toBe("APPLIED");

    const sourceMaps = await prisma.courseKnowledgeMap.findMany({
      where: { sourceJobId: { in: jobs.map((job) => job.id) }, deletedAt: null },
      orderBy: { sourceJobId: "asc" },
      include: { nodes: true, edges: true }
    });
    expect(sourceMaps).toHaveLength(2);
    const firstComposite = await composePublishedKnowledgeMaps({
      courseId,
      courseTitle: "隔离导入流水线课程",
      mapIds: sourceMaps.map((map) => map.id),
      persist: true
    });
    expect(firstComposite.map.version).toBe(1);

    const revised = await saveKnowledgeMapTextRevision({
      courseId,
      mapId: sourceMaps[0]!.id,
      text: sourceMaps[0]!.textContent!.replace("第一章", "第一章（新版）"),
      expectedVersion: 1
    });
    const latestMapIds = [revised.id, sourceMaps[1]!.id];
    const preview = await composePublishedKnowledgeMaps({
      courseId,
      courseTitle: "隔离导入流水线课程",
      mapIds: latestMapIds,
      persist: false
    });
    expect(preview.persisted).toBe(false);
    expect(preview.map.id).toContain("preview:");

    await softDeleteKnowledgeMapSeries(courseId, firstComposite.map.id);
    const rebuilt = await composePublishedKnowledgeMaps({
      courseId,
      courseTitle: "隔离导入流水线课程",
      mapIds: latestMapIds,
      persist: true
    });
    expect(rebuilt.map.version).toBe(2);
    expect(JSON.parse(rebuilt.map.sourceMapIds ?? "[]").sort()).toEqual(latestMapIds.sort());
  }, 20_000);

  it("never resurrects a soft-deleted job when the worker runs", async () => {
    const { jobs } = await createBatchJobs([
      { name: "已删除.md", text: "# 已删除\n\n正文。" }
    ]);
    await prisma.documentImportJob.update({
      where: { id: jobs[0]!.id },
      data: { status: "DELETED", deletedAt: new Date() }
    });

    // The batch delete already soft-deleted the job; the worker must treat it as
    // a no-op instead of writing a visible status back onto it.
    await runImportJob(jobs[0]!.id);

    const after = await prisma.documentImportJob.findUniqueOrThrow({ where: { id: jobs[0]!.id } });
    expect(after.status).toBe("DELETED");
    expect(after.deletedAt).not.toBeNull();
    expect(mocks.generateCourseOutline).not.toHaveBeenCalled();
  });
});
