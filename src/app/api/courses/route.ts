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
      where: { ownerId: user.id },
      include: {
        owner: true,
        enrollments: true
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
          owner: true
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
  const course = await db.course.create({
    data: {
      title: input.title,
      cover: `cover:${input.coverStyle}`,
      startDate: input.startsAt ? new Date(input.startsAt) : null,
      endDate: input.endsAt ? new Date(input.endsAt) : null,
      term: "自建课程",
      status: "DRAFT",
      ownerId: user.id,
      institutionId: user.institutionId
    }
  });

  return NextResponse.json({ course }, { status: 201 });
}
