import { PrismaClient, type Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { ArtifactRevisionStore } from "@/lib/courseWorkspace/artifactRevision";
import type { MutableArtifactStore } from "@/lib/courseWorkspace/artifactRevision";
import type { ArtifactWorkflowStore, ArtifactWorkflowTransaction } from "@/lib/courseWorkspace/artifactWorkflow";
import { safeAiArtifactSelect, type SafeAiArtifactRecord } from "@/lib/courseWorkspace/aiGenerationQueue";

function revisionTransaction(tx: Prisma.TransactionClient) {
  return {
    findSourceByCourse: (input: { id: string; courseId: string }) => tx.courseAiArtifact.findFirst({
      where: input,
      select: {
        id: true,
        seriesId: true,
        courseId: true,
        userId: true,
        appType: true,
        title: true,
        prompt: true,
        payload: true,
        inputSnapshot: true,
        scope: true,
        sourceJobId: true,
        status: true,
        version: true
      }
    }),
    findSeriesMaxVersion: async (input: { courseId: string; seriesId: string }) => {
      const result = await tx.courseAiArtifact.aggregate({
        where: input,
        _max: { version: true }
      });
      return result._max.version;
    },
    create: (data: Parameters<Prisma.TransactionClient["courseAiArtifact"]["create"]>[0]["data"]) => tx.courseAiArtifact.create({
      data,
      select: safeAiArtifactSelect
    })
  };
}

export function createPrismaArtifactRevisionStore(client: PrismaClient = db): ArtifactRevisionStore<SafeAiArtifactRecord> {
  return {
    transaction: (operation) => client.$transaction((tx) => operation(revisionTransaction(tx)))
  };
}

export function createPrismaMutableArtifactStore(
  client: PrismaClient = db
): MutableArtifactStore<SafeAiArtifactRecord> {
  return {
    findByCourse: (input) => client.courseAiArtifact.findFirst({
      where: input,
      select: {
        id: true,
        courseId: true,
        status: true,
        payload: true,
        lockVersion: true,
        deletedAt: true
      }
    }),
    async updateWorkingCopy(input) {
      const updated = await client.courseAiArtifact.updateMany({
        where: {
          id: input.id,
          courseId: input.courseId,
          deletedAt: null,
          lockVersion: input.expectedLockVersion,
          status: { in: ["DRAFT", "APPROVED", "PUBLISHED"] },
          payload: { not: null }
        },
        data: {
          title: input.title,
          payload: input.payload,
          status: input.nextStatus,
          approvedAt: input.nextStatus === "DRAFT" ? null : undefined,
          lockVersion: { increment: 1 }
        }
      });
      if (updated.count !== 1) return null;
      return client.courseAiArtifact.findFirst({
        where: { id: input.id, courseId: input.courseId, deletedAt: null },
        select: safeAiArtifactSelect
      });
    }
  };
}

function workflowTransaction(tx: Prisma.TransactionClient): ArtifactWorkflowTransaction<SafeAiArtifactRecord> {
  return {
    findArtifact: (input) => tx.courseAiArtifact.findFirst({
      where: input,
      select: {
        id: true,
        courseId: true,
        seriesId: true,
        sourceArtifactId: true,
        appType: true,
        status: true,
        payload: true,
        publishedPayload: true,
        lockVersion: true,
        deletedAt: true
      }
    }),
    findApprovedQuestionIds: async (courseId, ids) => {
      const rows = await tx.courseQuestion.findMany({
        where: { courseId, id: { in: ids }, status: "APPROVED" },
        select: { id: true }
      });
      return rows.map((row) => row.id);
    },
    findSourceCourseware: (input) => tx.courseAiArtifact.findFirst({
      where: input,
      select: { id: true, courseId: true, appType: true, status: true, payload: true }
    }),
    approveArtifact: async (id, courseId, approvedAt) => {
      const result = await tx.courseAiArtifact.updateMany({
        where: { id, courseId, status: "DRAFT", payload: { not: null } },
        data: { status: "APPROVED", approvedAt }
      });
      return result.count;
    },
    approveWorkingArtifact: async (id, courseId, approvedAt, expectedLockVersion) => {
      const result = await tx.courseAiArtifact.updateMany({
        where: {
          id,
          courseId,
          deletedAt: null,
          status: "DRAFT",
          payload: { not: null },
          ...(expectedLockVersion === undefined ? {} : { lockVersion: expectedLockVersion })
        },
        data: { status: "APPROVED", approvedAt, lockVersion: { increment: 1 } }
      });
      return result.count;
    },
    upsertQuestion: async (data) => {
      const { courseId, sourceSeriesId, sourceKey, ...values } = data;
      await tx.courseQuestion.upsert({
        where: { courseId_sourceSeriesId_sourceKey: { courseId, sourceSeriesId, sourceKey } },
        create: { courseId, sourceSeriesId, sourceKey, ...values },
        update: { ...values, version: { increment: 1 } }
      });
    },
    archiveQuestionsExcept: async (courseId, sourceSeriesId, sourceKeys) => {
      await tx.courseQuestion.updateMany({
        where: {
          courseId,
          sourceSeriesId,
          sourceKey: { notIn: sourceKeys },
          status: { not: "ARCHIVED" }
        },
        data: { status: "ARCHIVED", approvedAt: null }
      });
    },
    archivePublishedInSeries: async (courseId, seriesId, exceptId) => {
      await tx.courseAiArtifact.updateMany({
        where: { courseId, seriesId, status: "PUBLISHED", id: { not: exceptId } },
        data: { status: "ARCHIVED" }
      });
    },
    publishArtifact: async (id, courseId, publishedAt) => {
      const result = await tx.courseAiArtifact.updateMany({
        where: { id, courseId, status: "APPROVED" },
        data: { status: "PUBLISHED", publishedAt }
      });
      return result.count;
    },
    publishWorkingArtifact: async (id, courseId, publishedAt, payload, expectedLockVersion) => {
      const result = await tx.courseAiArtifact.updateMany({
        where: {
          id,
          courseId,
          deletedAt: null,
          status: "APPROVED",
          payload: { not: null },
          ...(expectedLockVersion === undefined ? {} : { lockVersion: expectedLockVersion })
        },
        data: {
          status: "PUBLISHED",
          publishedPayload: payload,
          publishedAt,
          withdrawnAt: null,
          lockVersion: { increment: 1 }
        }
      });
      return result.count;
    },
    confirmPublishedUpdate: async (id, courseId, publishedAt, payload, expectedLockVersion) => {
      const result = await tx.courseAiArtifact.updateMany({
        where: {
          id,
          courseId,
          deletedAt: null,
          status: "PUBLISHED",
          lockVersion: expectedLockVersion,
          payload: { not: null }
        },
        data: {
          publishedPayload: payload,
          publishedAt,
          lockVersion: { increment: 1 }
        }
      });
      return result.count;
    },
    withdrawPublishedArtifact: async (id, courseId, withdrawnAt, expectedLockVersion) => {
      const result = await tx.courseAiArtifact.updateMany({
        where: { id, courseId, deletedAt: null, status: "PUBLISHED", lockVersion: expectedLockVersion },
        data: {
          status: "APPROVED",
          withdrawnAt,
          lockVersion: { increment: 1 }
        }
      });
      return result.count;
    },
    softDeleteArtifact: async (id, courseId, deletedAt, expectedLockVersion) => {
      const result = await tx.courseAiArtifact.updateMany({
        where: {
          id,
          courseId,
          deletedAt: null,
          status: { not: "PUBLISHED" },
          lockVersion: expectedLockVersion
        },
        data: { deletedAt, lockVersion: { increment: 1 } }
      });
      return result.count;
    },
    findSafeArtifact: (id, courseId) => tx.courseAiArtifact.findFirst({
      where: { id, courseId },
      select: safeAiArtifactSelect
    })
  };
}

export function createPrismaArtifactWorkflowStore(client: PrismaClient = db): ArtifactWorkflowStore<SafeAiArtifactRecord> {
  return {
    transaction: (operation) => client.$transaction((tx) => operation(workflowTransaction(tx)))
  };
}
