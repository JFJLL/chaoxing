import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setSession } from "@/lib/auth";

async function readUserId(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { userId?: string };
    return body.userId;
  }

  const formData = await request.formData();
  const value = formData.get("userId");
  return typeof value === "string" ? value : undefined;
}

export async function POST(request: NextRequest) {
  const userId = await readUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "请选择登录用户" }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, institutionId: true }
  });

  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  await setSession({
    id: user.id,
    name: user.name,
    role: user.role as "STUDENT" | "TEACHER" | "ADMIN",
    institutionId: user.institutionId
  });

  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html")) {
    const origin = request.headers.get("origin") || request.nextUrl.origin;
    return NextResponse.redirect(new URL("/space", origin), 303);
  }

  return NextResponse.json({ user });
}
