import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { EnterpriseAccessError, listEnterpriseOperations } from "@/lib/zovii/enterprise";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "10");
  try {
    const result = await listEnterpriseOperations(user, {
      limit: Number.isFinite(limit) ? limit : 10
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EnterpriseAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "NOT_AUTHORIZED" || error.code === "NOT_CONFIGURED" ? 403 : 502 }
      );
    }
    return NextResponse.json({ error: "加载操作记录失败，请稍后重试" }, { status: 502 });
  }
}
