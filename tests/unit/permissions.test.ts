import { randomUUID } from "crypto";
import { rm } from "fs/promises";
import { resolve } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import type { SessionUser } from "../../src/lib/auth";
import { requireCourseAccess, requireCourseManager, requireCourseOwner, requireTeacher } from "../../src/lib/permissions";
import { requireDriveFileOwner, requireDriveFileReadable } from "../../src/lib/modules/drivePermissions";
import { ensureCoursePurposeFolder } from "../../src/lib/courseDrive/service";
import { publishCourseResourceUpload } from "../../src/lib/courseWorkspace/courseResources";
import { requireGroupMember, requireGroupOwner } from "../../src/lib/modules/groupPermissions";
import { requireLiveParticipantOrHost } from "../../src/lib/modules/livePermissions";

type Fixture = {
  institutionId: string;
  otherInstitutionId: string;
  teacher: SessionUser;
  collaborator: SessionUser;
  student: SessionUser;
  outsider: SessionUser;
  activeCourseId: string;
  enrolledCourseId: string;
  driveFileId: string;
  copilotSubfolderId: string;
  copilotFileId: string;
  groupId: string;
  liveSessionId: string;
};

let fixture: Fixture;

async function createUser(institutionId: string, name: string, role: SessionUser["role"]): Promise<SessionUser> {
  const id = randomUUID();
  const user = await db.user.create({
    data: {
      id,
      name,
      email: `${id}@permissions.test`,
      role,
      institutionId
    }
  });
  return {
    id: user.id,
    name: user.name,
    role: user.role as SessionUser["role"],
    institutionId: user.institutionId
  };
}

beforeAll(async () => {
  const institution = await db.institution.create({
    data: { name: `权限测试 ${randomUUID()}` }
  });
  const teacher = await createUser(institution.id, "权限教师", "TEACHER");
  const collaborator = await createUser(institution.id, "协作教师", "TEACHER");
  const student = await createUser(institution.id, "已选学生", "STUDENT");
  const outsider = await createUser(institution.id, "未授权学生", "STUDENT");

  const activeCourse = await db.course.create({
    data: {
      title: "未选活动课程",
      status: "ACTIVE",
      ownerId: teacher.id,
      institutionId: institution.id
    }
  });
  const enrolledCourse = await db.course.create({
    data: {
      title: "已选课程",
      status: "ACTIVE",
      ownerId: teacher.id,
      institutionId: institution.id,
      enrollments: { create: { userId: student.id } }
    }
  });
  await db.courseCollaborator.create({
    data: { courseId: enrolledCourse.id, userId: collaborator.id }
  });
  const otherInstitution = await db.institution.create({ data: { name: `其他机构 ${randomUUID()}` } });
  const driveFile = await db.driveFile.create({
    data: {
      ownerId: teacher.id,
      name: "private.txt",
      kind: "file",
      path: ".uploads/test/private.txt"
    }
  });
  const copilotFolder = await db.driveFile.create({
    data: { ownerId: teacher.id, name: "课程资料", kind: "folder" }
  });
  const copilotSubfolder = await db.driveFile.create({
    data: { ownerId: teacher.id, parentId: copilotFolder.id, name: "第一章", kind: "folder" }
  });
  const copilotFile = await db.driveFile.create({
    data: { ownerId: teacher.id, parentId: copilotSubfolder.id, name: "lecture.md", kind: "file", path: ".uploads/test/lecture.md", extractionStatus: "READY", extractedText: "课程内容" }
  });
  await db.course.update({ where: { id: enrolledCourse.id }, data: { driveRootFolderId: copilotFolder.id } });
  const group = await db.group.create({
    data: {
      name: "闭合小组",
      isOpen: false,
      members: { create: { userId: teacher.id, role: "owner" } }
    }
  });
  const liveSession = await db.liveSession.create({
    data: {
      title: "教师直播",
      hostId: teacher.id
    }
  });

  fixture = {
    institutionId: institution.id,
    otherInstitutionId: otherInstitution.id,
    teacher,
    collaborator,
    student,
    outsider,
    activeCourseId: activeCourse.id,
    enrolledCourseId: enrolledCourse.id,
    driveFileId: driveFile.id,
    copilotSubfolderId: copilotSubfolder.id,
    copilotFileId: copilotFile.id,
    groupId: group.id,
    liveSessionId: liveSession.id
  };
});

