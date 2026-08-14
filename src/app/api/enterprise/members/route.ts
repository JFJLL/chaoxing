import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  EnterpriseAccessError,
  listEnterpriseMembers
} from "@/lib/zovii/enterprise";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const searchParams = request.nextUrl.searchParams;
  const page = Number(searchParams.get("page") ?? "1");
  const limit = Number(searchParams.get("limit") ?? "20");
  const search = searchParams.get("search") ?? "";

  try {
    const result = await listEnterpriseMembers(user, {
      page: Number.isFinite(page) ? page : 1,
      limit: Number.isFinite(limit) ? limit : 20,
      search
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EnterpriseAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "NOT_AUTHORIZED" || error.code === "NOT_CONFIGURED" ? 403 : 502 }
      );
    }
    return NextResponse.json({ error: "加载成员失败，请稍后重试" }, { status: 502 });
  }
}
