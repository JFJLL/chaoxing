import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createCourseDriveFolder,
  deleteCourseDriveItem,
  updateCourseDriveItem
} from "@/lib/courseDrive/service";

let institutionId = "";
let otherInstitutionId = "";
let ownerId = "";
let courseId = "";
let otherCourseId = "";
let rootId = "";
let nestedFolderId = "";
let otherRootId = "";
let collaborator: SessionUser;
let externalCollaborator: SessionUser;

beforeAll(async () => {
  const suffix = randomUUID();
  const [institution, otherInstitution] = await Promise.all([
    db.institution.create({ data: { name: `课程云盘协作测试-${suffix}` } }),
    db.institution.create({ data: { name: `外部机构-${suffix}` } })
  ]);
  institutionId = institution.id;
  otherInstitutionId = otherInstitution.id;
  const [owner, collaboratorRow, externalRow] = await Promise.all([
    db.user.create({ data: { name: "课程所有者", email: `drive-owner-${suffix}@test.local`, role: "TEACHER", institutionId } }),
    db.user.create({ data: { name: "协作教师", email: `drive-collaborator-${suffix}@test.local`, role: "TEACHER", institutionId } }),
    db.user.create({ data: { name: "外部协作教师", email: `drive-external-${suffix}@test.local`, role: "TEACHER", institutionId: otherInstitutionId } })
  ]);
  ownerId = owner.id;
  collaborator = { id: collaboratorRow.id, name: collaboratorRow.name, role: "TEACHER", institutionId };
  externalCollaborator = { id: externalRow.id, name: externalRow.name, role: "TEACHER", institutionId: otherInstitutionId };

  const [course, otherCourse] = await Promise.all([
    db.course.create({ data: { title: "协作云盘课程", ownerId: owner.id, institutionId } }),
    db.course.create({ data: { title: "另一个课程", ownerId: owner.id, institutionId } })
  ]);
  courseId = course.id;
  otherCourseId = otherCourse.id;
  const [root, otherRoot] = await Promise.all([
    db.driveFile.create({ data: { ownerId: owner.id, name: "课程根目录", kind: "folder" } }),
    db.driveFile.create({ data: { ownerId: owner.id, name: "其他课程根目录", kind: "folder" } })
  ]);
  rootId = root.id;
  otherRootId = otherRoot.id;
  const nested = await db.driveFile.create({ data: { ownerId: owner.id, parentId: root.id, name: "课程资料", kind: "folder" } });
  nestedFolderId = nested.id;
  await Promise.all([
    db.course.update({ where: { id: courseId }, data: { driveRootFolderId: rootId } }),
    db.course.update({ where: { id: otherCourseId }, data: { driveRootFolderId: otherRootId } }),
    db.courseCollaborator.create({ data: { courseId, userId: collaborator.id, role: "EDITOR" } }),
    db.courseCollaborator.create({ data: { courseId, userId: externalCollaborator.id, role: "EDITOR" } })
  ]);
});

afterAll(async () => {
  if (institutionId) await db.institution.deleteMany({ where: { id: institutionId } });
  if (otherInstitutionId) await db.institution.deleteMany({ where: { id: otherInstitutionId } });
  await db.$disconnect();
});

describe("course drive collaborator mutations", () => {
  it("allows same-institution collaborators to create, rename, move and delete within the course root", async () => {
    const created = await createCourseDriveFolder(collaborator, courseId, rootId, "协作教师资料");
    expect(created.ownerId).not.toBe(collaborator.id);

    const renamed = await updateCourseDriveItem(collaborator, courseId, created.id, {
      name: "协作教师资料（已整理）",
      parentId: nestedFolderId
    });
    expect(renamed).toMatchObject({ name: "协作教师资料（已整理）", parentId: nestedFolderId });

    await expect(updateCourseDriveItem(collaborator, courseId, created.id, { parentId: otherRootId }))
      .rejects.toMatchObject({ code: "COURSE_DRIVE_OUTSIDE_ROOT", status: 403 });

    await expect(deleteCourseDriveItem(collaborator, courseId, created.id))
      .resolves.toMatchObject({ deletedCount: 1 });
    await expect(db.driveFile.findUnique({ where: { id: created.id } }))
      .resolves.toMatchObject({ deletedAt: expect.any(Date) });
  });

  it("rejects a collaborator record from another institution", async () => {
    await expect(createCourseDriveFolder(externalCollaborator, courseId, rootId, "越权资料"))
      .rejects.toMatchObject({ code: "COURSE_DRIVE_INSTITUTION_MISMATCH", status: 403 });
  });

  it("protects imported source files and their storage trace from recursive deletion", async () => {
    const sourceFolder = await createCourseDriveFolder(collaborator, courseId, rootId, "已导入资料");
    const sourceFile = await db.driveFile.create({
      data: {
        ownerId,
        parentId: sourceFolder.id,
        name: "不可删除的来源.md",
        kind: "file",
        path: "test://immutable-import-source"
      }
    });
    await db.documentImportJob.create({
      data: {
        courseId,
        userId: ownerId,
        status: "READY_FOR_REVIEW",
        originalName: sourceFile.name,
        driveFileId: sourceFile.id
      }
    });

    await expect(deleteCourseDriveItem(collaborator, courseId, sourceFolder.id))
      .rejects.toMatchObject({ code: "COURSE_DRIVE_FILE_IN_USE", status: 409 });
    await expect(db.driveFile.findUniqueOrThrow({ where: { id: sourceFile.id } }))
      .resolves.toMatchObject({ deletedAt: null, path: "test://immutable-import-source" });
  });
});
