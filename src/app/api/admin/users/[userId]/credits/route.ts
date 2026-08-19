import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { adjustCreditsByAdministrator, CreditError } from "@/lib/billing/credit-service";
import { db } from "@/lib/db";
import { requireAdministrator } from "@/lib/permissions";

type RouteContext = { params: Promise<{ userId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const administrator = await requireUser();
  try {
    requireAdministrator(administrator);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无权调账" }, { status: 403 });
  }
  const { userId } = await context.params;
  try {
    const body = await request.json() as { delta?: unknown; reason?: unknown };
    const delta = typeof body.delta === "number" ? body.delta : Number(body.delta);
    const reason = typeof body.reason === "string" ? body.reason : "";
    const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true } });
    if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    if (target.id === administrator.id) return NextResponse.json({ error: "不允许通过后台调账修改自己的积分" }, { status: 400 });
    const account = await adjustCreditsByAdministrator({
      administratorId: administrator.id,
      userId: target.id,
      delta,
      reason,
      referenceId: randomUUID()
    });
    return NextResponse.json({ user: target, account: { available: account.available, reserved: account.reserved } });
  } catch (error) {
    if (error instanceof CreditError) return NextResponse.json({ code: error.code, error: error.message }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "积分调账失败" }, { status: 400 });
  }
}
