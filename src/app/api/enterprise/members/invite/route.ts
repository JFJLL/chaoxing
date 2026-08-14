import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { z } from "zod";
import {
  ENTERPRISE_ROLES,
  EnterpriseAccessError,
  inviteEnterpriseMember
} from "@/lib/zovii/enterprise";

const inviteSchema = z.object({
  targetUserId: z.string().min(1, "请选择学生"),
  role: z.enum(ENTERPRISE_ROLES, { message: "不支持的企业角色" }),
  operationId: z.string().min(16, "操作标识无效").max(64, "操作标识无效")
});

const ERROR_STATUS: Record<string, number> = {
  NOT_AUTHORIZED: 403,
  NOT_CONFIGURED: 403,
  TARGET_NOT_LINKED: 409,
  NOT_SAME_INSTITUTION: 409,
  OPERATION_IN_FLIGHT: 409,
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
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "输入有误" },
      { status: 400 }
    );
  }

  try {
    const result = await inviteEnterpriseMember(user, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof EnterpriseAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: ERROR_STATUS[error.code] ?? 502 }
      );
    }
    return NextResponse.json({ error: "邀请失败，请稍后重试" }, { status: 502 });
  }
}
