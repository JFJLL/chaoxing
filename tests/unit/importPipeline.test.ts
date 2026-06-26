import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { runImportJob } from "../../src/lib/imports/runImportJob";

const prisma = new PrismaClient();

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
  });
});
