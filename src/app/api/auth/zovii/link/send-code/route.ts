import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sendCodeSchema } from "@/lib/validation/auth";
import { sendLinkCode, ZoviiLinkError } from "@/lib/zovii/linkAccount";
import { ZoviiError } from "@/lib/zovii/errors";

export async function POST(request: NextRequest) {
  await requireUser();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const parsed = sendCodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "输入有误" },
      { status: 400 }
    );
  }

  try {
    await sendLinkCode(parsed.data.phone);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZoviiLinkError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "RATE_LIMITED" ? 429 : 502 }
      );
    }
    if (error instanceof ZoviiError) {
      return NextResponse.json(
        { error: error.message || "验证码发送失败，请稍后重试", code: error.code },
        { status: error.code === "RATE_LIMITED" ? 429 : 502 }
      );
    }
    return NextResponse.json({ error: "验证码发送失败，请稍后重试" }, { status: 502 });
  }
}
