import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "../../src/lib/auth";
import { db } from "../../src/lib/db";
import {
  CourseCollaborationError,
  createCourseCollaborationCode,
  joinCourseAsCollaborator,
  removeCourseCollaborator
} from "../../src/lib/courseWorkspace/courseCollaborators";

let owner: SessionUser;
let collaborator: SessionUser;
let outsider: SessionUser;
let courseId: string;
let institutionId: string;
let otherInstitutionId: string;

async function user(institution: string, role: SessionUser["role"], name: string): Promise<SessionUser> {
  const id = randomUUID();
  const row = await db.user.create({ data: { id, name, email: `${id}@collaborators.test`, role, institutionId: institution } });
  return { id: row.id, name: row.name, role: row.role as SessionUser["role"], institutionId: row.institutionId };
}

beforeAll(async () => {
  const institution = await db.institution.create({ data: { name: `协作机构 ${randomUUID()}` } });
  const other = await db.institution.create({ data: { name: `外部机构 ${randomUUID()}` } });
  institutionId = institution.id;
  otherInstitutionId = other.id;
  owner = await user(institution.id, "TEACHER", "课程所有者");
  collaborator = await user(institution.id, "TEACHER", "协作教师");
  outsider = await user(other.id, "TEACHER", "外部教师");
  const course = await db.course.create({
    data: { title: "协作课程", ownerId: owner.id, institutionId: institution.id }
  });
  courseId = course.id;
});

afterAll(async () => {
  await db.institution.deleteMany({ where: { id: { in: [institutionId, otherInstitutionId] } } });
  await db.$disconnect();
});

describe("course collaborators", () => {
  it("joins a same-institution teacher idempotently without creating an enrollment", async () => {
    const invite = await createCourseCollaborationCode(owner, courseId, { maxUses: 2 });
    await expect(joinCourseAsCollaborator(collaborator, invite.code)).resolves.toMatchObject({ joined: true, role: "MANAGER" });
    await expect(joinCourseAsCollaborator(collaborator, invite.code)).resolves.toMatchObject({ joined: false, role: "MANAGER" });
    await expect(db.courseEnrollment.findUnique({
      where: { courseId_userId: { courseId, userId: collaborator.id } }
    })).resolves.toBeNull();
    await expect(db.inviteCode.findUnique({ where: { id: invite.id } })).resolves.toMatchObject({ usedCount: 1 });
  });

  it("rejects a teacher from another institution", async () => {
    const invite = await createCourseCollaborationCode(owner, courseId);
    await expect(joinCourseAsCollaborator(outsider, invite.code)).rejects.toMatchObject({
      code: "COLLABORATION_CROSS_INSTITUTION",
      status: 403
    });
  });

  it("allows only the owner to remove collaborators", async () => {
    await expect(removeCourseCollaborator(collaborator, courseId, collaborator.id)).rejects.toThrow("无权管理课程");
    await expect(removeCourseCollaborator(owner, courseId, collaborator.id)).resolves.toBeUndefined();
  });
});
