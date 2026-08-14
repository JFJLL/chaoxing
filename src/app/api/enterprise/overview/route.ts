import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { EnterpriseAccessError, getEnterpriseOverview } from "@/lib/zovii/enterprise";

export async function GET() {
  const user = await requireUser();
  try {
    const overview = await getEnterpriseOverview(user);
    return NextResponse.json(overview);
  } catch (error) {
    if (error instanceof EnterpriseAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "NOT_AUTHORIZED" ? 403 : 502 }
      );
    }
    return NextResponse.json({ error: "加载企业概览失败，请稍后重试" }, { status: 502 });
  }
}
