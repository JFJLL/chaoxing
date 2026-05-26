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

export async function requireCourseAccess(user: SessionUser, courseId: string) {
  const course = await db.course.findFirst({
    where: {
      id: courseId,
      OR: [
        ...(user.role === "ADMIN" ? [{}] : []),
        { ownerId: user.id },
        { enrollments: { some: { userId: user.id } } }
      ]
    }
  });

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
