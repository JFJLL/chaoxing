import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "只有学校管理员可以搜索用户" }, { status: 403 });
  }
  const search = (request.nextUrl.searchParams.get("search") ?? "").trim();
  const users = await db.user.findMany({
    where: {
      institutionId: user.institutionId,
      ...(search
        ? {
            OR: [{ name: { contains: search } }, { email: { contains: search } }]
          }
        : {})
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
    take: 20
  });
  return NextResponse.json({ users });
}
