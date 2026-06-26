import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import type { SessionUser } from "../../src/lib/auth";
import { requireCourseAccess, requireCourseOwner, requireTeacher } from "../../src/lib/permissions";
import { requireDriveFileOwner, requireDriveFileReadable } from "../../src/lib/modules/drivePermissions";
import { requireGroupMember, requireGroupOwner } from "../../src/lib/modules/groupPermissions";
import { requireLiveParticipantOrHost } from "../../src/lib/modules/livePermissions";

type Fixture = {
  institutionId: string;
  teacher: SessionUser;
  student: SessionUser;
  outsider: SessionUser;
  activeCourseId: string;
  enrolledCourseId: string;
  driveFileId: string;
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
  const driveFile = await db.driveFile.create({
    data: {
      ownerId: teacher.id,
      name: "private.txt",
      kind: "file",
      path: ".uploads/test/private.txt"
    }
  });
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
    teacher,
    student,
    outsider,
    activeCourseId: activeCourse.id,
    enrolledCourseId: enrolledCourse.id,
    driveFileId: driveFile.id,
    groupId: group.id,
    liveSessionId: liveSession.id
  };
});

afterAll(async () => {
  if (!fixture) return;
  await db.group.deleteMany({ where: { id: fixture.groupId } });
  await db.institution.deleteMany({ where: { id: fixture.institutionId } });
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
});
