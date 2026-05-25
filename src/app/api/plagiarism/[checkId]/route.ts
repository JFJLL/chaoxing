import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

type RouteContext = { params: Promise<{ checkId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await requireUser();
  const { checkId } = await context.params;
  const check = await db.plagiarismCheck.findFirst({ where: { id: checkId, ownerId: user.id } });
  return check ? NextResponse.json({ check, report: check.reportJson ? JSON.parse(check.reportJson) : null }) : NextResponse.json({ error: "检测不存在" }, { status: 404 });
}
