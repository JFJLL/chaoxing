import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
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
    const code = await readCode(request);
    if (!code) throw new Error("请输入邀请码");
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
