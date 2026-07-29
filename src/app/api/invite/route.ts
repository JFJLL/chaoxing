import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redeemInviteCode } from "@/lib/modules/inviteCodes";

async function readCode(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return ((await request.json()) as { code?: string }).code;
  }
  const form = await request.formData();
  const value = form.get("code");
  return typeof value === "string" ? value : undefined;
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  try {
    if (user.role !== "STUDENT") throw new Error("只有学生可以使用课程邀请码加入学习课程");
    const code = await readCode(request);
    if (!code) throw new Error("请输入邀请码");
    const invite = await db.inviteCode.findUnique({
      where: { code: code.trim() },
      select: { kind: true }
    });
    if (!invite || invite.kind !== "COURSE") {
      throw new Error("课程邀请码无效");
    }
    const result = await redeemInviteCode(user, code);
    const accept = request.headers.get("accept") || "";
    if (accept.includes("text/html")) {
      return Response.redirect(new URL("/space", request.headers.get("origin") || request.nextUrl.origin), 303);
    }
    return NextResponse.json({ ok: true, kind: result.kind });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "邀请码处理失败" }, { status: 400 });
  }
}