afterAll(async () => {
  if (!fixture) return;
  await db.group.deleteMany({ where: { id: fixture.groupId } });
  await db.institution.deleteMany({ where: { id: fixture.institutionId } });
  await db.institution.deleteMany({ where: { id: fixture.otherInstitutionId } });
  await db.$disconnect();
});

describe("course permissions", () => {
  it("rejects a non-enrolled student from another active course", async () => {
    await expect(requireCourseAccess(fixture.outsider, fixture.activeCourseId)).rejects.toThrow("无权访问课程");
  });

  it("allows an enrolled student to access a course", async () => {
    await expect(requireCourseAccess(fixture.student, fixture.enrolledCourseId)).resolves.toMatchObject({
      id: fixture.enrolledCourseId
    });
  });

  it("allows a collaborator to access and manage without enrolling them as a student", async () => {
    await expect(requireCourseAccess(fixture.collaborator, fixture.enrolledCourseId)).resolves.toMatchObject({
      id: fixture.enrolledCourseId
    });
    await expect(requireCourseManager(fixture.collaborator, fixture.enrolledCourseId)).resolves.toMatchObject({
      id: fixture.enrolledCourseId
    });
    await expect(db.courseEnrollment.findUnique({
      where: { courseId_userId: { courseId: fixture.enrolledCourseId, userId: fixture.collaborator.id } }
    })).resolves.toBeNull();
  });
});

describe("drive permissions", () => {
  it("rejects non-owner access to a private drive file", async () => {
    await expect(requireDriveFileReadable(fixture.student, fixture.driveFileId)).rejects.toThrow("无权访问文件");
  });

  it("allows the owner to read and manage a drive file", async () => {
    await expect(requireDriveFileReadable(fixture.teacher, fixture.driveFileId)).resolves.toMatchObject({
      id: fixture.driveFileId
    });
    await expect(requireDriveFileOwner(fixture.teacher, fixture.driveFileId)).resolves.toMatchObject({
      id: fixture.driveFileId
    });
  });

  it("requires a user-specific grant instead of exposing every file that has a share code", async () => {
    const share = await db.driveShare.create({
      data: {
        fileId: fixture.driveFileId,
        ownerId: fixture.teacher.id,
        code: `SHARE-${randomUUID()}`
      }
    });
    await expect(requireDriveFileReadable(fixture.outsider, fixture.driveFileId)).rejects.toThrow("无权访问文件");
    await db.driveShareGrant.create({
      data: { shareId: share.id, userId: fixture.student.id }
    });
    await expect(requireDriveFileReadable(fixture.student, fixture.driveFileId)).resolves.toMatchObject({
      id: fixture.driveFileId
    });
    await expect(requireDriveFileReadable(fixture.outsider, fixture.driveFileId)).rejects.toThrow("无权访问文件");
  });

  it("defaults to deny, then grants enrolled students inherited access through an explicit rule", async () => {
    await expect(requireDriveFileReadable(fixture.student, fixture.copilotFileId)).rejects.toThrow("无权访问文件");
    await db.courseDriveAccessRule.create({
      data: {
        courseId: fixture.enrolledCourseId,
        driveFileId: fixture.copilotSubfolderId,
        access: "ALLOW",
        updatedById: fixture.teacher.id
      }
    });
    await expect(requireDriveFileReadable(fixture.student, fixture.copilotFileId)).resolves.toMatchObject({
      id: fixture.copilotFileId
    });
    await expect(requireDriveFileReadable(fixture.outsider, fixture.copilotFileId)).rejects.toThrow("无权访问文件");
    await expect(requireDriveFileOwner(fixture.student, fixture.copilotFileId)).rejects.toThrow("无权管理文件");
  });
});

