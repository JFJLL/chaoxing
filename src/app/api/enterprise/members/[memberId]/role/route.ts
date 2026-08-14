import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { z } from "zod";
import {
  ENTERPRISE_ROLES,
  EnterpriseAccessError,
  setEnterpriseMemberRole
} from "@/lib/zovii/enterprise";

const roleSchema = z.object({
  role: z.enum(ENTERPRISE_ROLES, { message: "不支持的企业角色" }),
  confirm: z.boolean({ message: "需要二次确认" }),
  operationId: z.string().min(16, "操作标识无效").max(64, "操作标识无效")
});

const ERROR_STATUS: Record<string, number> = {
  NOT_AUTHORIZED: 403,
  NOT_CONFIGURED: 403,
  NOT_ENTERPRISE_MEMBER: 409,
  CONFIRM_REQUIRED: 409,
  OPERATION_IN_FLIGHT: 409,
  RATE_LIMITED: 429,
  ZOVII_ERROR: 502
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ memberId: string }> }
) {
  const user = await requireUser();
  const { memberId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const parsed = roleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "输入有误" },
      { status: 400 }
    );
  }

  try {
    const result = await setEnterpriseMemberRole(user, { memberId, ...parsed.data });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof EnterpriseAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: ERROR_STATUS[error.code] ?? 502 }
      );
    }
    return NextResponse.json({ error: "角色修改失败，请稍后重试" }, { status: 502 });
  }
}
