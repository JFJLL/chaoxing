import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { runImportJob } from "../../src/lib/imports/runImportJob";
import { enqueueImportJob, recoverImportJobsFromDatabase } from "../../src/lib/imports/importQueue";

const prisma = new PrismaClient();

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
  });

  afterAll(() => {
    for (const [name, value] of Object.entries(previousAiEnv)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it("extracts text and records a failed job when no model is configured", async () => {
    const course = await prisma.course.findFirstOrThrow({ where: { title: "功能体验课" } });
    const user = await prisma.user.findFirstOrThrow({ where: { name: "李素艳" } });
    const dir = ".uploads/test";
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `pipeline-${Date.now()}.md`);
    await writeFile(filePath, "# 数字阅读服务培训\n\n## 服务认知\n读者需求。\n\n## 活动策划\n宣传渠道。\n\n## 数据分析\n反馈指标。", "utf8");

    const job = await prisma.documentImportJob.create({
      data: {
        courseId: course.id,
        userId: user.id,
        status: "QUEUED",
        originalName: "pipeline.md",
        filePath,
        mimeType: "text/markdown"
      }
    });

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
  });

  it("recovers queued import jobs from the database", async () => {
    const course = await prisma.course.findFirstOrThrow({ where: { title: "功能体验课" } });
    const user = await prisma.user.findFirstOrThrow({ where: { name: "李素艳" } });
    const dir = ".uploads/test";
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `recovery-${Date.now()}.md`);
    await writeFile(filePath, "# 恢复测试\n\n## 队列恢复\n服务重启后继续解析。", "utf8");

    const job = await prisma.documentImportJob.create({
      data: {
        courseId: course.id,
        userId: user.id,
        status: "QUEUED",
        currentStage: "等待恢复",
        originalName: "recovery.md",
        filePath,
        mimeType: "text/markdown"
      }
    });

    const recovered = await recoverImportJobsFromDatabase(course.id);
    expect(recovered).toBeGreaterThanOrEqual(1);
    const updated = await waitForJobStatus(job.id, "FAILED");
    expect(updated.extractedText).toContain("恢复测试");
    expect(updated.generatedOutline).toBeNull();
    expect(updated.errorMessage).toBe("AI 模型未配置，请联系管理员检查模型设置");
  });

  it("fails fast for unsupported queue providers", () => {
    const previousProvider = process.env.IMPORT_QUEUE_PROVIDER;
    process.env.IMPORT_QUEUE_PROVIDER = "redis";
    expect(() => enqueueImportJob("job-without-redis-worker")).toThrow("IMPORT_QUEUE_PROVIDER=redis is not supported");
    process.env.IMPORT_QUEUE_PROVIDER = previousProvider;
  });
});
