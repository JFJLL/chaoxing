import { NextRequest, NextResponse } from "next/server";
import { createSessionCookieValue, getSessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { registerSchema } from "@/lib/validation/auth";
import { registerWithZovii, RegistrationError, toSessionUser } from "@/lib/zovii/registration";

const ERROR_STATUS: Record<string, number> = {
  PHONE_TAKEN: 409,
  EMAIL_TAKEN: 409,
  PHONE_EXISTS_ON_ZOVII: 409,
  PHONE_NOT_REGISTERED: 409,
  OPERATION_IN_FLIGHT: 409,
  INVALID_CODE: 400,
  RATE_LIMITED: 429,
  RECOVERY_CODE_SENT: 409,
  LOCAL_RECOVERY_FAILED: 409,
  ZOVII_ERROR: 502
};

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "输入有误" },
      { status: 400 }
    );
  }

  try {
    const { user } = await registerWithZovii(parsed.data);
    const sessionUser = toSessionUser(user);
    const response = NextResponse.json({ user: sessionUser });
    response.cookies.set(SESSION_COOKIE, createSessionCookieValue(sessionUser), getSessionCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof RegistrationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: ERROR_STATUS[error.code] ?? 502 }
      );
    }
    return NextResponse.json({ error: "注册失败，请稍后重试" }, { status: 502 });
  }
}
