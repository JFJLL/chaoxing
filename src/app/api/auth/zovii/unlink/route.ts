import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { z } from "zod";
import { unlinkZoviiAccount, ZoviiLinkError } from "@/lib/zovii/linkAccount";

const unlinkSchema = z.object({
  password: z.string().min(1, "请输入当前密码")
});

export async function POST(request: NextRequest) {
  const user = await requireUser();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const parsed = unlinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "输入有误" },
      { status: 400 }
    );
  }

  try {
    const result = await unlinkZoviiAccount({
      userId: user.id,
      password: parsed.data.password
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ZoviiLinkError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "PASSWORD_INVALID" ? 400 : 409 }
      );
    }
    return NextResponse.json({ error: "解绑失败，请稍后重试" }, { status: 502 });
  }
}
