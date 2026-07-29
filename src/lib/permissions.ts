import { cache } from "react";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

export function isTeacher(user: SessionUser) {
  return user.role === "TEACHER" || user.role === "ADMIN";
}

export function requireTeacher(user: SessionUser) {
  if (!isTeacher(user)) {
    throw new Error("需要教师权限");
  }
}

export function assertTeacher(user: SessionUser) {
  requireTeacher(user);
}

const findAccessibleCourse = cache(async (userId: string, role: SessionUser["role"], courseId: string) => {
  const course = await db.course.findFirst({
    where: {
      id: courseId,
      OR: [
        ...(role === "ADMIN" ? [{}] : []),
        { ownerId: userId },
        { collaborators: { some: { userId } } },
        { status: "ACTIVE", enrollments: { some: { userId } } }
      ]
    },
    include: {
      collaborators: {
        where: { userId },
        select: { userId: true, role: true }
      }
    }
  });

  return course;
});

export async function requireCourseAccess(user: SessionUser, courseId: string) {
  const course = await findAccessibleCourse(user.id, user.role, courseId);

  if (!course) {
    throw new Error("无权访问课程");
  }

  return course;
}

export async function requireCourseEnrollmentOrOwner(user: SessionUser, courseId: string) {
  return requireCourseAccess(user, courseId);
}

export function requireAdminOrOwner(user: SessionUser, ownerId: string) {
  if (user.role !== "ADMIN" && user.id !== ownerId) {
    throw new Error("无权管理资源");
  }
}

export async function requireCourseOwner(user: SessionUser, courseId: string) {
  requireTeacher(user);
  const course = await db.course.findFirst({
    where: {
      id: courseId,
      OR: [
        ...(user.role === "ADMIN" ? [{}] : []),
        { ownerId: user.id }
      ]
    }
  });

  if (!course) {
    throw new Error("无权管理课程");
  }

  return course;
}

export async function requireCourseManager(user: SessionUser, courseId: string) {
  requireTeacher(user);
  const course = await db.course.findFirst({
    where: {
      id: courseId,
      OR: [
        ...(user.role === "ADMIN" ? [{}] : []),
        { ownerId: user.id },
        { collaborators: { some: { userId: user.id } } }
      ]
    },
    include: {
      collaborators: {
        where: { userId: user.id },
        select: { userId: true, role: true }
      }
    }
  });

  if (!course) {
    throw new Error("无权管理课程");
  }

  return course;
}

export function isCourseManagerRecord(
  user: SessionUser,
  course: { ownerId: string; collaborators?: Array<{ userId: string }> }
) {
  return Boolean(user.role === "ADMIN"
    || (isTeacher(user) && (course.ownerId === user.id || course.collaborators?.some((item) => item.userId === user.id))));
}
