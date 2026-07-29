import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth";

const authState = vi.hoisted(() => ({ user: null as SessionUser | null }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    requireUser: async () => {
      if (!authState.user) throw new Error("测试用户未设置");
      return authState.user;
    }
  };
});

import { db } from "@/lib/db";
import { bindCourseDriveRoot } from "@/lib/courseDrive/service";
import { GET as getSettings, PUT as putSettings } from "../../src/app/api/courses/[courseId]/copilot/settings/route";
import { GET as getDriveRoot, POST as mutateDriveRoot } from "../../src/app/api/courses/[courseId]/drive-root/route";

let institutionId = "";
let owner: SessionUser;
let collaborator: SessionUser;
let student: SessionUser;
let admin: SessionUser;
let mainCourseId = "";
let emptyCourseId = "";
let aiCourseId = "";
let rootAId = "";
let rootBId = "";
let firstBindFolderId = "";
let aiRootId = "";
let aiTargetId = "";

const settingsContext = (courseId: string) => ({ params: Promise.resolve({ courseId }) });

beforeAll(async () => {
  const suffix = randomUUID();
  const institution = await db.institution.create({ data: { name: `根目录权限测试-${suffix}` } });
  institutionId = institution.id;
  const [ownerRow, collaboratorRow, studentRow, adminRow] = await Promise.all([
    db.user.create({ data: { name: "课程所有者", email: `root-owner-${suffix}@test.local`, role: "TEACHER", institutionId } }),
    db.user.create({ data: { name: "协作教师", email: `root-collab-${suffix}@test.local`, role: "TEACHER", institutionId } }),
    db.user.create({ data: { name: "学生", email: `root-student-${suffix}@test.local`, role: "STUDENT", institutionId } }),
    db.user.create({ data: { name: "管理员", email: `root-admin-${suffix}@test.local`, role: "ADMIN", institutionId } })
  ]);
  owner = { id: ownerRow.id, name: ownerRow.name, role: "TEACHER", institutionId };
  collaborator = { id: collaboratorRow.id, name: collaboratorRow.name, role: "TEACHER", institutionId };
  student = { id: studentRow.id, name: studentRow.name, role: "STUDENT", institutionId };
  admin = { id: adminRow.id, name: adminRow.name, role: "ADMIN", institutionId };

  const [mainCourse, emptyCourse, aiCourse] = await Promise.all([
    db.course.create({ data: { title: "有导入资料的课程", ownerId: owner.id, institutionId, copilotName: "原 Copilot 名称" } }),
    db.course.create({ data: { title: "首次绑定课程", ownerId: owner.id, institutionId } }),
    db.course.create({ data: { title: "有 AI 导出的课程", ownerId: owner.id, institutionId } })
  ]);
  mainCourseId = mainCourse.id;
  emptyCourseId = emptyCourse.id;
  aiCourseId = aiCourse.id;

  const [rootA, rootB, firstBindFolder, aiRoot, aiTarget] = await Promise.all([
    db.driveFile.create({ data: { ownerId: owner.id, name: "课程根 A", kind: "folder" } }),
    db.driveFile.create({ data: { ownerId: owner.id, name: "备选根 B", kind: "folder" } }),
    db.driveFile.create({ data: { ownerId: owner.id, name: "首次绑定文件夹", kind: "folder" } }),
    db.driveFile.create({ data: { ownerId: owner.id, name: "AI 课程根", kind: "folder" } }),
    db.driveFile.create({ data: { ownerId: owner.id, name: "AI 备选根", kind: "folder" } })
  ]);
  rootAId = rootA.id;
  rootBId = rootB.id;
  firstBindFolderId = firstBindFolder.id;
  aiRootId = aiRoot.id;
  aiTargetId = aiTarget.id;

  const levelOne = await db.driveFile.create({
    data: { ownerId: owner.id, parentId: rootA.id, name: "一级目录", kind: "folder" }
  });
  const levelTwo = await db.driveFile.create({
    data: { ownerId: owner.id, parentId: levelOne.id, name: "二级目录", kind: "folder" }
  });
  const importedFile = await db.driveFile.create({
    data: { ownerId: owner.id, parentId: levelTwo.id, name: "深层导入资料.md", kind: "file", path: "test://deep-import" }
  });
  const aiFile = await db.driveFile.create({
    data: { ownerId: owner.id, parentId: aiRoot.id, name: "AI 导出.pptx", kind: "file", path: "test://ai-export" }
  });

  await Promise.all([
    db.course.update({ where: { id: mainCourseId }, data: { driveRootFolderId: rootA.id } }),
    db.course.update({ where: { id: aiCourseId }, data: { driveRootFolderId: aiRoot.id } }),
    db.courseCollaborator.create({ data: { courseId: mainCourseId, userId: collaborator.id, role: "EDITOR" } }),
    db.courseCollaborator.create({ data: { courseId: emptyCourseId, userId: collaborator.id, role: "EDITOR" } }),
    db.documentImportJob.create({
      data: {
        courseId: mainCourseId,
        userId: owner.id,
        status: "READY_FOR_REVIEW",
        originalName: importedFile.name,
        driveFileId: importedFile.id
      }
    })
  ]);
  const artifact = await db.courseAiArtifact.create({
    data: { courseId: aiCourseId, userId: owner.id, appType: "ppt_courseware", title: "AI 课件导出" }
  });
  await db.courseAiArtifactExport.create({
    data: { artifactId: artifact.id, format: "pptx", variant: "default", driveFileId: aiFile.id }
  });
});

