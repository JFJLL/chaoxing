import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { runImportJob } from "../../src/lib/imports/runImportJob";
import { recoverImportJobsFromDatabase } from "../../src/lib/imports/importQueue";

const prisma = new PrismaClient();

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
    process.env.AI_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.apiKey = "";
  });

  it("extracts text and creates a generated outline with fallback mode", async () => {
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

    await runImportJob(job.id);
    const updated = await prisma.documentImportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("READY_FOR_REVIEW");
    expect(updated.extractedText).toContain("数字阅读服务培训");
    expect(updated.generatedOutline).toContain("chapters");
    expect(updated.warning).toContain("AI_API_KEY");

    const map = await prisma.courseKnowledgeMap.findFirst({
      where: { sourceJobId: job.id },
      include: { nodes: true, edges: true }
    });
    expect(map?.status).toBe("DRAFT");
    expect(map?.nodes.length).toBeGreaterThan(0);
    expect(map?.edges.length).toBeGreaterThan(0);
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
    const updated = await waitForJobStatus(job.id, "READY_FOR_REVIEW");
    expect(updated.extractedText).toContain("恢复测试");
  });
});
