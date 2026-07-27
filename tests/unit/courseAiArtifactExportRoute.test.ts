import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireCourseOwner: vi.fn(),
  findArtifact: vi.fn(),
  findExport: vi.fn(),
  findQuestions: vi.fn(),
  driveFileCreate: vi.fn(),
  driveFileUpdate: vi.fn(),
  exportUpsert: vi.fn(),
  ensurePurposeFolder: vi.fn(),
  storeDriveFile: vi.fn(),
  deleteDriveFileFromStorage: vi.fn(),
  generateDocx: vi.fn(),
  generatePptx: vi.fn(),
  readFile: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/permissions", () => ({ requireCourseOwner: mocks.requireCourseOwner }));
vi.mock("@/lib/db", () => ({
  db: {
    courseAiArtifact: { findFirst: mocks.findArtifact },
    courseAiArtifactExport: { findUnique: mocks.findExport },
    courseQuestion: { findMany: mocks.findQuestions },
    $transaction: vi.fn(async (callback) => callback({
      driveFile: {
        create: mocks.driveFileCreate,
        update: mocks.driveFileUpdate
      },
      courseAiArtifactExport: { upsert: mocks.exportUpsert }
    }))
  }
}));
vi.mock("@/lib/courseDrive/service", () => ({
  CourseDriveError: class CourseDriveError extends Error {
    constructor(
      message: string,
      readonly status = 400,
      readonly code = "COURSE_DRIVE_ERROR"
    ) {
      super(message);
    }
  },
  ensureCoursePurposeFolder: mocks.ensurePurposeFolder
}));
vi.mock("@/lib/modules/driveFiles", () => ({
  storeDriveFile: mocks.storeDriveFile,
  deleteDriveFileFromStorage: mocks.deleteDriveFileFromStorage
}));
vi.mock("@/lib/courseWorkspace/exports/generateArtifactDocx", () => ({
  generateArtifactDocx: mocks.generateDocx
}));
vi.mock("@/lib/courseWorkspace/exports/generateArtifactPptx", () => ({
  generateArtifactPptx: mocks.generatePptx
}));
vi.mock("fs/promises", () => ({ readFile: mocks.readFile }));

import { POST } from "../../src/app/api/courses/[courseId]/ai-artifacts/[artifactId]/export/route";

const context = {
  params: Promise.resolve({ courseId: "course-1", artifactId: "artifact-1" })
};
const lessonPayload = {
  objectives: ["理解核心概念"],
  keyPoints: ["关键知识点"],
  teachingProcess: [{ phase: "导入", minutes: 10, activity: "情境讨论" }],
  assessment: ["课堂练习"]
};

function exportRequest(format: "DOCX" | "PPTX", variant: "DEFAULT" | "STUDENT" | "TEACHER") {
  return new Request("http://localhost/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format, variant })
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({
    id: "teacher-1",
    name: "李老师",
    role: "TEACHER",
    institutionId: "institution-1"
  });
  mocks.requireCourseOwner.mockResolvedValue({
    id: "course-1",
    ownerId: "teacher-1",
    title: "产品设计"
  });
  mocks.findArtifact.mockResolvedValue({
    id: "artifact-1",
    appType: "lesson_plan",
    title: "第一讲：需求洞察",
    payload: JSON.stringify(lessonPayload)
  });
  mocks.findExport.mockResolvedValue(null);
  mocks.ensurePurposeFolder.mockResolvedValue({ id: "folder-1", ownerId: "teacher-1" });
  mocks.storeDriveFile.mockResolvedValue("D:/uploads/lesson.docx");
  mocks.deleteDriveFileFromStorage.mockResolvedValue(undefined);
  mocks.generateDocx.mockResolvedValue(Buffer.from("docx-bytes"));
  mocks.driveFileCreate.mockResolvedValue({
    id: "drive-file-1",
    kind: "file",
    name: "第一讲：需求洞察.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    path: "D:/uploads/lesson.docx"
  });
  mocks.exportUpsert.mockResolvedValue({ id: "export-1" });
});

describe("POST AI artifact export", () => {
  it("returns binary DOCX and persists it under the stable export key", async () => {
    const response = await POST(exportRequest("DOCX", "DEFAULT"), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(response.headers.get("content-disposition")).toContain(
      encodeURIComponent("第一讲：需求洞察.docx")
    );
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("docx-bytes");
    expect(mocks.ensurePurposeFolder).toHaveBeenCalledWith(
      expect.objectContaining({ id: "teacher-1" }),
      "course-1",
      "AI_LESSON_PLAN_OUTPUT"
    );
    expect(mocks.exportUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        artifactId_format_variant: {
          artifactId: "artifact-1",
          format: "DOCX",
          variant: "DEFAULT"
        }
      },
      create: expect.objectContaining({
        driveFileId: "drive-file-1",
        status: "READY"
      })
    }));
  });

  it("updates the existing DriveFile row instead of creating a second row", async () => {
    mocks.findExport.mockResolvedValue({
      driveFileId: "drive-file-1",
      driveFile: {
        id: "drive-file-1",
        kind: "file",
        name: "旧教案.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        path: "D:/uploads/old.docx"
      }
    });
    mocks.driveFileUpdate.mockResolvedValue({
      id: "drive-file-1",
      kind: "file",
      name: "第一讲：需求洞察.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      path: "D:/uploads/lesson.docx"
    });

    const response = await POST(exportRequest("DOCX", "DEFAULT"), context);

    expect(response.status).toBe(200);
    expect(mocks.driveFileUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "drive-file-1" }
    }));
    expect(mocks.driveFileCreate).not.toHaveBeenCalled();
    expect(mocks.deleteDriveFileFromStorage).toHaveBeenCalledWith(
      expect.objectContaining({ path: "D:/uploads/old.docx" })
    );
  });

  it("serializes concurrent first exports onto one stable DriveFile row", async () => {
    let exportRow: {
      driveFileId: string;
      driveFile: {
        id: string;
        kind: string;
        name: string;
        mimeType: string;
        path: string;
      };
    } | null = null;
    const driveFile = {
      id: "drive-file-stable",
      kind: "file",
      name: "第一讲：需求洞察.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      path: "D:/uploads/stable.docx"
    };
    mocks.findExport.mockImplementation(async () => exportRow);
    mocks.driveFileCreate.mockImplementation(async () => driveFile);
    mocks.driveFileUpdate.mockImplementation(async () => driveFile);
    mocks.exportUpsert.mockImplementation(async () => {
      exportRow = { driveFileId: driveFile.id, driveFile };
      return { id: "export-1" };
    });

    const [first, second] = await Promise.all([
      POST(exportRequest("DOCX", "DEFAULT"), context),
      POST(exportRequest("DOCX", "DEFAULT"), context)
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mocks.driveFileCreate).toHaveBeenCalledOnce();
    expect(mocks.driveFileUpdate).toHaveBeenCalledOnce();
    expect(mocks.exportUpsert).toHaveBeenCalledTimes(2);
  });

  it("rejects unsupported format and variant combinations before writing files", async () => {
    const response = await POST(exportRequest("DOCX", "STUDENT"), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "ARTIFACT_EXPORT_UNSUPPORTED"
    });
    expect(mocks.generateDocx).not.toHaveBeenCalled();
    expect(mocks.storeDriveFile).not.toHaveBeenCalled();
  });
});
