import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { isCourseManagerRecord, requireCourseAccess } from "@/lib/permissions";

export async function loadCourseWorkspace(user: SessionUser, courseId: string) {
  const accessibleCourse = await requireCourseAccess(user, courseId);
  const canManage = isCourseManagerRecord(user, accessibleCourse);

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      owner: { select: { id: true, name: true, avatar: true, role: true } },
      collaborators: {
        where: { userId: user.id },
        select: { userId: true, role: true }
      },
      chapters: {
        orderBy: { order: "asc" },
        include: { lessons: { orderBy: { order: "asc" } } }
      },
      resources: {
        orderBy: { createdAt: "desc" },
        include: { driveFile: true }
      },
      announcements: {
        where: canManage ? {} : { status: "PUBLISHED", OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }] },
        orderBy: { createdAt: "desc" },
        include: { author: { select: { id: true, name: true, avatar: true, role: true } } }
      },
      aiArtifacts: {
        where: canManage ? {} : { status: "PUBLISHED" },
        orderBy: { createdAt: "desc" }
      },
      enrollments: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, email: true, avatar: true, role: true } } }
      }
    }
  });

  if (!course) notFound();
  return course;
}