afterAll(async () => {
  if (institutionId) await db.institution.deleteMany({ where: { id: institutionId } });
  await db.$disconnect();
});

describe("course drive root binding authorization and references", () => {
  it("allows a collaborator to update only the Copilot name through the API", async () => {
    authState.user = collaborator;
    const response = await putSettings(new Request("http://localhost/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copilotName: "协作教师命名的助手" })
    }), settingsContext(mainCourseId));

    expect(response.status).toBe(200);
    await expect(db.course.findUniqueOrThrow({ where: { id: mainCourseId } }))
      .resolves.toMatchObject({ copilotName: "协作教师命名的助手", driveRootFolderId: rootAId });
  });

  it("rejects collaborator root binding in both the API and service layer", async () => {
    authState.user = collaborator;
    const response = await putSettings(new Request("http://localhost/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: rootBId })
    }), settingsContext(mainCourseId));

    expect(response.status).toBe(403);
    await expect(bindCourseDriveRoot(collaborator, mainCourseId, rootBId))
      .rejects.toMatchObject({ status: 403, code: "COURSE_DRIVE_OWNER_REQUIRED" });
    await expect(db.course.findUniqueOrThrow({ where: { id: mainCourseId } }))
      .resolves.toMatchObject({ driveRootFolderId: rootAId });
  });

  it("rejects students and permits administrators at owner level", async () => {
    await expect(bindCourseDriveRoot(student, mainCourseId, rootBId))
      .rejects.toMatchObject({ status: 403, code: "COURSE_DRIVE_OWNER_REQUIRED" });
    await expect(bindCourseDriveRoot(admin, mainCourseId, rootAId))
      .resolves.toMatchObject({ root: { id: rootAId }, rebound: false });
  });

  it("allows the owner to bind an unconfigured course for the first time", async () => {
    await expect(bindCourseDriveRoot(owner, emptyCourseId, firstBindFolderId))
      .resolves.toMatchObject({ root: { id: firstBindFolderId }, rebound: false });
    await expect(db.course.findUniqueOrThrow({ where: { id: emptyCourseId } }))
      .resolves.toMatchObject({ driveRootFolderId: firstBindFolderId });
  });

  it("keeps binding the same referenced root idempotent", async () => {
    await expect(bindCourseDriveRoot(owner, mainCourseId, rootAId))
      .resolves.toMatchObject({ root: { id: rootAId }, rebound: false });
  });

  it("blocks rebind when a deep descendant has an active import reference", async () => {
    await expect(bindCourseDriveRoot(owner, mainCourseId, rootBId))
      .rejects.toMatchObject({ status: 409, code: "COURSE_DRIVE_REBIND_BLOCKED" });
    await expect(db.course.findUniqueOrThrow({ where: { id: mainCourseId } }))
      .resolves.toMatchObject({ driveRootFolderId: rootAId });
  });

  it("blocks rebind when the old root contains an active AI artifact export", async () => {
    await expect(bindCourseDriveRoot(owner, aiCourseId, aiTargetId))
      .rejects.toMatchObject({ status: 409, code: "COURSE_DRIVE_REBIND_BLOCKED" });
    await expect(db.course.findUniqueOrThrow({ where: { id: aiCourseId } }))
      .resolves.toMatchObject({ driveRootFolderId: aiRootId });
  });

  it("rolls back the Copilot name when a combined owner rebind is blocked", async () => {
    authState.user = owner;
    const before = await db.course.findUniqueOrThrow({ where: { id: mainCourseId } });
    const response = await putSettings(new Request("http://localhost/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: rootBId, copilotName: "被错误保存的名称" })
    }), settingsContext(mainCourseId));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "COURSE_DRIVE_REBIND_BLOCKED" });
    await expect(db.course.findUniqueOrThrow({ where: { id: mainCourseId } }))
      .resolves.toMatchObject({ driveRootFolderId: rootAId, copilotName: before.copilotName });
  });

  it("returns current settings but no owner folders to a collaborator", async () => {
    authState.user = collaborator;
    const response = await getSettings(new Request("http://localhost/settings"), settingsContext(mainCourseId));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      folderId: rootAId,
      copilotName: "协作教师命名的助手",
      folders: [],
      canBindRoot: false,
      analytics: { calls: 0, activeUsers: 0, success: 0, failed: 0 }
    });
  });

  it("returns bindable folders to the owner without leaking them to collaborators", async () => {
    authState.user = owner;
    const response = await getSettings(new Request("http://localhost/settings"), settingsContext(mainCourseId));
    expect(response.status).toBe(200);
    const body = await response.json() as { folders: Array<{ id: string }>; canBindRoot: boolean };
    expect(body.canBindRoot).toBe(true);
    expect(body.folders.map((folder) => folder.id)).toContain(rootBId);
  });

  it("keeps administrator access to settings and owner-level binding", async () => {
    authState.user = admin;
    const getResponse = await getSettings(new Request("http://localhost/settings"), settingsContext(mainCourseId));
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({ canBindRoot: true, folderId: rootAId });

    const putResponse = await putSettings(new Request("http://localhost/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: rootAId })
    }), settingsContext(mainCourseId));
    expect(putResponse.status).toBe(200);
  });

  it("blocks rebind when the old root contains an unreferenced active upload", async () => {
    const course = await db.course.create({ data: { title: "普通上传课程", ownerId: owner.id, institutionId } });
    const [oldRoot, target] = await Promise.all([
      db.driveFile.create({ data: { ownerId: owner.id, name: "普通上传旧根", kind: "folder" } }),
      db.driveFile.create({ data: { ownerId: owner.id, name: "普通上传新根", kind: "folder" } })
    ]);
    await db.driveFile.create({
      data: { ownerId: owner.id, parentId: oldRoot.id, name: "普通上传.txt", kind: "file", path: "test://plain-upload" }
    });
    await db.course.update({ where: { id: course.id }, data: { driveRootFolderId: oldRoot.id } });

    await expect(bindCourseDriveRoot(owner, course.id, target.id))
      .rejects.toMatchObject({ status: 409, code: "COURSE_DRIVE_REBIND_BLOCKED" });
  });

  it("hides root candidates and rejects first root creation for a collaborator", async () => {
    const unbound = await db.course.create({ data: { title: "协作教师不可首绑", ownerId: owner.id, institutionId } });
    await db.courseCollaborator.create({ data: { courseId: unbound.id, userId: collaborator.id, role: "EDITOR" } });
    authState.user = collaborator;

    const getResponse = await getDriveRoot(new Request("http://localhost/drive-root") as never, settingsContext(unbound.id));
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({ root: null, folders: [], canBindRoot: false });

    const createResponse = await mutateDriveRoot(new Request("http://localhost/drive-root", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create" })
    }) as never, settingsContext(unbound.id));
    expect(createResponse.status).toBe(403);
    await expect(db.course.findUniqueOrThrow({ where: { id: unbound.id } }))
      .resolves.toMatchObject({ driveRootFolderId: null });
  });

  it("does not treat a soft-deleted import record as an active reference", async () => {
    const course = await db.course.create({ data: { title: "软删除导入课程", ownerId: owner.id, institutionId } });
    const [oldRoot, target] = await Promise.all([
      db.driveFile.create({ data: { ownerId: owner.id, name: "软删旧根", kind: "folder" } }),
      db.driveFile.create({ data: { ownerId: owner.id, name: "软删新根", kind: "folder" } })
    ]);
    const file = await db.driveFile.create({
      data: { ownerId: owner.id, parentId: oldRoot.id, name: "已删除导入.md", kind: "file", path: "test://deleted-import" }
    });
    await db.course.update({ where: { id: course.id }, data: { driveRootFolderId: oldRoot.id } });
    await db.documentImportJob.create({
      data: {
        courseId: course.id,
        userId: owner.id,
        originalName: file.name,
        driveFileId: file.id,
        deletedAt: new Date()
      }
    });
    await db.driveFile.update({ where: { id: file.id }, data: { deletedAt: new Date() } });

    await expect(bindCourseDriveRoot(owner, course.id, target.id))
      .resolves.toMatchObject({ root: { id: target.id }, rebound: true });
  });
});