describe("course drive purpose folders", () => {
  it("creates AI outputs beneath one shared AI产物 folder and remains idempotent", async () => {
    const lessonPlans = await ensureCoursePurposeFolder(fixture.teacher, fixture.enrolledCourseId, "AI_LESSON_PLAN_OUTPUT");
    const lessonPlansAgain = await ensureCoursePurposeFolder(fixture.teacher, fixture.enrolledCourseId, "AI_LESSON_PLAN_OUTPUT");
    const papers = await ensureCoursePurposeFolder(fixture.teacher, fixture.enrolledCourseId, "AI_PAPER_OUTPUT");
    expect(lessonPlansAgain.id).toBe(lessonPlans.id);
    expect(papers.parentId).toBe(lessonPlans.parentId);
    await expect(db.driveFile.findUnique({ where: { id: lessonPlans.parentId! } })).resolves.toMatchObject({
      name: "AI产物",
      parentId: expect.any(String)
    });
  });

  it("publishes an uploaded resource inside the course root with one student/AI access rule", async () => {
    const previousProvider = process.env.DRIVE_STORAGE_PROVIDER;
    const previousUploadDir = process.env.UPLOAD_DIR;
    const uploadDir = resolve(".verification", "tmp", `course-resource-${randomUUID()}`);
    try {
      process.env.DRIVE_STORAGE_PROVIDER = "local";
      process.env.UPLOAD_DIR = uploadDir;
      const resource = await publishCourseResourceUpload(
        fixture.teacher,
        fixture.enrolledCourseId,
        new File(["公开课程内容"], "公开讲义.txt", { type: "text/plain" })
      );
      expect(resource.driveFile?.parentId).toBeTruthy();
      await expect(db.courseDriveAccessRule.findUnique({
        where: {
          courseId_driveFileId: {
            courseId: fixture.enrolledCourseId,
            driveFileId: resource.driveFileId!
          }
        }
      })).resolves.toMatchObject({ access: "ALLOW" });
      await expect(requireDriveFileReadable(fixture.student, resource.driveFileId!)).resolves.toMatchObject({
        id: resource.driveFileId
      });
    } finally {
      if (previousProvider === undefined) delete process.env.DRIVE_STORAGE_PROVIDER;
      else process.env.DRIVE_STORAGE_PROVIDER = previousProvider;
      if (previousUploadDir === undefined) delete process.env.UPLOAD_DIR;
      else process.env.UPLOAD_DIR = previousUploadDir;
      await rm(uploadDir, { recursive: true, force: true });
    }
  });
});

describe("group permissions", () => {
  it("rejects a non-member from posting in a closed group", async () => {
    await expect(requireGroupMember(fixture.student, fixture.groupId)).rejects.toThrow("无权访问小组");
  });

  it("allows a group owner to update group settings", async () => {
    await expect(requireGroupOwner(fixture.teacher, fixture.groupId)).resolves.toMatchObject({
      userId: fixture.teacher.id
    });
  });
});

describe("live permissions", () => {
  it("rejects a non-participant from live chat", async () => {
    await expect(requireLiveParticipantOrHost(fixture.student, fixture.liveSessionId)).rejects.toThrow("无权访问直播");
  });

  it("allows the host to participate in live chat", async () => {
    await expect(requireLiveParticipantOrHost(fixture.teacher, fixture.liveSessionId)).resolves.toMatchObject({
      id: fixture.liveSessionId
    });
  });
});

describe("course owner permissions", () => {
  it("allows the teacher owner to manage a course", async () => {
    await expect(requireCourseOwner(fixture.teacher, fixture.activeCourseId)).resolves.toMatchObject({
      id: fixture.activeCourseId
    });
  });

  it("rejects students from teacher-only permissions", async () => {
    expect(() => requireTeacher(fixture.student)).toThrow("需要教师权限");
    await expect(requireCourseOwner(fixture.student, fixture.enrolledCourseId)).rejects.toThrow("需要教师权限");
  });

  it("keeps owner-only operations unavailable to collaborators", async () => {
    await expect(requireCourseOwner(fixture.collaborator, fixture.enrolledCourseId)).rejects.toThrow("无权管理课程");
  });
});
