import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ArtifactWorkflowError, publishArtifact } from "@/lib/courseWorkspace/artifactWorkflow";
import { createPrismaArtifactWorkflowStore } from "@/lib/courseWorkspace/prismaArtifactStores";

const clients: PrismaClient[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.$disconnect()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("AI artifact publication SQLite invariant", () => {
  it("never leaves two published revisions when separate connections publish concurrently", async () => {
    const directory = await mkdtemp(join(tmpdir(), "chaoxing-ai-publish-"));
    directories.push(directory);
    const database = join(directory, "test.db");
    await copyFile(resolve("prisma/dev.db"), database);
    const url = `file:${database.replace(/\\/g, "/")}`;
    const firstClient = new PrismaClient({ datasources: { db: { url } } });
    const secondClient = new PrismaClient({ datasources: { db: { url } } });
    clients.push(firstClient, secondClient);

    const suffix = Date.now().toString(36);
    const institution = await firstClient.institution.create({ data: { name: `并发测试-${suffix}` } });
    const user = await firstClient.user.create({
      data: { name: "并发教师", email: `publish-${suffix}@example.test`, role: "TEACHER", institutionId: institution.id }
    });
    const course = await firstClient.course.create({
      data: { title: "并发发布课程", ownerId: user.id, institutionId: institution.id }
    });
    const seriesId = `publish-series-${suffix}`;
    const artifacts = await Promise.all([1, 2].map((version) => firstClient.courseAiArtifact.create({
      data: {
        seriesId, courseId: course.id, userId: user.id, appType: "paper_assembly",
        title: `试卷 v${version}`, payload: JSON.stringify({ title: "试卷", sections: [] }),
        status: "APPROVED", version
      }
    })));

    const results = await Promise.allSettled([
      publishArtifact(createPrismaArtifactWorkflowStore(firstClient), { courseId: course.id, artifactId: artifacts[0].id }, 5, 5),
      publishArtifact(createPrismaArtifactWorkflowStore(secondClient), { courseId: course.id, artifactId: artifacts[1].id }, 5, 5)
    ]);

    const published = await firstClient.courseAiArtifact.findMany({
      where: { seriesId, status: "PUBLISHED" }, select: { id: true }
    });
    expect(published).toHaveLength(1);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    for (const result of results) {
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(ArtifactWorkflowError);
        expect(result.reason).toMatchObject({ code: "ARTIFACT_PUBLISH_CONFLICT", retryable: true });
      }
    }
  }, 20_000);
});
