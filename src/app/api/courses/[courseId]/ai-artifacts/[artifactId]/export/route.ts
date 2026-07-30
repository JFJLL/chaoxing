import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseManager } from "@/lib/permissions";
import { CourseDriveError, ensureCoursePurposeFolder } from "@/lib/courseDrive/service";
import type { CourseDrivePurpose } from "@/lib/courseDrive/constants";
import {
  deleteDriveFileFromStorage,
  storeDriveFile,
  type DriveFileStorageRecord
} from "@/lib/modules/driveFiles";
import { parseStoredArtifactPayload } from "@/lib/courseWorkspace/artifactPayload";
import { generateArtifactDocx } from "@/lib/courseWorkspace/exports/generateArtifactDocx";
import { generatePlainCoursewarePptx } from "@/lib/courseWorkspace/exports/plainCoursewarePptx";
import type {
  AiCoursewarePayload,
  AiLessonPlanPayload,
  AiPaperPayload,
  AiQuestionPayload
} from "@/types/courseWorkspace";

type RouteContext = { params: Promise<{ courseId: string; artifactId: string }> };

const exportSchema = z.object({
  format: z.enum(["DOCX", "PPTX"]),
  variant: z.enum(["DEFAULT", "STUDENT", "TEACHER"])
}).strict();

const MIME_TYPES = {
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  PPTX: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
} as const;

const exportLocks = new Map<string, Promise<void>>();

async function withExportLock<T>(key: string, operation: () => Promise<T>) {
  const previous = exportLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => gate);
  exportLocks.set(key, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (exportLocks.get(key) === tail) exportLocks.delete(key);
  }
}

function fileBaseName(title: string) {
  const normalized = title.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/\s+/g, " ");
  return normalized.slice(0, 120) || "AI产物";
}

function exportDescriptor(appType: string, format: "DOCX" | "PPTX", variant: "DEFAULT" | "STUDENT" | "TEACHER") {
  if (appType === "ppt_courseware") {
    if (format !== "PPTX" || variant !== "DEFAULT") return null;
    return { purpose: "AI_PPT_OUTPUT" as CourseDrivePurpose, suffix: "", extension: "pptx" };
  }
  if (format !== "DOCX") return null;
  if (appType === "question_generation") {
    if (variant === "DEFAULT") return null;
    return { purpose: "AI_QUESTION_OUTPUT" as CourseDrivePurpose, suffix: variant === "STUDENT" ? "（学生版）" : "（教师版）", extension: "docx" };
  }
  if (appType === "paper_assembly") {
    if (variant === "DEFAULT") return null;
    return { purpose: "AI_PAPER_OUTPUT" as CourseDrivePurpose, suffix: variant === "STUDENT" ? "（学生版）" : "（教师版）", extension: "docx" };
  }
  if (variant !== "DEFAULT") return null;
  if (appType === "lesson_plan") {
    return { purpose: "AI_LESSON_PLAN_OUTPUT" as CourseDrivePurpose, suffix: "", extension: "docx" };
  }
  if (appType === "courseware") {
    return { purpose: "AI_COURSEWARE_OUTPUT" as CourseDrivePurpose, suffix: "", extension: "docx" };
  }
  return null;
}

function paperQuestionIds(payload: AiPaperPayload) {
  return [...new Set(payload.sections.flatMap((section) => section.questionIds))];
}

