import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCreditAccountSummary } from "@/lib/billing/credit-service";

export async function GET() {
  const user = await requireUser();
  if (user.role !== "TEACHER") {
    return NextResponse.json({ error: "仅教师账户可以使用积分服务" }, { status: 403 });
  }
  const { account } = await getCreditAccountSummary(user.id);
  return NextResponse.json({
    account: {
      available: account.available,
      reserved: account.reserved,
      updatedAt: account.updatedAt.toISOString()
    }
  });
}
