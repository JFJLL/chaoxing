import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { isTeacher, requireCourseAccess } from "@/lib/permissions";

export async function loadCourseWorkspace(user: SessionUser, courseId: string) {
  const accessibleCourse = await requireCourseAccess(user, courseId);
  const canManage = isTeacher(user) && (user.role === "ADMIN" || accessibleCourse.ownerId === user.id);

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      owner: true,
      chapters: {
        orderBy: { order: "asc" },
        include: { lessons: { orderBy: { order: "asc" } } }
      },
      resources: {
        orderBy: { createdAt: "desc" },
        include: { driveFile: true }
      },
      announcements: {
        orderBy: { createdAt: "desc" },
        include: { author: true }
      },
      aiArtifacts: {
        where: canManage ? {} : { status: "PUBLISHED" },
        orderBy: { createdAt: "desc" }
      },
      enrollments: true
    }
  });

  if (!course) notFound();
  return course;
}