function parseOptions(value: string | null) {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function generateBytes(input: {
  appType: string;
  title: string;
  courseTitle: string;
  payload: unknown;
  format: "DOCX" | "PPTX";
  variant: "DEFAULT" | "STUDENT" | "TEACHER";
  courseId: string;
}) {
  if (input.format === "PPTX") {
    // Export mirrors the on-screen preview (plain title + bullets + logo) rather
    // than nesting content into the decorated template.
    return generatePlainCoursewarePptx({ payload: input.payload as AiCoursewarePayload });
  }

  const variant = input.variant.toLowerCase() as "default" | "student" | "teacher";
  if (input.appType === "lesson_plan") {
    return generateArtifactDocx({
      appType: "lesson_plan",
      title: input.title,
      courseTitle: input.courseTitle,
      payload: input.payload as AiLessonPlanPayload
    });
  }
  if (input.appType === "courseware") {
    return generateArtifactDocx({
      appType: "courseware",
      title: input.title,
      courseTitle: input.courseTitle,
      payload: input.payload as AiCoursewarePayload
    });
  }
  if (input.appType === "question_generation") {
    return generateArtifactDocx({
      appType: "question_generation",
      title: input.title,
      courseTitle: input.courseTitle,
      payload: input.payload as AiQuestionPayload,
      variant: variant as "student" | "teacher"
    });
  }

  const paper = input.payload as AiPaperPayload;
  const ids = paperQuestionIds(paper);
  const rows = await db.courseQuestion.findMany({
    where: { courseId: input.courseId, id: { in: ids } },
    select: {
      id: true,
      type: true,
      stem: true,
      options: true,
      answer: true,
      explanation: true
    }
  });
  if (rows.length !== ids.length) {
    throw new CourseDriveError("试卷引用的部分题目已不存在，无法导出", 409, "ARTIFACT_EXPORT_QUESTION_MISSING");
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  return generateArtifactDocx({
    appType: "paper_assembly",
    title: input.title,
    courseTitle: input.courseTitle,
    payload: paper,
    variant: variant as "student" | "teacher",
    questions: ids.map((id) => {
      const row = byId.get(id)!;
      return {
        id: row.id,
        type: row.type as "single_choice" | "multiple_choice" | "short_answer",
        stem: row.stem,
        ...(parseOptions(row.options) ? { options: parseOptions(row.options) } : {}),
        answer: row.answer,
        explanation: row.explanation
      };
    })
  });
}

async function persistExportUnlocked(input: {
  artifactId: string;
  format: "DOCX" | "PPTX";
  variant: "DEFAULT" | "STUDENT" | "TEACHER";
  ownerId: string;
  parentId: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}) {
  const existing = await db.courseAiArtifactExport.findUnique({
    where: {
      artifactId_format_variant: {
        artifactId: input.artifactId,
        format: input.format,
        variant: input.variant
      }
    },
    include: { driveFile: true }
  });
  const previousStorage: DriveFileStorageRecord | null = existing?.driveFile
    ? {
        id: existing.driveFile.id,
        kind: existing.driveFile.kind,
        name: existing.driveFile.name,
        mimeType: existing.driveFile.mimeType,
        path: existing.driveFile.path
      }
    : null;
  const path = await storeDriveFile({
    ownerId: input.ownerId,
    fileName: input.fileName,
    bytes: input.bytes,
    mimeType: input.mimeType
  });
  const contentHash = createHash("sha256").update(input.bytes).digest("hex");

  try {
    const driveFile = await db.$transaction(async (tx) => {
      const file = existing?.driveFileId
        ? await tx.driveFile.update({
            where: { id: existing.driveFileId },
            data: {
              ownerId: input.ownerId,
              parentId: input.parentId,
              name: input.fileName,
              kind: "file",
              mimeType: input.mimeType,
              size: input.bytes.length,
              path,
              contentHash,
              deletedAt: null
            }
          })
        : await tx.driveFile.create({
            data: {
              id: `artifact-export-${createHash("sha256")
                .update(`${input.artifactId}:${input.format}:${input.variant}`)
                .digest("hex")
                .slice(0, 32)}`,
              ownerId: input.ownerId,
              parentId: input.parentId,
              name: input.fileName,
              kind: "file",
              mimeType: input.mimeType,
              size: input.bytes.length,
              path,
              contentHash
            }
          });
      await tx.courseAiArtifactExport.upsert({
        where: {
          artifactId_format_variant: {
            artifactId: input.artifactId,
            format: input.format,
            variant: input.variant
          }
        },
        create: {
          artifactId: input.artifactId,
          format: input.format,
          variant: input.variant,
          driveFileId: file.id,
          contentHash,
          status: "READY",
          lastExportedAt: new Date()
        },
        update: {
          driveFileId: file.id,
          contentHash,
          status: "READY",
          errorMessage: null,
          lastExportedAt: new Date()
        }
      });
      return file;
    });
    if (previousStorage?.path && previousStorage.path !== path) {
      await deleteDriveFileFromStorage(previousStorage).catch(() => undefined);
    }
    return driveFile;
  } catch (error) {
    await deleteDriveFileFromStorage({
      kind: "file",
      name: input.fileName,
      mimeType: input.mimeType,
      path
    }).catch(() => undefined);
    throw error;
  }
}

async function persistExport(input: Parameters<typeof persistExportUnlocked>[0]) {
  const key = `${input.artifactId}:${input.format}:${input.variant}`;
  return withExportLock(key, () => persistExportUnlocked(input));
}

export async function POST(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { courseId, artifactId } = await context.params;
  let course;
  try {
    course = await requireCourseManager(user, courseId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权管理课程" }, { status: 403 });
  }

  const parsed = exportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_REQUEST", error: "导出格式无效" }, { status: 400 });
  }

  const artifact = await db.courseAiArtifact.findFirst({
    where: { id: artifactId, courseId, deletedAt: null, payload: { not: null } },
    select: { id: true, appType: true, title: true, payload: true }
  });
  if (!artifact?.payload) {
    return NextResponse.json({ code: "ARTIFACT_NOT_FOUND", error: "AI 产物不存在或尚未生成完成" }, { status: 404 });
  }
  const descriptor = exportDescriptor(artifact.appType, parsed.data.format, parsed.data.variant);
  if (!descriptor) {
    return NextResponse.json({ code: "ARTIFACT_EXPORT_UNSUPPORTED", error: "该产物不支持所选导出格式" }, { status: 400 });
  }

  try {
    const payload = parseStoredArtifactPayload(artifact.appType, artifact.payload);
    const bytes = await generateBytes({
      appType: artifact.appType,
      title: artifact.title,
      courseTitle: course.title,
      payload,
      format: parsed.data.format,
      variant: parsed.data.variant,
      courseId
    });
    const folder = await ensureCoursePurposeFolder(user, courseId, descriptor.purpose);
    const fileName = `${fileBaseName(artifact.title)}${descriptor.suffix}.${descriptor.extension}`;
    await persistExport({
      artifactId: artifact.id,
      format: parsed.data.format,
      variant: parsed.data.variant,
      ownerId: course.ownerId,
      parentId: folder.id,
      fileName,
      mimeType: MIME_TYPES[parsed.data.format],
      bytes
    });
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": MIME_TYPES[parsed.data.format],
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    if (error instanceof CourseDriveError) {
      return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
    }
    console.error("[artifact-export]", error);
    return NextResponse.json({ code: "ARTIFACT_EXPORT_FAILED", error: "导出失败，请重试" }, { status: 500 });
  }
}
