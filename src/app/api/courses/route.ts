import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertTeacher, isTeacher } from "@/lib/permissions";

const createCourseSchema = z.object({
  title: z.string().min(2, "课程名称至少 2 个字"),
  coverStyle: z.enum(["document", "tool", "ai", "plain"]).default("plain"),
  startsAt: z.string().optional(),
  endsAt: z.string().optional()
});

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const requestedTab = request.nextUrl.searchParams.get("tab");
  const tab = isTeacher(user) ? (requestedTab === "learned" ? "learned" : "taught") : "learned";

  if (tab === "taught") {
    assertTeacher(user);
    const courses = await db.course.findMany({
      where: {
        OR: [
          { ownerId: user.id },
          { collaborators: { some: { userId: user.id } } }
        ]
      },
      include: {
        owner: {
          select: { id: true, name: true, email: true, avatar: true, role: true }
        },
        enrollments: {
          select: { id: true, userId: true, progress: true, completedAt: true }
        }
      },
      orderBy: { updatedAt: "desc" }
    });
    return NextResponse.json({ courses });
  }

  const enrollments = await db.courseEnrollment.findMany({
    where: { userId: user.id },
    include: {
      course: {
        include: {
          owner: {
            select: { id: true, name: true, email: true, avatar: true, role: true }
          }
        }
      }
    },
    orderBy: { updatedAt: "desc" }
  });

  return NextResponse.json({
    courses: enrollments.map((enrollment) => ({
      ...enrollment.course,
      progress: enrollment.progress
    }))
  });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  assertTeacher(user);

  const input = createCourseSchema.parse(await request.json());
  const course = await db.$transaction(async (tx) => {
    const created = await tx.course.create({
      data: {
        title: input.title.trim(),
        cover: `cover:${input.coverStyle}`,
        startDate: input.startsAt ? new Date(input.startsAt) : null,
        endDate: input.endsAt ? new Date(input.endsAt) : null,
        term: "自建课程",
        status: "DRAFT",
        ownerId: user.id,
        institutionId: user.institutionId
      }
    });
    const root = await tx.driveFile.create({
      data: {
        id: `course-drive-root-${created.id}`,
        ownerId: user.id,
        parentId: null,
        name: created.title,
        kind: "folder"
      }
    });
    return tx.course.update({
      where: { id: created.id },
      data: { driveRootFolderId: root.id }
    });
  });

  return NextResponse.json({ course }, { status: 201 });
}
