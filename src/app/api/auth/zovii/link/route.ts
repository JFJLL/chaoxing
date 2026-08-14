import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { z } from "zod";
import { linkZoviiAccount, ZoviiLinkError } from "@/lib/zovii/linkAccount";
import { PHONE_PATTERN, SMS_CODE_PATTERN } from "@/lib/validation/auth";

const linkSchema = z.object({
  phone: z.string().regex(PHONE_PATTERN, "请输入有效的中国大陆手机号"),
  code: z.string().regex(SMS_CODE_PATTERN, "请输入收到的验证码")
});

const ERROR_STATUS: Record<string, number> = {
  INVALID_CODE: 400,
  CODE_EXPIRED: 400,
  CODE_USED: 400,
  ACCOUNT_CONFLICT: 409,
  PHONE_MISMATCH: 409,
  PHONE_NOT_REGISTERED: 409,
  RATE_LIMITED: 429,
  ZOVII_ERROR: 502
};

export async function POST(request: NextRequest) {
  const user = await requireUser();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "输入有误" },
      { status: 400 }
    );
  }

  try {
    const result = await linkZoviiAccount({
      userId: user.id,
      phone: parsed.data.phone,
      code: parsed.data.code
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ZoviiLinkError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: ERROR_STATUS[error.code] ?? 502 }
      );
    }
    return NextResponse.json({ error: "关联失败，请稍后重试" }, { status: 502 });
  }
}
