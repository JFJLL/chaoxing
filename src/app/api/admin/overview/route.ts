import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireAdministrator } from "@/lib/permissions";

const completedUsageStatuses = ["SUCCESS", "TEST_SUCCESS", "FAILED", "TEST_FAILED", "IMAGE_SUCCESS", "IMAGE_FAILED"];

type ProviderUsageAggregate = {
  _count: { _all: number };
  _sum: {
    promptTokensActual: number | null;
    completionTokensActual: number | null;
    totalTokensActual: number | null;
  };
};

function providerUsage(aggregate: ProviderUsageAggregate | undefined) {
  return {
    providerUsageCalls: aggregate?._count._all ?? 0,
    promptTokensActual: aggregate?._sum.promptTokensActual ?? 0,
    completionTokensActual: aggregate?._sum.completionTokensActual ?? 0,
    totalTokensActual: aggregate?._sum.totalTokensActual ?? 0
  };
}

export async function GET() {
  const user = await requireUser();
  try {
    requireAdministrator(user);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权访问管理后台" }, { status: 403 });
  }

  const providerUsageWhere = { status: { in: completedUsageStatuses }, tokenUsageSource: "PROVIDER" };
  const [users, courses, recentOrders, callsByTeacher, callsByCourse, providerUsageByTeacher, providerUsageByCourse] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true, name: true, email: true, role: true, institution: { select: { name: true } },
        creditAccount: { select: { available: true, reserved: true, updatedAt: true } },
        _count: { select: { ownedCourses: true, enrollments: true } }
      }
    }),
    db.course.findMany({
      orderBy: { updatedAt: "desc" },
      take: 300,
      select: {
        id: true, title: true, status: true, updatedAt: true,
        owner: { select: { id: true, name: true, email: true } },
        institution: { select: { name: true } },
        _count: { select: { enrollments: true, aiArtifacts: true } }
      }
    }),
    db.paymentOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, outTradeNo: true, planName: true, planCredits: true, amountFen: true, provider: true, status: true, user: { select: { name: true, email: true } }, createdAt: true, paidAt: true }
    }),
    db.copilotUsageEvent.groupBy({
      by: ["userId"],
      where: { status: { in: completedUsageStatuses } },
      _count: { _all: true }
    }),
    db.copilotUsageEvent.groupBy({
      by: ["courseId"],
      where: { status: { in: completedUsageStatuses } },
      _count: { _all: true }
    }),
    db.copilotUsageEvent.groupBy({
      by: ["userId"],
      where: providerUsageWhere,
      _count: { _all: true },
      _sum: { promptTokensActual: true, completionTokensActual: true, totalTokensActual: true }
    }),
    db.copilotUsageEvent.groupBy({
      by: ["courseId"],
      where: providerUsageWhere,
      _count: { _all: true },
      _sum: { promptTokensActual: true, completionTokensActual: true, totalTokensActual: true }
    })
  ]);

  const userById = new Map(users.map((item) => [item.id, item]));
  const courseById = new Map(courses.map((item) => [item.id, item]));
  const providerUsageByTeacherId = new Map(providerUsageByTeacher.map((item) => [item.userId, item]));
  const providerUsageByCourseId = new Map(providerUsageByCourse.map((item) => [item.courseId, item]));

  const teacherTokenUsage = callsByTeacher
    .map((item) => ({ user: userById.get(item.userId), calls: item._count._all, usage: providerUsage(providerUsageByTeacherId.get(item.userId)) }))
    .filter((item): item is typeof item & { user: NonNullable<typeof item.user> } => item.user?.role === "TEACHER")
    .map((item) => ({
      userId: item.user.id,
      teacherName: item.user.name,
      teacherEmail: item.user.email,
      calls: item.calls,
      ...item.usage
    }))
    .sort((left, right) => right.totalTokensActual - left.totalTokensActual);

  const courseTokenUsage = callsByCourse
    .map((item) => ({ course: courseById.get(item.courseId), calls: item._count._all, usage: providerUsage(providerUsageByCourseId.get(item.courseId)) }))
    .filter((item): item is typeof item & { course: NonNullable<typeof item.course> } => Boolean(item.course))
    .map((item) => ({
      courseId: item.course.id,
      courseTitle: item.course.title,
      ownerName: item.course.owner.name,
      ownerEmail: item.course.owner.email,
      calls: item.calls,
      ...item.usage
    }))
    .sort((left, right) => right.totalTokensActual - left.totalTokensActual);

  return NextResponse.json({
    summary: {
      users: users.length,
      teachers: users.filter((item) => item.role === "TEACHER").length,
      courses: courses.length,
      availableCredits: users.reduce((total, item) => total + (item.creditAccount?.available ?? 0), 0),
      totalTokensActual: courseTokenUsage.reduce((total, item) => total + item.totalTokensActual, 0),
      providerUsageCalls: courseTokenUsage.reduce((total, item) => total + item.providerUsageCalls, 0),
      totalAiCalls: courseTokenUsage.reduce((total, item) => total + item.calls, 0)
    },
    users,
    courses,
    recentOrders,
    teacherTokenUsage,
    courseTokenUsage
  });
}
