import { randomBytes } from "crypto";
import type { SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseOwner, requireTeacher } from "@/lib/permissions";

const COLLABORATOR_INVITE_KIND = "COURSE_COLLABORATOR";

export class CourseCollaborationError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "COURSE_COLLABORATION_ERROR") {
    super(message);
    this.name = "CourseCollaborationError";
  }
}

function collaborationCode() {
  return `TC-${randomBytes(5).toString("hex").toUpperCase()}`;
}

export async function listCourseCollaborators(user: SessionUser, courseId: string) {
  const course = await requireCourseOwner(user, courseId);
  const collaborators = await db.courseCollaborator.findMany({
    where: { courseId },
    include: { user: { select: { id: true, name: true, email: true, role: true, institutionId: true } } },
    orderBy: { createdAt: "asc" }
  });
  return { course, collaborators };
}

export async function createCourseCollaborationCode(
  user: SessionUser,
  courseId: string,
  options: { expiresAt?: Date | null; maxUses?: number | null } = {}
) {
  await requireCourseOwner(user, courseId);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.inviteCode.create({
        data: {
          code: collaborationCode(),
          kind: COLLABORATOR_INVITE_KIND,
          targetId: courseId,
          expiresAt: options.expiresAt ?? null,
          maxUses: options.maxUses ?? null
        }
      });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "P2002") || attempt === 2) throw error;
    }
  }
  throw new CourseCollaborationError("教师协作码生成冲突，请重试", 409, "COLLABORATION_CODE_CONFLICT");
}

export async function listCourseCollaborationCodes(user: SessionUser, courseId: string) {
  await requireCourseOwner(user, courseId);
  return db.inviteCode.findMany({
    where: { kind: COLLABORATOR_INVITE_KIND, targetId: courseId },
    orderBy: { createdAt: "desc" }
  });
}

export async function revokeCourseCollaborationCode(user: SessionUser, courseId: string, codeId: string) {
  await requireCourseOwner(user, courseId);
  const removed = await db.inviteCode.deleteMany({
    where: { id: codeId, kind: COLLABORATOR_INVITE_KIND, targetId: courseId }
  });
  if (!removed.count) throw new CourseCollaborationError("教师协作码不存在", 404, "COLLABORATION_CODE_NOT_FOUND");
}

export async function joinCourseAsCollaborator(user: SessionUser, rawCode: string) {
  requireTeacher(user);
  const code = rawCode.trim().toUpperCase();
  if (!code) throw new CourseCollaborationError("请输入教师协作码", 400, "COLLABORATION_CODE_REQUIRED");

  try {
    return await db.$transaction(async (tx) => {
      const invite = await tx.inviteCode.findUnique({ where: { code } });
      if (!invite || invite.kind !== COLLABORATOR_INVITE_KIND) {
        throw new CourseCollaborationError("教师协作码无效", 404, "COLLABORATION_CODE_INVALID");
      }
      const course = await tx.course.findUnique({
        where: { id: invite.targetId },
        select: { id: true, title: true, ownerId: true, institutionId: true }
      });
      if (!course) throw new CourseCollaborationError("课程不存在", 404, "COURSE_NOT_FOUND");
      if (course.institutionId !== user.institutionId) {
        throw new CourseCollaborationError("首版仅允许同机构教师协作", 403, "COLLABORATION_CROSS_INSTITUTION");
      }
      if (course.ownerId === user.id) return { course, joined: false, role: "OWNER" as const };
      const existing = await tx.courseCollaborator.findUnique({
        where: { courseId_userId: { courseId: course.id, userId: user.id } }
      });
      if (existing) return { course, joined: false, role: "MANAGER" as const };
      if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
        throw new CourseCollaborationError("教师协作码已过期", 410, "COLLABORATION_CODE_EXPIRED");
      }
      if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) {
        throw new CourseCollaborationError("教师协作码已达到使用次数上限", 410, "COLLABORATION_CODE_EXHAUSTED");
      }
      const reserved = await tx.inviteCode.updateMany({
        where: { id: invite.id, usedCount: invite.usedCount },
        data: { usedCount: { increment: 1 } }
      });
      if (!reserved.count) {
        throw new CourseCollaborationError("教师协作码正在被使用，请重试", 409, "COLLABORATION_CODE_CONFLICT");
      }
      await tx.courseCollaborator.create({ data: { courseId: course.id, userId: user.id, role: "MANAGER" } });
      return { course, joined: true, role: "MANAGER" as const };
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const invite = await db.inviteCode.findUnique({ where: { code } });
      if (invite?.kind === COLLABORATOR_INVITE_KIND) {
        const course = await db.course.findUnique({ where: { id: invite.targetId } });
        const existing = course && await db.courseCollaborator.findUnique({
          where: { courseId_userId: { courseId: course.id, userId: user.id } }
        });
        if (course && existing) return { course, joined: false, role: "MANAGER" as const };
      }
    }
    throw error;
  }
}

export async function removeCourseCollaborator(user: SessionUser, courseId: string, collaboratorUserId: string) {
  await requireCourseOwner(user, courseId);
  const removed = await db.courseCollaborator.deleteMany({ where: { courseId, userId: collaboratorUserId } });
  if (!removed.count) throw new CourseCollaborationError("协作教师不存在", 404, "COLLABORATOR_NOT_FOUND");
}
