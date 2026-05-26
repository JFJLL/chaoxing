import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { requireCourseAccess } from "@/lib/permissions";

export async function loadCourseWorkspace(user: SessionUser, courseId: string) {
  await requireCourseAccess(user, courseId);

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
        orderBy: { createdAt: "desc" }
      },
      enrollments: true
    }
  });

  if (!course) notFound();
  return course;
}
